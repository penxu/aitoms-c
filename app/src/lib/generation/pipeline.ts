import { runDiscussionStage, confirmedRequirement, discussionStore } from "./discussion";
import {collectSource} from "@/lib/packages/source";
import fs from "node:fs";
import {resolveInsideProject} from "@/lib/workspace/paths";
import {validateAcceptance} from "./acceptance";
import {requiredSpecRoutes,validatePlan} from "./plan-schema";
import { recoverInterruptedGenerations } from "./recovery";
import { config } from "@/lib/config";
import { acquireProjectMutation } from "@/lib/workspace/mutations";
import { withDeadline } from "./deadline";
import { recordProgress } from "./progress";
import { getModelConfigurationError } from "./model-configuration";
import { prepareCandidate } from "./candidate-snapshot";
import { getRuntimePort, pinServiceToSnapshot } from "@/lib/runner";
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
import { ScaffoldConflictError, scaffoldProject, listTemplateFiles } from "./scaffold";

/**
 * 阶段编排器：后台 job 串起 DISCUSS → SCAFFOLD → SPEC → PLAN → BUILD → VERIFY。
 * 讨论等待用户时终止 job，答案通过事务确认后从同一 run 恢复。
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
  discuss: runDiscussionStage,
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
function loadPlanFromDisk(projectId: string): GenerationPlan {
  const abs=resolveInsideProject(projectId,".atoms/PLAN.json");
  if(!fs.existsSync(abs)||fs.statSync(abs).size>500_000) throw new Error("缺少有效实现计划，请从计划阶段继续");
  let parsed:GenerationPlan;
  try {parsed=JSON.parse(fs.readFileSync(abs,"utf8"));}catch{throw new Error("实现计划文件不完整，请从计划阶段继续");}
  const validation=validatePlan(parsed,[...new Set([...listTemplateFiles(),...collectSource(resolveInsideProject(projectId,".")).map(file=>file.path)])]);
  const errors=[...validation.errors];
  if(parsed.acceptance) errors.push(...validateAcceptance(parsed.acceptance));
  let spec="";try{spec=readFile(projectId,".atoms/SPEC.md");}catch{}
  for(const route of requiredSpecRoutes(spec))if(!parsed.pages?.includes(route))errors.push(`缺少需求页面 ${route}`);
  if(errors.length)throw new Error(`实现计划已失效，请从计划阶段继续：${errors.join("；")}`);
  return parsed;
}

function summaryText(projectId: string, plan: GenerationPlan | null, runId: string): string {
  const count = plan ? plan.items.length : 0;
  let businessVerified = false;
  try { businessVerified = JSON.parse(readFile(projectId, ".atoms/VERIFICATION.json")).businessVerified === true; } catch { /* 旧工程可能尚无报告。 */ }
  return [
    businessVerified ? "工程生成、技术检查和计划内业务验收已完成：" : "工程生成与技术检查完成，业务验收尚未完成：",
    `- ${STAGE_ROLES.spec.name}（${STAGE_ROLES.spec.title}）完成需求拆解；`,
    `- ${STAGE_ROLES.plan.name}（${STAGE_ROLES.plan.title}）产出 ${count} 个文件的实现计划；`,
    `- ${STAGE_ROLES.build.name}（${STAGE_ROLES.build.title}）完成全部文件实现；`,
    `- ${STAGE_ROLES.verify.name}（${STAGE_ROLES.verify.title}）${businessVerified ? "通过生产构建、真实浏览器和计划内业务验收；外部服务及公网访问仍需确认。" : "通过生产构建与预览健康检查；完整业务流程仍需验证。"}`,
    "验证报告：.atoms/VERIFICATION.json（已自动检查与待人工验证清单）",
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

  let pinned = false;

  for (let index = startIndex; index < STAGE_ORDER.length; index += 1) {
    const stage = STAGE_ORDER[index];

    if (signal.aborted) {
      finish("cancelled");
      return;
    }

    if (stage !== "discuss" && !pinned) {
      await withDeadline(signal, config.generationStageTimeoutMs, async pinSignal => {
        pinSignal.throwIfAborted();
        await pinServiceToSnapshot(projectId, async () => {
          const candidate = await prepareCandidate(projectId, `${run.id}-baseline`, pinSignal);
          pinSignal.throwIfAborted();
          return candidate;
        });
        pinSignal.throwIfAborted();
      });
      pinned = true;
    }
    updateGenerationRun(run.id, { stage });
    bus.emit({ type: "stage", stage, status: "running" });
    const startedAt = Date.now();

    const ctx: StageContext = {
      projectId,
      runId: run.id,
      requirement: confirmedRequirement(run.id, run.requirement),
      signal,
      emit: (event: GenerationEventPayload) => { recordProgress(run.id, stage); bus.emit(event); },
      log: (level, message) => { recordProgress(run.id, stage); bus.emit({ type: "log", level, message }); },
      plan,
    };

    recordProgress(run.id, stage);
    const heartbeat = setInterval(() => recordProgress(run.id, stage, false), 5000);
    heartbeat.unref();
    let result: StageResult;
    try {
      result = await withDeadline(signal, config.generationStageTimeoutMs, stageSignal => STAGE_RUNNERS[stage]({ ...ctx, signal: stageSignal }));
    } catch (error) {
      if (signal.aborted) {
        finish("cancelled");
        return;
      }
      if (error instanceof ScaffoldConflictError) {
        bus.emit({ type: "stage", stage, status: "failed", error: "目录已有内容" });
        finish("failed", "该项目已有文件，请在对话中继续修改");
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      bus.emit({ type: "stage", stage, status: "failed", error: message });
      finish("failed", message);
      return;
    } finally { clearInterval(heartbeat); }

    if (signal.aborted || result.error === "cancelled") {
      finish("cancelled");
      return;
    }

    if(result.waiting){
      bus.emit({type:"run",status:"waiting"});
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
      if(stage!=="discuss") await commitAll(projectId, `feat(gen): ${stage}`);
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
      role: "assistant",
      parts: [{ type: "text", text: summaryText(projectId, plan, run.id) }],
    });
  } catch (error) {
    console.error("[generation] 摘要消息写入失败", error);
  }
}

export async function startGeneration(
  input: StartGenerationInput,
): Promise<{ run: GenerationRunRow; reused: boolean }> {
  discussionStore();
  recoverInterruptedGenerations();
  const active = getActiveGenerationRun(input.projectId);
  if (active) return { run: active, reused: true };

  const configurationError = getModelConfigurationError();
  if (configurationError) throw new Error(configurationError.error);
  if (input.resumeFrom && !STAGE_ORDER.includes(input.resumeFrom)) throw new Error("无效的恢复阶段");

  let requirement = input.requirement.trim();
  if (!requirement && input.resumeFrom) {
    // 续跑允许只传 resumeFrom：沿用上一次 run 的需求
    requirement = getLatestGenerationRun(input.projectId)?.requirement ?? "";
  }
  if (!requirement) throw new Error("缺少需求描述");

  const previous = input.resumeFrom ? getLatestGenerationRun(input.projectId) : undefined;
  const releaseMutation = acquireProjectMutation(input.projectId, "generation");
  let run: GenerationRunRow;
  try { run = createGenerationRun({
    projectId: input.projectId,
    requirement,
    stage: input.resumeFrom ?? "discuss",
  }); } catch (error) { releaseMutation(); throw error; }

  // 并发触发时可能拿到别人刚创建的 run
  if (jobs.has(input.projectId) || getGenerationRun(run.id)?.status !== "running") {
    releaseMutation();
    return { run, reused: true };
  }

  if(previous&&previous.requirement===requirement){
    try{discussionStore().copyAnswers(previous.id,run.id);}catch(error){releaseMutation();updateGenerationRun(run.id,{status:"failed",error:"恢复讨论记录失败",finishedAt:new Date()});throw error;}
  }
  launchRun(run,releaseMutation);
  return {run,reused:false};
}

function launchRun(run:GenerationRunRow, releaseMutation:()=>void):void {
  try { updateProjectStatus(run.projectId, "generating"); } catch (error) {
    updateGenerationRun(run.id,{status:"failed",error:"无法更新项目状态，请重试",finishedAt:new Date()});
    releaseMutation(); throw error;
  }
  const controller = new AbortController();
  const promise = executeRun(run, controller.signal)
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      try {
        const latest = getGenerationRun(run.id);
        if (latest?.status === "running") {
          updateGenerationRun(run.id, { status: "failed", error: message, finishedAt: new Date() });
          updateProjectStatus(run.projectId, "error");
          getEventBus(run.id).emit({ type: "run", status: "failed" });
        }
      } catch {
        /* 兜底失败不再抛出 */
      }
      console.error("[generation] 生成任务异常", error);
    })
    .finally(() => {
      releaseMutation();
      jobs.delete(run.projectId);
      releaseEventBus(run.id);
    });

  jobs.set(run.projectId, { runId: run.id, controller, promise });
}

/** 提交同一任务的版本化答案；等待时没有悬挂的后台任务。 */
export async function answerGeneration(input:{projectId:string;runId:string;version:number;answers:unknown;useRecommended:boolean}):Promise<{run:GenerationRunRow;reused:boolean}> {
  const prior=getGenerationRun(input.runId);
  if(!prior||prior.projectId!==input.projectId)throw new Error("讨论任务不存在");
  const job=jobs.get(input.projectId);
  if(prior.status==="waiting"&&job)await job.promise;
  // 同一进程内同步的租约+事务建立唯一恢复边界。
  if(getGenerationRun(input.runId)?.status==="running"){
    const receipt=discussionStore().answer(input.runId,input.version,input.answers,input.useRecommended);
    return {run:getGenerationRun(input.runId)!,reused:receipt.reused};
  }
  const release=acquireProjectMutation(input.projectId,"generation-resume");
  try {
    const receipt=discussionStore().answer(input.runId,input.version,input.answers,input.useRecommended);
    const run=getGenerationRun(input.runId)!;
    if(receipt.reused){release();return {run,reused:true};}
    launchRun(run,release);
    return {run,reused:false};
  } catch(error){release();throw error;}
}

export function cancelGeneration(projectId: string): boolean {
  const job = jobs.get(projectId);
  if (job) {
    job.controller.abort();
    if(getActiveGenerationRun(projectId)?.status!=="waiting") return true;
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
