import { appendGenerationEvent, listGenerationEvents } from "@/lib/db/generation";
import { STAGE_ROLES } from "./types";
import type { GenerationEventPayload, GenerationStage } from "./types";

/**
 * 进程内事件总线：把阶段事件写入数据库并同步广播给订阅者。
 * 客户端断开只取消订阅，不影响 job 本身。
 */

declare global {
  var __atomsEventBuses: Map<string, GenerationEventBus> | undefined;
}

const buses: Map<string, GenerationEventBus> =
  globalThis.__atomsEventBuses ?? new Map<string, GenerationEventBus>();
globalThis.__atomsEventBuses = buses;

type Listener = (event: GenerationEventPayload) => void;

function describe(event: GenerationEventPayload, stage: GenerationStage): string {
  const role = STAGE_ROLES[stage];
  switch (event.type) {
    case "stage":
      if (event.status === "running") return `${role.title} 开始 ${stage} 阶段`;
      if (event.status === "done") {
        const seconds = event.durationMs ? (event.durationMs / 1000).toFixed(1) : null;
        return `${role.title} 完成 ${stage} 阶段${seconds ? `（${seconds}s）` : ""}`;
      }
      return `${role.title} 的 ${stage} 阶段失败：${event.error ?? "未知错误"}`;
    case "file":
      if (event.status === "writing") return `写入 ${event.path}`;
      if (event.status === "done") return `已写入 ${event.path}`;
      return `写入失败 ${event.path}：${event.error ?? "未知错误"}`;
    case "log":
      return event.message;
    case "run":
      return `生成状态更新：${event.status}`;
  }
}

function levelOf(event: GenerationEventPayload): "info" | "warn" | "error" | "file" {
  if (event.type === "file") return "file";
  if (event.type === "log") return event.level;
  if (event.type === "stage" && event.status === "failed") return "error";
  if (event.type === "run" && (event.status === "failed" || event.status === "interrupted")) return "error";
  return "info";
}

export class GenerationEventBus {
  private listeners = new Set<Listener>();
  private stage: GenerationStage = "scaffold";

  constructor(private readonly runId: string) {}

  emit(event: GenerationEventPayload): void {
    if (event.type === "stage") this.stage = event.stage;

    try {
      appendGenerationEvent({
        runId: this.runId,
        stage: this.stage,
        level: levelOf(event),
        message: describe(event, this.stage),
        payload: event,
      });
    } catch (error) {
      // 事件落库失败不应中断生成
      console.error("[generation] 事件写入失败", error);
    }

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[generation] 事件订阅者异常", error);
      }
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 从数据库重放历史事件 */
  history(): GenerationEventPayload[] {
    return listGenerationEvents(this.runId)
      .map((row) => row.payload)
      .filter((payload): payload is GenerationEventPayload => {
        return typeof payload === "object" && payload !== null && "type" in payload;
      });
  }

  close(): void {
    this.listeners.clear();
  }
}

export function getEventBus(runId: string): GenerationEventBus {
  const existing = buses.get(runId);
  if (existing) return existing;
  const bus = new GenerationEventBus(runId);
  buses.set(runId, bus);
  return bus;
}

export function findEventBus(runId: string): GenerationEventBus | undefined {
  return buses.get(runId);
}

export function releaseEventBus(runId: string): void {
  const bus = buses.get(runId);
  if (!bus) return;
  bus.close();
  buses.delete(runId);
}
