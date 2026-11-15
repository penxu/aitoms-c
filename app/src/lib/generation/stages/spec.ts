import { config } from "@/lib/config";
import { generateText } from "ai";
import { getModel } from "@/lib/ai/model";
import { addRunTokens } from "@/lib/db/generation";
import { writeFile } from "@/lib/workspace/files";
import { SPEC_SYSTEM_PROMPT, specUserPrompt } from "../prompts";
import { validateSpec } from "../spec-schema";
import type { StageContext, StageResult } from "../types";

export const SPEC_PATH = ".atoms/SPEC.md";

/** 单次调用模型并累计 token 消耗 */
async function generateSpec(ctx: StageContext, prompt: string): Promise<string> {
  const result = await generateText({
    model: getModel("spec"),
    system: SPEC_SYSTEM_PROMPT,
    prompt,
    temperature: 0.2,
    abortSignal: ctx.signal,
      timeout: { totalMs: config.generationModelTimeoutMs, firstChunkMs: config.modelFirstChunkTimeoutMs, chunkMs: config.modelChunkTimeoutMs },
  });
  addRunTokens(ctx.runId, {
    input: result.usage.inputTokens,
    output: result.usage.outputTokens,
  });
  return result.text;
}

/**
 * SPEC 阶段：把一句需求整理成结构化的 .atoms/SPEC.md。
 * 校验失败时带错误原因重试一次；仍失败则给出可解释的失败信息（保留已生成产物）。
 */
export async function runSpecStage(ctx: StageContext): Promise<StageResult> {
  const path = SPEC_PATH;
  ctx.emit({ type: "file", path, status: "writing" });
  ctx.log("info", "产品经理 Emma 开始梳理需求规格");

  if (ctx.signal.aborted) {
    ctx.emit({ type: "file", path, status: "failed", error: "cancelled" });
    return { ok: false, error: "cancelled" };
  }

  let text: string;
  try {
    text = await generateSpec(ctx, specUserPrompt(ctx.requirement));
  } catch (error) {
    if (ctx.signal.aborted) {
      ctx.emit({ type: "file", path, status: "failed", error: "cancelled" });
      return { ok: false, error: "cancelled" };
    }
    const message = error instanceof Error ? error.message : String(error);
    ctx.emit({ type: "file", path, status: "failed", error: message });
    return { ok: false, error: `SPEC 生成失败：${message}` };
  }

  let validation = validateSpec(text, { delivery: true });
  if (!validation.ok) {
    ctx.log("warn", `SPEC 校验未通过，重试一次：${validation.errors.join("；")}`);
    if (ctx.signal.aborted) {
      ctx.emit({ type: "file", path, status: "failed", error: "cancelled" });
      return { ok: false, error: "cancelled" };
    }
    try {
      text = await generateSpec(
        ctx,
        `${specUserPrompt(ctx.requirement)}\n\n上一版规格缺少以下内容，请补齐后重新输出完整规格：\n${validation.errors
          .map((e) => `- ${e}`)
          .join("\n")}`,
      );
    } catch (error) {
      if (ctx.signal.aborted) {
        ctx.emit({ type: "file", path, status: "failed", error: "cancelled" });
        return { ok: false, error: "cancelled" };
      }
      const message = error instanceof Error ? error.message : String(error);
      ctx.emit({ type: "file", path, status: "failed", error: message });
      return { ok: false, error: `SPEC 生成失败：${message}` };
    }
    validation = validateSpec(text, { delivery: true });
  }

  if (!validation.ok) {
    const reason = `需求过于模糊：${validation.errors.join("；")}`;
    ctx.emit({ type: "file", path, status: "failed", error: reason });
    return { ok: false, error: reason };
  }

  if (ctx.signal.aborted) return { ok: false, error: "cancelled" };

  try {
    writeFile(ctx.projectId, path, text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.emit({ type: "file", path, status: "failed", error: message });
    return { ok: false, error: `SPEC 写入失败：${message}` };
  }

  ctx.emit({ type: "file", path, status: "done" });
  ctx.log("info", "需求规格已保存到 .atoms/SPEC.md");
  return { ok: true };
}
