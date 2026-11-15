"use client";
import { AlertCircle, Check, ChevronRight, FileCheck2, ListTree, LoaderCircle, Sparkles } from "lucide-react";
import {
  PUBLIC_STAGES,
  STAGE_LABEL,
  currentActivity,
  latestPlan,
  stageProgress,
  stageStates,
  writtenFiles,
  hasGeneratedCode,
  type StudioEvent,
} from "./generation-presentation";
import { GenerationHealthNotice } from "./generation-health";
import type { GenerationView } from "./generation-timeline";

const STATE_LABEL: Record<string, string> = {
  pending: "待开始",
  running: "进行中",
  done: "完成",
  failed: "失败",
};

export function GenerationSummary({ view, events, onOpenProcess, onCancel, onRetry }: {
  view: GenerationView | null;
  events: StudioEvent[];
  onOpenProcess?: () => void;
  onCancel?: () => void;
  onRetry?: () => void;
}) {
  if (!view) return null;

  const running = view.status === "running";
  const failed = ["failed", "interrupted", "cancelled"].includes(view.status);
  const codeGenerated = hasGeneratedCode(view);
  const stages = stageStates(events, view.stage);
  const progress = stageProgress(events, view.stage);
  const activity = running ? currentActivity(events, view.stage) : null;
  const plan = latestPlan(events);
  const files = writtenFiles(events);
  const assessment=events.filter(event=>event.type==="assessment").at(-1);
  const logs = events.filter((event) => event.type === "log").slice(-2);

  return (
    <div className="generation-summary">
      <div className="summary-heading">
        <span className="studio-avatar"><Sparkles size={15} /></span>
        <div className="summary-heading-text">
          <strong>{codeGenerated ? (running ? "代码已生成，正在准备运行与验证" : "代码已生成，运行验证尚未完成") : running ? "正在把想法变成应用" : failed ? "这一步需要处理" : "应用预览已就绪"}</strong>
          <span>{codeGenerated ? "源码已保存，可查看和下载；重试验证无需重新生成代码" : running ? "以下是真实执行进度" : failed ? "文件与执行记录已保留，可从失败阶段重试" : "可以打开预览，继续打磨细节"}</span>
        </div>
        {running ? <LoaderCircle size={15} className="animate-spin" /> : failed ? <AlertCircle size={16} /> : <Check size={16} />}
      </div>

      {activity && (
        <p className="summary-activity" role="status">
          <span className="summary-activity-dot" />
          <span className="summary-activity-title">{activity.title}</span>
          {activity.detail && <code>{activity.detail}</code>}
        </p>
      )}

      {assessment?.type==="assessment"&&<div className="discussion-known"><strong>需求理解</strong><p>{assessment.summary}</p>{assessment.known.map((item,i)=><p key={i}><Check size={12}/>{item}</p>)}</div>}
      <GenerationHealthNotice view={view} />

      <div className="summary-progress" aria-hidden>
        <span style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} data-state={failed ? "failed" : "running"} />
      </div>

      <ol className="summary-stages">
        {PUBLIC_STAGES.map((stage) => {
          const state = stages[stage.id];
          return (
            <li key={stage.id} data-state={state}>
              <span className="summary-stage-icon">
                {state === "done" ? <Check size={12} /> : state === "running" ? <LoaderCircle size={12} className="animate-spin" /> : state === "failed" ? <AlertCircle size={12} /> : <span />}
              </span>
              <div>
                <strong>{stage.label}</strong>
                {state === "running" && <p>{stage.detail}</p>}
              </div>
              <span className="summary-stage-state">{STATE_LABEL[state]}</span>
            </li>
          );
        })}
      </ol>

      {plan && (
        <details className="summary-plan" open={running || undefined}>
          <summary>
            <ListTree size={13} />
            {plan.degraded ? "执行计划（降级为最小方案）" : `执行计划 · ${plan.items.length} 个文件`}
            <ChevronRight size={12} />
          </summary>
          {plan.pages.length > 0 && (
            <p className="summary-plan-pages">
              {plan.pages.map((page) => <span key={page}>{page}</span>)}
            </p>
          )}
          <ul>
            {plan.items.map((item) => (
              <li key={item.path}>
                <Check size={11} className={files.includes(item.path) ? "" : "is-pending"} />
                <code>{item.path}</code>
                <span>{item.purpose}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {files.length > 0 && (
        <details className="summary-files">
          <summary><FileCheck2 size={13} />已写入 {files.length} 个文件<ChevronRight size={12} /></summary>
          <ul>{files.map((path) => <li key={path}><Check size={11} /><code>{path}</code></li>)}</ul>
        </details>
      )}

      {logs.length > 0 && (
        <div className="summary-logs">
          {logs.map((event, index) => (
            <p key={index} data-level={event.type === "log" ? event.level : "info"}>{event.type === "log" ? event.message : ""}</p>
          ))}
        </div>
      )}

      {view.error && <p className="summary-error" role="alert">{view.error}</p>}

      <div className="summary-actions">
        {onOpenProcess && <button onClick={onOpenProcess}>查看代码与执行记录 <ChevronRight size={12} /></button>}
        {running && onCancel && <button onClick={onCancel}>停止生成</button>}
        {failed && onRetry && <button onClick={onRetry}>{codeGenerated ? "仅重试运行验证" : `从${view.stage ? `「${STAGE_LABEL[view.stage as keyof typeof STAGE_LABEL] ?? view.stage}」` : "当前"}阶段重试`}</button>}
      </div>
    </div>
  );
}
