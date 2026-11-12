import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai/model";
import { config } from "@/lib/config";
import { addRunTokens } from "@/lib/db/generation";
import { getRuntimePort, restartService, startService, stopService } from "@/lib/runner";
import { runCommand } from "@/lib/workspace/command";
import { REPAIR_SYSTEM_PROMPT, repairUserPrompt } from "../prompts";
import { isSafePlanPath } from "../plan-schema";
import { listTemplateFiles, restoreNodeModulesCache, saveNodeModulesCache } from "../scaffold";
import type { StageContext, StageResult } from "../types";
import { writeFileAtomic } from "./build";

/** 安装/构建超时（10 分钟） */
const INSTALL_TIMEOUT_MS = 600_000;
const BUILD_TIMEOUT_MS = 600_000;
/** 交给修复流程的错误日志长度 */
const ERROR_TAIL_CHARS = 6000;
/** 修复轮数上限 */
const MAX_REPAIR_ROUNDS = 3;

const zodRepairSchema = z.object({
  files: z.array(z.object({ path: z.string(), content: z.string() })),
});

/** 轮询项目健康检查；返回是否在超时前就绪 */
export async function waitForHealth(
  port: number,
  timeoutMs = 60_000,
  basePath = "",
): Promise<boolean> {
  const url = `http://127.0.0.1:${port}${basePath}/api/health`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) return true;
    } catch {
      /* 服务尚未起来，继续等待 */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

type AttemptResult =
  | { status: "ok" }
  | { status: "aborted" }
  | { status: "failed"; log: string };

function tail(text: string): string {
  const value = text.trim();
  return value.length <= ERROR_TAIL_CHARS ? value : value.slice(value.length - ERROR_TAIL_CHARS);
}

function errorLogOf(stdout: string, stderr: string): string {
  return tail(stderr.trim() ? stderr : stdout);
}

/** 安装依赖：优先命中模板 node_modules 缓存 */
async function installDependencies(ctx: StageContext): Promise<AttemptResult> {
  if (await restoreNodeModulesCache(ctx.projectId)) {
    ctx.log("info", "命中模板依赖缓存，跳过安装");
    return { status: "ok" };
  }

  ctx.log("info", "安装依赖（pnpm install --prefer-offline）");
  const result = await runCommand(
    ctx.projectId,
    `pnpm install --prefer-offline --config.store-dir="${config.pnpmStoreDir}"`,
    { timeoutMs: INSTALL_TIMEOUT_MS, signal: ctx.signal },
  );
  if (result.aborted) return { status: "aborted" };
  if (result.exitCode !== 0) {
    return { status: "failed", log: `[pnpm install]\n${errorLogOf(result.stdout, result.stderr)}` };
  }

  await saveNodeModulesCache(ctx.projectId);
  return { status: "ok" };
}

/** 构建并启动服务，最后探活 /api/health */
async function buildAndStart(ctx: StageContext): Promise<AttemptResult> {
  ctx.emit({ type: "stage", stage: "verify", status: "running" });

  ctx.log("info", "执行 pnpm build");
  const build = await runCommand(ctx.projectId, "pnpm build", {
    timeoutMs: BUILD_TIMEOUT_MS,
    signal: ctx.signal,
  });
  if (build.aborted) return { status: "aborted" };
  if (build.exitCode !== 0) {
    return { status: "failed", log: `[pnpm build]\n${errorLogOf(build.stdout, build.stderr)}` };
  }

  ctx.log("info", "启动项目并等待健康检查");
  try {
    if (getRuntimePort(ctx.projectId) !== null) {
      await restartService(ctx.projectId);
    } else {
      await startService(ctx.projectId);
    }
  } catch (error) {
    return {
      status: "failed",
      log: `[start]\n${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const port = getRuntimePort(ctx.projectId);
  if (port === null) {
    return { status: "failed", log: "[start]\n服务未分配端口" };
  }

  const healthy = await waitForHealth(port, 60_000, `/p/${ctx.projectId}`);
  if (!healthy) {
    // 停止失败的实例，下一轮修复后重新启动
    stopService(ctx.projectId);
    return { status: "failed", log: `[health]\n服务启动后 60 秒内 /api/health 未就绪（端口 ${port}）` };
  }

  return { status: "ok" };
}

/** 让模型根据错误日志产出修复文件并写入 */
async function repair(ctx: StageContext, log: string): Promise<AttemptResult> {
  const plan = ctx.plan;
  const allowed = new Set<string>([
    ...(plan ? plan.items.map((item) => item.path) : []),
    ...listTemplateFiles(),
  ]);
  const planSummary = plan
    ? plan.items.map((item) => `- ${item.path}（${item.purpose}）`).join("\n")
    : "（无计划信息）";

  try {
    const result = await generateObject({
      model: getModel("repair"),
      schema: zodRepairSchema,
      system: REPAIR_SYSTEM_PROMPT,
      prompt: repairUserPrompt({ errorLog: tail(log), planSummary }),
      temperature: 0.2,
      abortSignal: ctx.signal,
    });
    addRunTokens(ctx.runId, {
      input: result.usage.inputTokens,
      output: result.usage.outputTokens,
    });

    let written = 0;
    for (const file of result.object.files) {
      if (!isSafePlanPath(file.path) || !allowed.has(file.path)) {
        ctx.log("warn", `忽略修复建议中的非法或计划外路径：${file.path}`);
        continue;
      }
      ctx.emit({ type: "file", path: file.path, status: "writing" });
      try {
        writeFileAtomic(ctx.projectId, file.path, file.content);
        ctx.emit({ type: "file", path: file.path, status: "done" });
        written += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.emit({ type: "file", path: file.path, status: "failed", error: message });
      }
    }

    if (written === 0) return { status: "failed", log };
    ctx.log("info", `已应用 ${written} 个文件的修复`);
    return { status: "ok" };
  } catch (error) {
    if (ctx.signal.aborted) return { status: "aborted" };
    ctx.log("warn", `自动修复失败：${error instanceof Error ? error.message : String(error)}`);
    return { status: "failed", log };
  }
}

/**
 * VERIFY 阶段：安装依赖 → 构建 → 启动 → 探活。
 * 失败时把错误日志交给模型修复，最多 3 轮；成功后服务保持运行。
 */
export async function runVerifyStage(ctx: StageContext): Promise<StageResult> {
  if (ctx.signal.aborted) return { ok: false, error: "cancelled" };

  let installed = false;

  for (let round = 0; round <= MAX_REPAIR_ROUNDS; round += 1) {
    if (ctx.signal.aborted) return { ok: false, error: "cancelled" };

    if (!installed) {
      const prep = await installDependencies(ctx);
      if (prep.status === "aborted") return { ok: false, error: "cancelled" };
      if (prep.status === "ok") {
        installed = true;
      } else {
        ctx.log("warn", `依赖安装失败：${prep.log.split("\n").slice(0, 3).join(" ")}`);
        if (round === MAX_REPAIR_ROUNDS) return { ok: false, error: `依赖安装失败：${prep.log}` };
        const fixed = await repair(ctx, prep.log);
        if (fixed.status === "aborted") return { ok: false, error: "cancelled" };
        continue;
      }
    }

    const attempt = await buildAndStart(ctx);
    if (attempt.status === "aborted") return { ok: false, error: "cancelled" };
    if (attempt.status === "ok") {
      ctx.log("info", "项目已通过构建并通过健康检查");
      return { ok: true };
    }

    ctx.log("warn", `构建或启动失败：${attempt.log.split("\n").slice(0, 3).join(" ")}`);
    if (round === MAX_REPAIR_ROUNDS) {
      return { ok: false, error: `构建或启动失败：${attempt.log}` };
    }

    ctx.log("info", `进入第 ${round + 1} 轮自动修复`);
    const fixed = await repair(ctx, attempt.log);
    if (fixed.status === "aborted") return { ok: false, error: "cancelled" };
  }

  return { ok: false, error: "构建或启动失败：修复轮次已用尽" };
}
