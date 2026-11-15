import {sourceSyntaxErrors} from "../source-syntax";
import { getApplicationProfile } from "../application-profile";
import { fileCheckpoints } from "../checkpoint-context";
import { checkpointHash } from "../file-checkpoints";
import { dependencyContext } from "../dependency-context";
import fs from "node:fs";
import path from "node:path";
import { streamText } from "ai";
import { getModel } from "@/lib/ai/model";
import { config } from "@/lib/config";
import { addRunTokens } from "@/lib/db/generation";
import { resolveInsideProject } from "@/lib/workspace/paths";
import { consumeTextPreview } from "../stream-preview";
import { BUILD_SYSTEM_PROMPT, buildFilePrompt } from "../prompts";
import { stripCodeFence } from "../model-output";
import { checkTemplateContract } from "../contracts";
import { normalizeSource } from "../source-normalize";
import type { PlanItem, StageContext, StageResult } from "../types";

/** SPEC 注入 BUILD 时的截断长度 */
const MAX_SPEC_CHARS = 30000;
/** 源码完整读取上限；超限明确失败，不把截断内容当成文件版本。 */
const MAX_SOURCE_BYTES = 500_000;
/** 模板基础文件：模型必须沿用其中的导出与类型，不能凭空发明 */
const FOUNDATION_FILES = ["lib/db/index.ts", "lib/db/schema.ts", "lib/api-path.ts"];

/** 去除模型整体包裹的 Markdown 代码围栏 */
export { stripCodeFence };

/** 模板契约：允许模型改写这些文件，但不得破坏关键导出与探活接口 */
export { checkTemplateContract };

/** 原子写入：先写临时文件再 rename，避免中断留下半个文件 */
export function writeFileAtomic(projectId: string, relPath: string, content: string): void {
  const abs = resolveInsideProject(projectId, relPath, { allowMissing: true });
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.atoms-tmp`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, abs);
}

function tryRead(projectId: string, relPath: string): string | null {
  try {
    const abs = resolveInsideProject(projectId, relPath, { allowMissing: true });
    if (fs.statSync(abs).size > MAX_SOURCE_BYTES) throw new Error(`${relPath} 超过源码读取上限 ${MAX_SOURCE_BYTES} 字节`);
    const content = fs.readFileSync(abs, "utf8");
    if (Buffer.byteLength(content) > MAX_SOURCE_BYTES) throw new Error(`${relPath} 超过源码读取上限 ${MAX_SOURCE_BYTES} 字节`);
    return content;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function collectDependencies(ctx: StageContext, item: PlanItem): { path: string; content: string }[] {
  const deps: { path: string; content: string }[] = [];
  let budget = 400000;
  for (const dep of item.dependsOn) {
    if (budget <= 0) throw new Error("依赖契约上下文超过预算，请拆分当前文件计划，禁止省略后续依赖");
    const content = tryRead(ctx.projectId, dep);
    if (content === null) throw new Error(`依赖文件缺失：${dep}，请先完成该文件`);
    const sliced = dependencyContext(content, dep);
    deps.push({ path: dep, content: sliced });
    budget -= sliced.length;
  }
  return deps;
}

function collectFoundation(
  projectId: string,
  selfPath: string,
): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  for (const rel of FOUNDATION_FILES) {
    if (rel === selfPath) continue;
    const content = tryRead(projectId, rel);
    if (content === null) continue;
    files.push({ path: rel, content: dependencyContext(content, rel) });
  }
  return files;
}

async function generateFile(
  ctx: StageContext,
  item: PlanItem,
  spec: string,
  conventions: string,
  hint?: string,
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const currentContent = tryRead(ctx.projectId, item.path) ?? undefined;
  const rules = hint
    ? `${conventions}\n\n## 上一次输出被拒绝\n${hint}\n请修正后重新输出完整文件。`
    : conventions;

  try {
    // 使用流式输出：正在写入的代码即时进入事件流，UI 与生成进度同步
    const result = streamText({
      model: getModel("build"),
      system: BUILD_SYSTEM_PROMPT,
      prompt: buildFilePrompt({
        acceptance: JSON.stringify(ctx.plan?.acceptance ?? []),
        profile: JSON.stringify(getApplicationProfile(ctx.requirement)),
        path: item.path,
        action: item.action,
        purpose: item.purpose,
        spec,
        conventions: rules,
        dependencies: collectDependencies(ctx, item),
        currentContent,
        foundation: collectFoundation(ctx.projectId, item.path),
      }),
      temperature: 0.3,
      abortSignal: ctx.signal,
      timeout: { totalMs: config.generationModelTimeoutMs, firstChunkMs: config.modelFirstChunkTimeoutMs, chunkMs: config.modelChunkTimeoutMs },
    });
    const content = await consumeTextPreview({
      path: item.path,
      stream: result.textStream,
      signal: ctx.signal,
      emit: (event) => ctx.emit(event),
      normalize: stripCodeFence,
    });
    const usage = await result.usage;
    addRunTokens(ctx.runId, {
      input: usage.inputTokens,
      output: usage.outputTokens,
    });
    return { ok: true, content };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * BUILD 阶段：按计划顺序逐文件生成并写入。
 * 每个文件最多尝试 2 次；全部条目处理完后返回失败清单，由编排器决定是否进入 VERIFY。
 */
export async function runBuildStage(ctx: StageContext): Promise<StageResult> {
  const plan = ctx.plan;
  if (!plan) return { ok: false, error: "缺少实现计划" };

  const spec = (tryRead(ctx.projectId, ".atoms/SPEC.md") ?? "").slice(0, MAX_SPEC_CHARS);
  const conventions = tryRead(ctx.projectId, ".atoms/CONVENTIONS.md") ?? "";

  const failures: string[] = [];
  const checkpoints = fileCheckpoints();
  const planHash = checkpointHash(JSON.stringify({ plan, requirement: ctx.requirement }));

  for (const item of plan.items) {
    if (ctx.signal.aborted) return { ok: false, error: "cancelled" };

    if (item.dependsOn.some(dep => failures.includes(dep))) {
      failures.push(item.path);ctx.emit({ type: "file", path: item.path, status: "failed", error: "上游文件生成失败，已跳过" });continue;
    }
    const inputHash = checkpointHash(JSON.stringify({ version: 2, item, spec, conventions, acceptance:ctx.plan?.acceptance, foundation:collectFoundation(ctx.projectId,item.path), dependencies: item.dependsOn.map(dep => [dep, tryRead(ctx.projectId, dep)]) }));
    const expectedContent = tryRead(ctx.projectId, item.path);
    const checkpoint = checkpoints.inspect(ctx.projectId, planHash, item.path, inputHash, expectedContent);
    if (checkpoint === "conflict") return { ok: false, error: `${item.path} 在上次生成后已被修改，已保留现有代码；请在对话中继续处理` };
    if (checkpoint === "reuse") { ctx.log("info", `复用已完成文件：${item.path}`);ctx.emit({ type: "file", path: item.path, status: "done" });continue; }
    ctx.emit({ type: "file", path: item.path, status: "writing" });

    let lastError = "";
    let content: string | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (ctx.signal.aborted) return { ok: false, error: "cancelled" };

      const generated = await generateFile(ctx, item, spec, conventions, attempt > 0 ? lastError : undefined);
      if (ctx.signal.aborted) return { ok: false, error: "cancelled" };

      if (!generated.ok) {
        lastError = generated.error;
        ctx.log("warn", `${item.path} 生成失败（第 ${attempt + 1} 次）：${generated.error}`);
        continue;
      }

      // 写入前归一 UI 约定：shadcn 风格的变体与默认导入都会让 tsc 整轮失败
      const normalized = normalizeSource(item.path, generated.content);
      if (normalized.notes.length > 0) {
        ctx.log("info", `${item.path} 自动归一 UI 约定：${normalized.notes.join("，")}`);
      }

      const syntaxErrors=sourceSyntaxErrors(item.path,normalized.content);
      if(syntaxErrors.length){lastError=`生成代码存在语法错误：${syntaxErrors.join("；")}`;ctx.log("warn",lastError);continue;}
      const violation = checkTemplateContract(item.path, normalized.content);
      if (violation) {
        lastError = violation;
        ctx.log("warn", `${item.path} 破坏模板契约（第 ${attempt + 1} 次）：${violation}`);
        continue;
      }

      try {
        if (ctx.signal.aborted) return { ok: false, error: "cancelled" };
        if (tryRead(ctx.projectId, item.path) !== expectedContent) {
          return { ok: false, error: `${item.path} 在生成期间已被修改或删除，已保留现有内容；请重新读取后继续` };
        }
        // 比较与写入之间不让出事件循环，旧模型输出不能覆盖新文件版本。
        writeFileAtomic(ctx.projectId, item.path, normalized.content);
        content = normalized.content;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        ctx.log("warn", `${item.path} 写入失败（第 ${attempt + 1} 次）：${lastError}`);
      }
    }

    if (content === null) {
      ctx.emit({ type: "file", path: item.path, status: "failed", error: lastError });
      failures.push(item.path);
      continue;
    }

    checkpoints.save(ctx.projectId, planHash, item.path, inputHash, content, ctx.runId);
    ctx.emit({ type: "file", path: item.path, status: "done" });
  }

  if (failures.length > 0) {
    return { ok: false, error: `以下文件写入失败：${failures.join(", ")}` };
  }
  return { ok: true };
}
