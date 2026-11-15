"use client";

import { downloadProject } from "./download-project";
import { useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpRight, CheckCircle2, Clock3, Globe2, LoaderCircle, Package, Rocket, RotateCcw, Server, AlertCircle } from "lucide-react";

interface Release { id: string; projectId: string; sourceHash: string; status: string; createdAt: number; finishedAt: number | null; error: string | null; artifactAvailable?: boolean }
interface ReleaseData { releases: Release[]; activeReleaseId: string | null; publicOrigin: string | null; productionUrl: string | null; localUrl: string; busy: boolean; productionRunning: boolean }
const labels: Record<string, string> = { queued: "等待发布", snapshotting: "固定源码版本", installing: "安装依赖", building: "生产构建", starting: "启动生产服务", checking: "检查应用健康", published: "发布完成", failed: "发布失败", interrupted: "发布已中断" };
const terminal = new Set(["published", "failed", "interrupted"]);


export function ReleasePanel({ projectId, generating }: { projectId: string; generating: boolean }) {
  const [data, setData] = useState<ReleaseData | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<{ id: number; message: string }[]>([]);
  const refresh = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/releases`, { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "无法读取发布记录");
    setData(body);
    return body as ReleaseData;
  }, [projectId]);
  useEffect(() => {
    // 串行轮询：上一次结束才排下一次，避免请求堆积耗尽浏览器连接
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = async () => {
      try {
        await refresh();
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : "读取发布记录失败");
      }
      if (!disposed) timer = setTimeout(update, 3000);
    };
    void update();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [refresh]);
  const current = data?.releases.find((r) => r.id === selected) ?? data?.releases[0];
  const currentId = current?.id;
  const currentStatus = current?.status;
  useEffect(() => {
    if (!currentId) return;
    // 同样串行轮询；进入终态后不再排下一次
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/releases/${currentId}`, { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "无法读取发布日志");
        if (!disposed) setEvents(body.events ?? []);
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : "日志读取失败");
      }
      if (!disposed && !terminal.has(currentStatus ?? "")) timer = setTimeout(update, 2000);
    };
    void update();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [projectId, currentId, currentStatus]);
  async function action(kind: "publish" | "rollback" | "source" | "deploy", id?: string) {
    setPending(kind); setError("");
    try {
      if (kind === "source" || kind === "deploy") await downloadProject(projectId, kind, id);
      else {
        const res = await fetch(`/api/projects/${projectId}/releases${kind === "rollback" ? `/${id}/rollback` : ""}`, { method: "POST" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "发布请求失败");
        setSelected(body.release.id);
        setEvents([]);
        await refresh();
      }
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败，请重试。"); }
    finally { setPending(null); }
  }
  const locked = Boolean(pending || data?.busy || generating || !data);
  const active = data?.releases.find((r) => r.id === data.activeReleaseId);
  return <div className="release-panel">
    <div className="release-heading"><div><span className="eyebrow">SHIP YOUR IDEA</span><h2>准备好，让应用出发。</h2><p>将当前代码固定为独立生产版本，后续编辑不会影响已发布应用。</p></div><Rocket size={30} /></div>
    {error && <div className="feedback-error" role="alert"><AlertCircle size={16} />{error}<button onClick={() => { setError(""); void refresh().catch((e: Error) => setError(e.message)); }}>重试</button></div>}
    <section className="release-card"><div className="release-card-title"><Server size={18} /><h3>当前生产版本</h3><span className={`release-badge ${active && data?.productionRunning ? "success" : ""}`}>{active ? data?.productionRunning ? "本机已发布" : "生产服务不可用" : "尚未发布"}</span></div>
      {active ? <><p className="release-hash">{active.sourceHash.slice(0, 12)} · {new Date(active.createdAt).toLocaleString("zh-CN")}</p><a className="release-link" href={data?.productionUrl ?? data?.localUrl} target="_blank" rel="noreferrer">打开生产应用 <ArrowUpRight size={15} /></a></> : <p>第一次发布将创建空的生产数据库。开发预览中的数据不会自动带到线上。</p>}
      <div className="release-note"><Globe2 size={16} /><span>{data?.publicOrigin ? "已配置公网地址；外部可访问性仍需从服务器之外验证。" : "当前为本地发布。配置服务器公网地址后，可进一步验证外部访问。"}</span></div>
      <button className="action-primary" disabled={locked} onClick={() => void action("publish")}>{pending === "publish" || data?.busy ? <LoaderCircle size={16} className="animate-spin" /> : <Rocket size={16} />}{data?.busy ? "发布进行中…" : generating ? "等待生成完成" : active ? "发布新版本" : "发布应用"}</button>
    </section>
    {current && <section className="release-card"><div className="release-card-title">{current.status === "published" ? <CheckCircle2 size={18} /> : current.status === "failed" || current.status === "interrupted" ? <AlertCircle size={18} /> : <LoaderCircle size={18} className="animate-spin" />}<h3>{labels[current.status] ?? current.status}</h3></div>{current.error && <p role="alert" className="text-red-600">{current.error}</p>}<div className="release-logs" role="log" aria-label="发布日志">{events.length ? events.map((event) => <div key={event.id}>{event.message}</div>) : <span>等待发布日志…</span>}</div></section>}
    <section className="release-card"><div className="release-card-title"><Clock3 size={18} /><h3>版本历史</h3></div>{!data ? <p role="status">正在读取发布记录…</p> : !data.releases.length ? <p>发布后，版本和构建记录会保存在这里。</p> : <ul className="release-history">{data.releases.map((r) => <li key={r.id}><button className="release-version" onClick={() => { setSelected(r.id); setEvents([]); }}><strong>{r.sourceHash.slice(0, 8) || r.id.slice(0, 8)}</strong><span>{labels[r.status] ?? r.status} · {new Date(r.createdAt).toLocaleString("zh-CN")}</span></button>{r.id === data.activeReleaseId ? <span className={`release-badge ${data.productionRunning ? "success" : ""}`}>{data.productionRunning ? "当前" : "服务不可用"}</span> : r.status === "published" && r.artifactAvailable === false ? <span className="release-badge">版本文件已清理</span> : r.status === "published" && <button className="action-secondary" disabled={locked} onClick={() => void action("rollback", r.id)}><RotateCcw size={14} />回滚</button>}</li>)}</ul>}<p className="release-footnote">回滚仅切换代码版本，业务数据不会随代码回滚。</p></section>
    <section className="release-card"><div className="release-card-title"><Package size={18} /><h3>带走你的应用</h3></div><p>源码草稿包含当前工程；部署包固定到成功发布的版本，含部署说明与容器配置。</p><div className="release-downloads"><button className="action-secondary" disabled={Boolean(pending)} onClick={() => void action("source")}><ArrowDownToLine size={15} />{pending === "source" ? "打包中…" : "下载源码草稿"}</button><button className="action-secondary" disabled={!active || Boolean(pending)} onClick={() => void action("deploy", active?.id)}><Package size={15} />{pending === "deploy" ? "打包中…" : "下载当前版本部署包"}</button></div></section>
  </div>;
}
