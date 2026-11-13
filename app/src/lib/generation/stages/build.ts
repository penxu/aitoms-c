import fs from "node:fs";
import path from "node:path";
import { generateText } from "ai";
import { getModel } from "@/lib/ai/model";
import { config } from "@/lib/config";
import { addRunTokens } from "@/lib/db/generation";
import { readFile } from "@/lib/workspace/files";
import { resolveInsideProject } from "@/lib/workspace/paths";
import { BUILD_SYSTEM_PROMPT, buildFilePrompt } from "../prompts";
import { stripCodeFence } from "../model-output";
import { checkTemplateContract } from "../contracts";
import type { PlanItem, StageContext, StageResult } from "../types";

/** SPEC 注入 BUILD 时的截断长度 */
const MAX_SPEC_CHARS = 6000;
/** 单个依赖文件注入长度 */
const MAX_DEP_CHARS = 4000;
/** 单个模板基础文件注入长度 */
const MAX_FOUNDATION_CHARS = 3000;
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
    return readFile(projectId, relPath);
  } catch {
    return null;
  }
}

function collectDependencies(ctx: StageContext, item: PlanItem): { path: string; content: string }[] {
  const deps: { path: string; content: string }[] = [];
  let budget = config.maxToolOutputChars;
  for (const dep of item.dependsOn) {
    if (budget <= 0) break;
    const content = tryRead(ctx.projectId, dep);
    if (content === null) continue;
    const sliced = content.slice(0, Math.min(MAX_DEP_CHARS, budget));
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
    files.push({ path: rel, content: content.slice(0, MAX_FOUNDATION_CHARS) });
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
  const currentContent = item.action === "modify" ? tryRead(ctx.projectId, item.path) ?? undefined : undefined;
  const rules = hint
    ? `${conventions}\n\n## 上一次输出被拒绝\n${hint}\n请修正后重新输出完整文件。`
    : conventions;

  try {
    const result = await generateText({
      model: getModel("build"),
      system: BUILD_SYSTEM_PROMPT,
      prompt: buildFilePrompt({
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
    });
    addRunTokens(ctx.runId, {
      input: result.usage.inputTokens,
      output: result.usage.outputTokens,
    });
    return { ok: true, content: stripCodeFence(result.text) };
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

  for (const item of plan.items) {
    if (ctx.signal.aborted) return { ok: false, error: "cancelled" };

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

      const violation = checkTemplateContract(item.path, generated.content);
      if (violation) {
        lastError = violation;
        ctx.log("warn", `${item.path} 破坏模板契约（第 ${attempt + 1} 次）：${violation}`);
        continue;
      }

      try {
        writeFileAtomic(ctx.projectId, item.path, generated.content);
        content = generated.content;
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

    ctx.emit({ type: "file", path: item.path, status: "done" });
  }

  if (failures.length > 0) {
    return { ok: false, error: `以下文件写入失败：${failures.join(", ")}` };
  }
  return { ok: true };
}
