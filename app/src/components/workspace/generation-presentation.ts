import type { GenerationEventPayload, GenerationStage } from "../../lib/generation/types.ts";

export interface CodeSnapshot { type: "code"; path: string; content: string; status: "streaming" | "complete"; totalChars?: number; totalLines?: number }
export type StudioEvent = GenerationEventPayload | CodeSnapshot;

export const PUBLIC_STAGES = [
  { id: "discuss", label: "讨论方案", detail: "分析目标并确认关键需求" },
  { id: "scaffold", label: "准备工程", detail: "初始化应用结构与运行环境" },
  { id: "spec", label: "理解需求", detail: "整理页面、核心交互与数据需求" },
  { id: "plan", label: "规划结构", detail: "制定页面结构与文件实现方案" },
  { id: "build", label: "编写代码", detail: "逐步实现页面与应用功能" },
  { id: "verify", label: "运行验证", detail: "执行构建与服务检查" },
] as const;

/** 每个阶段在界面上的一句人话说明（不用内部术语） */
export const STAGE_ACTIVITY: Record<GenerationStage, string> = {
  discuss: "正在分析需求与关键决策",
  scaffold: "正在准备工程骨架与运行环境",
  spec: "正在理解需求，整理页面与交互",
  plan: "正在规划页面结构与文件方案",
  build: "正在逐个文件编写代码",
  verify: "正在安装依赖、构建并检查服务",
};

export const STAGE_LABEL: Record<GenerationStage, string> = {
  discuss: "需求讨论",
  scaffold: "准备工程",
  spec: "理解需求",
  plan: "规划结构",
  build: "编写代码",
  verify: "运行验证",
};

export interface PlanPreview {
  pages: string[];
  items: { path: string; purpose: string }[];
  degraded: boolean;
}

export interface Activity {
  /** 一句话说明现在正在发生什么 */
  title: string;
  /** 可选的补充信息，例如文件名或行数 */
  detail?: string;
  stage: GenerationStage | null;
}

/** 首次输入必须走分阶段生成；只有已完成后才允许对话式修改 */
export function inputDestination(modelConfigured: boolean, canGenerate: boolean): "disabled" | "generate" | "chat" {
  if (!modelConfigured) return "disabled";
  return canGenerate ? "generate" : "chat";
}

/** 按文件保留最新一次累计快照，重试会覆盖旧内容而不是叠加 */
export function latestCodeSnapshots(events: readonly StudioEvent[]): CodeSnapshot[] {
  const files = new Map<string, CodeSnapshot>();
  for (const event of events) if (event.type === "code") { files.delete(event.path); files.set(event.path, event); }
  return [...files.values()];
}

/** 最近一次执行计划；没有则返回 null */
export function latestPlan(events: readonly StudioEvent[]): PlanPreview | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === "plan") {
      return { pages: event.pages, items: event.items, degraded: Boolean(event.degraded) };
    }
  }
  return null;
}

/** 已写入完成的文件（去重，保持写入顺序） */
export function writtenFiles(events: readonly StudioEvent[]): string[] {
  const done = new Set<string>();
  const failed = new Set<string>();
  for (const event of events) {
    if (event.type !== "file") continue;
    if (event.status === "done") { done.add(event.path); failed.delete(event.path); }
    if (event.status === "failed") { failed.add(event.path); done.delete(event.path); }
  }
  return [...done];
}

function baseName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

/**
 * 从真实事件流推导“正在做什么”，用于替换笼统的“思考中”。
 * 只依赖已发生的事件，不猜测模型内部状态。
 */
export function currentActivity(events: readonly StudioEvent[], stageHint?: string | null): Activity | null {
  // 已结束的文件不能再被当作“正在写入”
  const settled = new Set<string>();
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event.type === "file" && event.status !== "writing") {
      settled.add(event.path);
      continue;
    }
    if (event.type === "code" && event.status === "complete") {
      settled.add(event.path);
      continue;
    }

    if (event.type === "code" && event.status === "streaming" && !settled.has(event.path)) {
      const lines = event.totalLines ?? event.content.split("\n").length;
      return {
        title: `正在写入 ${baseName(event.path)}`,
        detail: `${event.path} · 已生成 ${lines} 行`,
        stage: "build",
      };
    }

    if (event.type === "file" && event.status === "writing" && !settled.has(event.path)) {
      return { title: `正在写入 ${baseName(event.path)}`, detail: event.path, stage: "build" };
    }

    if (event.type === "stage" && event.status === "running") {
      return { title: STAGE_ACTIVITY[event.stage], stage: event.stage };
    }

    if (event.type === "plan") {
      return {
        title: "正在按计划编写代码",
        detail: `共 ${event.items.length} 个文件待实现`,
        stage: "build",
      };
    }

    if (event.type === "log" && event.level !== "info") {
      return { title: event.message, stage: stageHint ? (stageHint as GenerationStage) : null };
    }
  }

  if (stageHint) {
    const stage = stageHint as GenerationStage;
    if (stage in STAGE_ACTIVITY) return { title: STAGE_ACTIVITY[stage], stage };
  }
  return null;
}

/** 阶段状态表：后到的事件覆盖先到的 */
export function stageStates(events: readonly StudioEvent[]): Record<GenerationStage, "pending" | "running" | "done" | "failed"> {
  const state: Record<GenerationStage, "pending" | "running" | "done" | "failed"> = {
    discuss: "pending",
    scaffold: "pending",
    spec: "pending",
    plan: "pending",
    build: "pending",
    verify: "pending",
  };
  for (const event of events) {
    if (event.type === "stage") state[event.stage] = event.status;
  }
  return state;
}

/** 进度占比：用于简洁的进度条，完成阶段数 / 总阶段数 */
export function stageProgress(events: readonly StudioEvent[]): { done: number; total: number } {
  const state = stageStates(events);
  const ids = PUBLIC_STAGES.map((stage) => stage.id);
  return { done: ids.filter((id) => state[id] === "done").length, total: ids.length };
}

/** 历史失败只在服务未恢复时占据预览；执行记录可由用户单独打开。 */
export function shouldShowGenerationTimeline(streaming: boolean, status: string | undefined, running: boolean): boolean {
  return streaming || status === "running" || (Boolean(status) && status !== "ready" && !running);
}

/** 只有空白的新工程可以进入一句话生成；失败续跑由明确的重试按钮发起。 */
export function canStartInitialGeneration(hasExistingWork: boolean, status?: string): boolean {
  return !hasExistingWork && !status;
}

export interface GenerationProgress {
  phase: GenerationStage | null;
  heartbeatAt: number | null;
  lastProgressAt: number | null;
}

/** 服务端进程标识只供运维使用，不进入用户视图状态。 */
export function publicGenerationProgress(input: unknown): GenerationProgress | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const timestamp = (field: unknown) => typeof field === "number" && Number.isFinite(field) && field > 0 ? field : null;
  return {
    phase: typeof value.phase === "string" && Object.hasOwn(STAGE_LABEL, value.phase) ? value.phase as GenerationStage : null,
    heartbeatAt: timestamp(value.heartbeatAt),
    lastProgressAt: timestamp(value.lastProgressAt),
  };
}

export interface GenerationHealth {
  state: "normal" | "starting" | "waiting" | "stale" | "unavailable";
  recentProgress: string;
  detail?: string;
}

/** 心跳只证明任务状态仍在更新；等待时长不能推断任务失败。 */
export function generationHealth(status: string, progress: GenerationProgress | null | undefined, now: number, unavailable = false): GenerationHealth | null {
  if (status !== "running") return null;
  const elapsed = progress?.lastProgressAt ? Math.max(0, now - progress.lastProgressAt) : null;
  const age = elapsed === null ? null : elapsed < 5000 ? "刚刚" : elapsed < 60000 ? `${Math.floor(elapsed / 1000)}秒前` : `${Math.floor(elapsed / 60000)}分钟前`;
  const recentProgress = age ? `最近进展：${age}` : "正在等待首次进展";
  if (unavailable) return { state: "unavailable", recentProgress, detail: "暂时无法同步任务状态，任务可能仍在继续。请检查连接，或停止后从当前阶段重试。" };
  if (!progress?.heartbeatAt) return { state: "starting", recentProgress };
  if (Math.max(0, now - progress.heartbeatAt) >= 30000) return { state: "stale", recentProgress, detail: "任务状态已超过30秒未更新，暂时无法确认是否仍在运行。可以继续等待，或停止后从当前阶段重试。" };
  if (elapsed !== null && elapsed >= 120000) return { state: "waiting", recentProgress, detail: "任务状态仍在更新，但较长时间没有新进展。模型响应或构建可能需要更久，可以继续等待，或停止后从当前阶段重试。" };
  return { state: "normal", recentProgress };
}

/** 仅串行读取状态，不建立事件订阅；卸载时取消请求及下一轮轮询。 */
export function pollGenerationStatus<T>(options: {
  load: (signal: AbortSignal) => Promise<T | null>;
  receive: (value: T) => void;
  unavailable: () => void;
}, schedule: (tick: () => void, delay: number) => () => void = (tick, delay) => {
  const timer = setTimeout(tick, delay);
  return () => clearTimeout(timer);
}): () => void {
  const controller = new AbortController();
  let cancelTimer: (() => void) | undefined;
  const tick = async () => {
    try {
      const result = await options.load(controller.signal);
      if (controller.signal.aborted) return;
      if (result === null) options.unavailable();
      else options.receive(result);
    } catch {
      if (!controller.signal.aborted) options.unavailable();
    } finally {
      if (!controller.signal.aborted) cancelTimer = schedule(() => { void tick(); }, 5000);
    }
  };
  void tick();
  return () => { controller.abort(); cancelTimer?.(); };
}
