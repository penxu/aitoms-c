import { getRuntimePort } from "@/lib/runner";
import { appendMessage, getOrCreateMainThread, updateProjectStatus } from "@/lib/db/queries";
import {
  createGenerationRun,
  getActiveGenerationRun,
  getGenerationRun,
  getLatestGenerationRun,
  listGenerationEvents,
  updateGenerationRun,
} from "@/lib/db/generation";
import type { GenerationRunRow } from "@/lib/db/generation";
import { readFile } from "@/lib/workspace/files";
import { findEventBus, getEventBus, releaseEventBus } from "./events";
import { commitAll } from "./git";
import { STAGE_ORDER, STAGE_ROLES } from "./types";
import type {
  GenerationEventPayload,
  GenerationPlan,
  GenerationStage,
  StageContext,
  StageResult,
} from "./types";
import { runBuildStage } from "./stages/build";
import { runPlanStage } from "./stages/plan";
import { runSpecStage } from "./stages/spec";
import { runVerifyStage } from "./stages/verify";
import { ScaffoldConflictError, scaffoldProject } from "./scaffold";

/**
 * 阶段编排器：后台 job 串起 SCAFFOLD → SPEC → PLAN → BUILD → VERIFY。
 * job 注册表挂在 globalThis，避免 dev 热更新丢状态。
 */

export interface StartGenerationInput {
  projectId: string;
  requirement: string;
  resumeFrom?: GenerationStage;
}

interface GenerationJob {
  runId: string;
  controller: AbortController;
  promise: Promise<void>;
}

declare global {
  var __atomsGenerationJobs: Map<string, GenerationJob> | undefined;
}

const jobs: Map<string, GenerationJob> =
  globalThis.__atomsGenerationJobs ?? new Map<string, GenerationJob>();
globalThis.__atomsGenerationJobs = jobs;

const STAGE_RUNNERS: Record<GenerationStage, (ctx: StageContext) => Promise<StageResult>> = {
  scaffold: async (ctx) => {
    const result = await scaffoldProject(ctx.projectId);
    ctx.log("info", `工程骨架已就绪（${result.action}，${result.filesWritten} 个文件）`);
    return { ok: true };
  },
  spec: runSpecStage,
  plan: runPlanStage,
  build: runBuildStage,
  verify: runVerifyStage,
};

/** 续跑时从磁盘恢复计划（BUILD / VERIFY 依赖） */
function loadPlanFromDisk(projectId: string): GenerationPlan | null {
  try {
    const raw = readFile(projectId, ".atoms/PLAN.json");
    const parsed = JSON.parse(raw) as GenerationPlan;
    return Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}

function summaryText(projectId: string, plan: GenerationPlan | null, runId: string): string {
  const count = plan ? plan.items.length : 0;
  return [
    "生成完成，团队交付摘要：",
    `- ${STAGE_ROLES.spec.name}（${STAGE_ROLES.spec.title}）完成需求拆解；`,
    `- ${STAGE_ROLES.plan.name}（${STAGE_ROLES.plan.title}）产出 ${count} 个文件的实现计划；`,
    `- ${STAGE_ROLES.build.name}（${STAGE_ROLES.build.title}）完成全部文件实现；`,
    `- ${STAGE_ROLES.verify.name}（${STAGE_ROLES.verify.title}）验收通过（构建 + 健康检查）。`,
    `预览：/p/${projectId}/`,
    `导出：/api/projects/${projectId}/export`,
    `任务编号：${runId}`,
  ].join("\n");
}

async function executeRun(run: GenerationRunRow, signal: AbortSignal): Promise<void> {
  const bus = getEventBus(run.id);
  const projectId = run.projectId;
  const startIndex = Math.max(0, STAGE_ORDER.indexOf(run.stage));
  let plan: GenerationPlan | null =
    startIndex > STAGE_ORDER.indexOf("plan") ? loadPlanFromDisk(projectId) : null;

  const finish = (status: "ready" | "failed" | "cancelled", error?: string) => {
    updateGenerationRun(run.id, {
      status,
      error: error ?? null,
      finishedAt: new Date(),
    });
    updateProjectStatus(projectId, status === "ready" ? "ready" : "error");
    bus.emit({
      type: "run",
      status,
      previewUrl: status === "ready" ? `/p/${projectId}/` : null,
    });
    releaseEventBus(run.id);
  };

  for (let index = startIndex; index < STAGE_ORDER.length; index += 1) {
    const stage = STAGE_ORDER[index];

    if (signal.aborted) {
      finish("cancelled");
      return;
    }

    updateGenerationRun(run.id, { stage });
    bus.emit({ type: "stage", stage, status: "running" });
    const startedAt = Date.now();

    const ctx: StageContext = {
      projectId,
      runId: run.id,
      requirement: run.requirement,
      signal,
      emit: (event: GenerationEventPayload) => bus.emit(event),
      log: (level, message) => bus.emit({ type: "log", level, message }),
      plan,
    };

    let result: StageResult;
    try {
      result = await STAGE_RUNNERS[stage](ctx);
    } catch (error) {
      if (error instanceof ScaffoldConflictError) {
        bus.emit({ type: "stage", stage, status: "failed", error: "目录已有内容" });
        finish("failed", "该项目已有文件，请在对话中继续修改");
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      bus.emit({ type: "stage", stage, status: "failed", error: message });
      finish("failed", message);
      return;
    }

    if (signal.aborted || result.error === "cancelled") {
      finish("cancelled");
      return;
    }

    if (!result.ok) {
      const message = result.error ?? "阶段执行失败";
      bus.emit({ type: "stage", stage, status: "failed", error: message });
      finish("failed", message);
      return;
    }

    if (stage === "plan" && result.plan) plan = result.plan;

    // 每阶段成功提交一次，保证产物可追溯、可续跑
    try {
      await commitAll(projectId, `feat(gen): ${stage}`);
    } catch (error) {
      ctx.log("warn", `阶段提交失败（不影响继续生成）：${error instanceof Error ? error.message : String(error)}`);
    }

    bus.emit({ type: "stage", stage, status: "done", durationMs: Date.now() - startedAt });

    if (signal.aborted) {
      finish("cancelled");
      return;
    }
  }

  finish("ready");

  try {
    const threadId = getOrCreateMainThread(projectId);
    appendMessage({
      id: `msg_${run.id}_summary`,
      threadId,
      projectId,
      role: "system",
      parts: [{ type: "text", text: summaryText(projectId, plan, run.id) }],
    });
  } catch (error) {
    console.error("[generation] 摘要消息写入失败", error);
  }
}

export async function startGeneration(
  input: StartGenerationInput,
): Promise<{ run: GenerationRunRow; reused: boolean }> {
  const active = getActiveGenerationRun(input.projectId);
  if (active) return { run: active, reused: true };

  let requirement = input.requirement.trim();
  if (!requirement && input.resumeFrom) {
    // 续跑允许只传 resumeFrom：沿用上一次 run 的需求
    requirement = getLatestGenerationRun(input.projectId)?.requirement ?? "";
  }
  if (!requirement) throw new Error("缺少需求描述");

  const run = createGenerationRun({
    projectId: input.projectId,
    requirement,
    stage: input.resumeFrom ?? "scaffold",
  });

  // 并发触发时可能拿到别人刚创建的 run
  if (jobs.has(input.projectId) || getGenerationRun(run.id)?.status !== "running") {
    return { run, reused: true };
  }

  updateProjectStatus(input.projectId, "generating");
  const controller = new AbortController();
  const promise = executeRun(run, controller.signal)
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      try {
        const latest = getGenerationRun(run.id);
        if (latest?.status === "running") {
          updateGenerationRun(run.id, { status: "failed", error: message, finishedAt: new Date() });
          updateProjectStatus(input.projectId, "error");
          getEventBus(run.id).emit({ type: "run", status: "failed" });
        }
      } catch {
        /* 兜底失败不再抛出 */
      }
      console.error("[generation] 生成任务异常", error);
    })
    .finally(() => {
      jobs.delete(input.projectId);
      releaseEventBus(run.id);
    });

  jobs.set(input.projectId, { runId: run.id, controller, promise });
  return { run, reused: false };
}

export function cancelGeneration(projectId: string): boolean {
  const job = jobs.get(projectId);
  if (job) {
    job.controller.abort();
    return true;
  }

  // 进程重启后的残留 running：直接标记取消
  const active = getActiveGenerationRun(projectId);
  if (active) {
    updateGenerationRun(active.id, { status: "cancelled", finishedAt: new Date() });
    updateProjectStatus(projectId, "error");
    getEventBus(active.id).emit({ type: "run", status: "cancelled" });
    releaseEventBus(active.id);
    return true;
  }
  return false;
}

export function isGenerationRunning(projectId: string): boolean {
  return jobs.has(projectId) || getActiveGenerationRun(projectId) !== undefined;
}

/** 订阅 run 事件：有活动总线则实时订阅，否则只回放历史 */
export function subscribeRun(runId: string, listener: (event: GenerationEventPayload) => void): () => void {
  const bus = findEventBus(runId);
  if (bus) return bus.subscribe(listener);

  for (const row of listGenerationEvents(runId)) {
    const payload = row.payload;
    if (typeof payload === "object" && payload !== null && "type" in payload) {
      listener(payload as GenerationEventPayload);
    }
  }
  return () => {};
}

/** 预览地址（VERIFY 成功后服务保持运行） */
export function previewUrl(projectId: string): string | null {
  return getRuntimePort(projectId) === null ? null : `/p/${projectId}/`;
}
