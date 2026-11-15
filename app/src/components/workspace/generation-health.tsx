import { generationHealth, STAGE_LABEL } from "./generation-presentation";
import type { GenerationView } from "./generation-timeline";

/** 普通用户只看到等待与连接情况，不显示服务器进程等实现细节。 */
export function GenerationHealthNotice({ view }: { view: GenerationView }) {
  const health = generationHealth(view.status, view.progress, view.observedAt ?? 0, view.progressUnavailable);
  if (!health) return null;
  const warning = ["stale", "waiting", "unavailable"].includes(health.state);
  return (
    <div role="status" className={`my-3 rounded-lg border px-3 py-2 text-[12px] leading-relaxed ${warning ? "border-amber-200 bg-amber-50 text-amber-900" : "border-black/8 bg-black/3 text-black/55"}`}>
      {view.progress?.phase && <p>当前阶段：{STAGE_LABEL[view.progress.phase]}</p>}
      <p>{health.recentProgress}{health.state === "normal" && " · 任务状态正常更新"}</p>
      {health.detail && <p className="mt-1">{health.detail}</p>}
    </div>
  );
}
