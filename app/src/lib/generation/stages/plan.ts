import {projectRoot} from "@/lib/workspace/paths";
import {collectSource} from "@/lib/packages/source";
import {collectExports} from "../source-index";
import { validateAcceptance, type AcceptanceCheck } from "../acceptance";
import { config } from "@/lib/config";
import { generateText } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai/model";
import { addRunTokens } from "@/lib/db/generation";
import { readFile, writeFile } from "@/lib/workspace/files";
import { PLAN_JSON_PATH, requiredSpecRoutes, validatePlan } from "../plan-schema";
import { extractJson } from "../model-output";
import { PLAN_SYSTEM_PROMPT, planUserPrompt } from "../prompts";
import { listTemplateFiles } from "../scaffold";
import type { GenerationPlan, StageContext, StageResult } from "../types";

const zodPlanSchema = z.object({
  acceptance: z.array(z.custom<AcceptanceCheck>()).optional(),
  pages: z.array(z.string()),
  items: z.array(
    z.object({
      path: z.string(),
      action: z.enum(["create", "modify"]),
      purpose: z.string(),
      dependsOn: z.array(z.string()),
    }),
  ),
  dataModel: z.array(
    z.object({
      table: z.string(),
      columns: z.array(z.string()),
    }),
  ),
});

/** SPEC 的读取上限：计划只需要结构与页面/数据模型信息 */
const MAX_SPEC_CHARS = 30000;

function shortenSpec(spec: string): string {
  return spec.length <= MAX_SPEC_CHARS ? spec : `${spec.slice(0, MAX_SPEC_CHARS)}\n\n... [需求规格已截断]`;
}

async function generatePlanObject(
  ctx: StageContext,
  prompt: string,
): Promise<{ ok: true; object: unknown } | { ok: false; error: string }> {
  try {
    const result = await generateText({
      model: getModel("plan"),
      system: PLAN_SYSTEM_PROMPT,
      prompt,
      temperature: 0.2,
      abortSignal: ctx.signal,
      timeout: { totalMs: config.generationModelTimeoutMs, firstChunkMs: config.modelFirstChunkTimeoutMs, chunkMs: config.modelChunkTimeoutMs },
    });
    addRunTokens(ctx.runId, {
      input: result.usage.inputTokens,
      output: result.usage.outputTokens,
    });
    const parsed = zodPlanSchema.safeParse(extractJson(result.text));
    if (!parsed.success) {
      return { ok: false, error: `结构不符：${parsed.error.issues[0]?.message ?? "未知字段错误"}` };
    }
    return { ok: true, object: parsed.data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * PLAN 阶段：把 SPEC 转成文件级计划并写入 .atoms/PLAN.json。
 * 校验失败带错误重试一次；仍失败保留需求并停止，禁止用占位计划替代需求。
 */
export async function runPlanStage(ctx: StageContext): Promise<StageResult> {
  ctx.log("info", "架构师 Bob 开始拆解文件级计划");

  if (ctx.signal.aborted) return { ok: false, error: "cancelled" };

  let spec: string;
  try {
    spec = readFile(ctx.projectId, ".atoms/SPEC.md");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `读取 SPEC 失败：${message}` };
  }

  const templateFiles = listTemplateFiles();
  const existingFiles=collectSource(projectRoot(ctx.projectId)).map(file=>file.path);
  const availableFiles=[...new Set([...templateFiles,...existingFiles])];
  const exports=collectExports(projectRoot(ctx.projectId));
  const basePrompt = planUserPrompt(shortenSpec(spec), availableFiles) + `\n\n## 当前工程真实导出（续跑应复用并保持已有调用一致，禁止重复建立不兼容的数据访问层）\n${JSON.stringify(exports)}`;

  let errors: string[] = [];
  let plan: GenerationPlan | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (ctx.signal.aborted) return { ok: false, error: "cancelled" };

    const prompt =
      attempt === 0
        ? basePrompt
        : `${basePrompt}\n\n上一版计划未通过校验，请修正以下问题后重新输出完整 JSON：\n${errors
            .map((e) => `- ${e}`)
            .join("\n")}`;

    const generated = await generatePlanObject(ctx, prompt);
    if (ctx.signal.aborted) return { ok: false, error: "cancelled" };

    if (!generated.ok) {
      errors = [`模型未返回合法 JSON：${generated.error}`];
      ctx.log("warn", `计划生成失败（第 ${attempt + 1} 次）：${generated.error}`);
      continue;
    }

    const object = generated.object as GenerationPlan;
    const acceptanceErrors = validateAcceptance(object.acceptance);
    for(const route of requiredSpecRoutes(spec)) if(!object.pages.includes(route)) acceptanceErrors.push(`计划遗漏SPEC页面 ${route}`);
    const requiredIds = [...new Set(spec.match(/AC-\d+/g) ?? [])];
    for (const id of requiredIds) if (!object.acceptance?.some(check => check.id === id)) acceptanceErrors.push(`缺少需求验收 ${id}`);
    if (acceptanceErrors.length) { errors = acceptanceErrors;ctx.log("warn", `验收计划不完整：${errors.join("；")}`);continue; }
    const validation = validatePlan(generated.object, availableFiles);
    if (validation.ok) {
      plan = generated.object as GenerationPlan;
      break;
    }
    errors = validation.errors;
    ctx.log("warn", `计划校验未通过（第 ${attempt + 1} 次）：${validation.errors.join("；")}`);
  }

  if (!plan) return { ok: false, error: `计划生成未完成，已保留需求并停止：${errors.join("；")}` };

  // 先广播计划，UI 可在写代码前展示“将要生成哪些文件”
  ctx.emit({
    type: "plan",
    pages: plan.pages,
    items: plan.items.map((item) => ({ path: item.path, purpose: item.purpose })),
    degraded: false,
  });

  ctx.emit({ type: "file", path: PLAN_JSON_PATH, status: "writing" });
  try {
    writeFile(ctx.projectId, PLAN_JSON_PATH, JSON.stringify(plan, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.emit({ type: "file", path: PLAN_JSON_PATH, status: "failed", error: message });
    return { ok: false, error: `计划写入失败：${message}` };
  }

  ctx.emit({ type: "file", path: PLAN_JSON_PATH, status: "done" });
  ctx.log("info", `计划已生成，共 ${plan.items.length} 个文件待实现`);
  return { ok: true, plan };
}
