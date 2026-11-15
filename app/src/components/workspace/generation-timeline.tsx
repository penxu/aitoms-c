"use client";
import type { DiscussionRecord } from "@/lib/generation/discussion-schema";

import { useEffect, useMemo, useRef } from "react";
import type { GenerationProgress } from "./generation-presentation";
import { GenerationHealthNotice } from "./generation-health";
import {
  STAGE_ORDER,
  STAGE_ROLES,
  type GenerationEventPayload,
  type GenerationStage,
} from "@/lib/generation/types";

export interface GenerationView {
  runId?: string;
  discussion?: DiscussionRecord | null;
  progress?: GenerationProgress | null;
  observedAt?: number;
  progressUnavailable?: boolean;
  status: string;
  stage: string | null;
  error: string | null;
}

type CardStatus = "pending" | "running" | "done" | "failed";

interface StageState {
  status: CardStatus;
  durationMs?: number;
  error?: string;
}

const STAGE_LABEL: Record<GenerationStage, string> = {
  discuss: "需求讨论",
  scaffold: "SCAFFOLD",
  spec: "SPEC",
  plan: "PLAN",
  build: "BUILD",
  verify: "VERIFY",
};

const TERMINAL_RETRYABLE = new Set(["failed", "cancelled", "interrupted"]);

/** 由事件流推导每个阶段的最终可见状态（后到的事件覆盖先到的） */
function deriveStages(events: GenerationEventPayload[]): Record<GenerationStage, StageState> {
  const state = {} as Record<GenerationStage, StageState>;
  for (const stage of STAGE_ORDER) state[stage] = { status: "pending" };
  for (const event of events) {
    if (event.type !== "stage") continue;
    state[event.stage] = {
      status: event.status,
      durationMs: event.durationMs,
      error: event.error,
    };
  }
  return state;
}

function roleCn(stage: GenerationStage): string {
  // role.title 形如 "Team Leader / 团队负责人"
  const parts = STAGE_ROLES[stage].title.split("/");
  return parts[parts.length - 1].trim();
}

function statusText(state: StageState): string {
  if (state.status === "done") {
    const seconds =
      typeof state.durationMs === "number" ? `（${(state.durationMs / 1000).toFixed(1)}s）` : "";
    return `已完成${seconds}`;
  }
  if (state.status === "running") return "进行中…";
  if (state.status === "failed") return `失败：${state.error ?? "未知错误"}`;
  return "待开始";
}

const DOT_CLASS: Record<CardStatus, string> = {
  pending: "bg-black/15",
  running: "animate-pulse bg-[#4267ff]",
  done: "bg-[#2dbb5c]",
  failed: "bg-[#e5484d]",
};

export function GenerationTimeline({
  view,
  events,
  onCancel,
  onRetry,
  onClose,
}: {
  view: GenerationView | null;
  events: GenerationEventPayload[];
  onCancel: () => void;
  onRetry: () => void;
  /** 完成后回看记录时提供“返回预览” */
  onClose?: () => void;
}) {
  const stages = useMemo(() => deriveStages(events), [events]);
  const runningStage = view?.status === "waiting" ? null : STAGE_ORDER.find((s) => stages[s].status === "running") ?? null;
  const runningRole = runningStage ? STAGE_ROLES[runningStage] : null;
  const status = view?.status ?? "running";

  const currentFile = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i];
      if (event.type === "file") return event;
    }
    return null;
  }, [events]);

  const logs = useMemo(() => {
    const out: { key: string; level: string; message: string }[] = [];
    events.forEach((event, index) => {
      if (event.type === "log") {
        out.push({ key: `log-${index}`, level: event.level, message: event.message });
      } else if (event.type === "file" && event.status === "failed") {
        out.push({
          key: `file-${index}`,
          level: "error",
          message: `${event.path} 写入失败${event.error ? `：${event.error}` : ""}`,
        });
      }
    });
    return out.slice(-200);
  }, [events]);

  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [logs.length]);

  if(status==="waiting")return <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl border border-indigo-100 bg-white p-8 text-center"><span className="text-xs font-semibold tracking-widest text-indigo-500">LET’S SHAPE YOUR IDEA</span><h2 className="text-xl font-semibold">先把关键想法聊清楚</h2><p className="max-w-sm text-sm leading-7 text-black/55">{view?.discussion?.assessment.summary??"请在对话区选择方案或补充需求，确认后继续生成。"}</p><p className="text-xs text-black/40">任务已暂停 · 等待你的选择 · 尚未开始编写代码</p><button onClick={onCancel} className="action-secondary">取消任务</button></div>;
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-black/10 bg-white">
      <div className="flex flex-none items-center gap-2 border-b border-black/8 px-4 py-2.5">
        <span className="text-[13px] font-semibold">团队协作</span>
        <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-black/50">
          {status === "running"
            ? "生成中"
            : status === "ready"
              ? "已完成"
              : status === "failed"
                ? "失败"
                : status === "cancelled"
                  ? "已取消"
                  : "已中断"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {status === "running" ? (
            <button
              onClick={onCancel}
              className="rounded-lg border border-black/10 px-3 py-1.5 text-[12px] text-[#e5484d] hover:border-[#e5484d]/40"
            >
              取消生成
            </button>
          ) : TERMINAL_RETRYABLE.has(status) ? (
            <button
              onClick={onRetry}
              className="rounded-lg bg-[#4267ff] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#2f50f0]"
            >
              从当前阶段重试
            </button>
          ) : null}
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-lg border border-black/10 px-3 py-1.5 text-[12px] text-black/60 hover:border-black/25"
            >
              返回预览
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {status === "running" ? (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-[#4267ff]/20 bg-[#4267ff]/6 px-3 py-2.5 text-[12.5px] text-[#3355e0]">
            <span className="h-1.5 w-1.5 flex-none animate-pulse rounded-full bg-[#4267ff]" />
            {runningRole ? `${runningRole.name} 正在协调团队…` : "正在协调团队…"}
          </div>
        ) : status === "failed" ? (
          <div className="mb-3 rounded-xl border border-[#e5484d]/25 bg-[#e5484d]/6 px-3 py-2.5 text-[12.5px] text-[#c53b40]">
            生成失败：{view?.error ?? "未知错误"}
          </div>
        ) : status === "cancelled" || status === "interrupted" ? (
          <div className="mb-3 rounded-xl border border-black/10 bg-black/3 px-3 py-2.5 text-[12.5px] text-black/55">
            {status === "cancelled" ? "生成已取消。" : "平台重启导致生成中断。"}
            已写入的文件会保留，可从失败阶段重试。
          </div>
        ) : null}

        {view && <GenerationHealthNotice view={view} />}

        <ul className="space-y-2">
          {STAGE_ORDER.map((stage) => {
            const role = STAGE_ROLES[stage];
            const state = stages[stage];
            return (
              <li
                key={stage}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                  state.status === "running"
                    ? "border-[#4267ff]/30 bg-[#4267ff]/4"
                    : "border-black/8 bg-white"
                }`}
              >
                <span
                  className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-[12px] font-semibold text-white ${
                    state.status === "pending"
                      ? "bg-black/20"
                      : "bg-gradient-to-br from-[#4267ff] to-[#b88ade]"
                  }`}
                >
                  {role.name.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium">
                      {roleCn(stage)} · {STAGE_LABEL[stage]}
                    </span>
                    <span className={`h-1.5 w-1.5 flex-none rounded-full ${DOT_CLASS[state.status]}`} />
                  </div>
                  <p
                    className={`truncate text-[12px] ${
                      state.status === "failed" ? "text-[#c53b40]" : "text-black/50"
                    }`}
                  >
                    {statusText(state)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>

        {currentFile ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-black/3 px-3 py-2">
            <span className="text-[11.5px] text-black/40">当前文件</span>
            <code className="truncate font-mono text-[11.5px] text-black/65">{currentFile.path}</code>
          </div>
        ) : null}

        <div
          ref={logRef}
          className="mt-3 max-h-56 min-h-[72px] overflow-y-auto rounded-lg bg-[#0d0d12] px-3 py-2 font-mono text-[11.5px] leading-relaxed"
        >
          {logs.length === 0 ? (
            <p className="text-[#8b8b9a]">等待日志…</p>
          ) : (
            logs.map((log) => (
              <p
                key={log.key}
                className={
                  log.level === "error"
                    ? "text-[#ff8a8d]"
                    : log.level === "warn"
                      ? "text-[#ffd479]"
                      : "text-[#c8c8d4]"
                }
              >
                {log.message}
              </p>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
