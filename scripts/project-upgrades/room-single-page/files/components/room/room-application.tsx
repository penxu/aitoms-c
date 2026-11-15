"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { Button } from "@/components/ui/button";
import { apiPath } from "@/lib/api-path";
import type { CatalogStats, ProjectWithFurnitureCount } from "@/lib/room/queries";
import type { ProjectDetail } from "@/lib/room/types";

const loadStudio = () => import("@/components/studio/studio-client").then(module => module.StudioClient);
class EditorBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div role="alert"><p>编辑器加载失败，已保存的布局仍保留。</p><Button onClick={this.props.onRetry}>重试加载编辑器</Button></div> : this.props.children; }
}
const WORKSPACE_PATH = apiPath("/").replace(/\/$/, "") || "/";
type View = "home" | "projects" | number;
function parseView(value: string): { view: View; creating: boolean } {
  if (/^#?\/?(?:projects\/)?new$/.test(value)) return { view: "home", creating: true };
  const match = value.match(/^#?\/?projects\/(\d+)$/);
  if (match && Number.isSafeInteger(Number(match[1])) && Number(match[1]) > 0) return { view: Number(match[1]), creating: false };
  return { view: value.includes("projects") ? "projects" : "home", creating: false };
}
function hashFor(view: View) { return typeof view === "number" ? `#/projects/${view}` : view === "projects" ? "#/projects" : "#/"; }

export function RoomApplication({ initialProjects, stats, initialError, initialTotal, initialPath = "/" }: {
  initialProjects: ProjectWithFurnitureCount[]; stats: CatalogStats; initialError?: string; initialTotal?: number; initialPath?: string;
}) {
  const initial = parseView(initialPath);
  const [view, setViewState] = useState<View>(initial.view);
  const viewRef = useRef<View>(initial.view);
  const setView = useCallback((next: View) => { viewRef.current = next; setViewState(next); }, []);
  const [projects, setProjects] = useState(initialProjects);
  const [total, setTotal] = useState(initialTotal ?? initialProjects.length);
  const [error, setError] = useState(initialError ?? "");
  const [loadingList, setLoadingList] = useState(false);
  const [creating, setCreating] = useState(initial.creating);
  const [formVersion, setFormVersion] = useState(0);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [retry, setRetry] = useState(0);
  const Studio = useMemo(() => dynamic(loadStudio, {
    ssr: false, loading: () => <p role="status">正在加载房间编辑器…</p>,
  }), [retry]);
  const [dirty, setDirtyState] = useState(false);
  const dirtyRef = useRef(false);
  const setDirty = useCallback((next: boolean) => { dirtyRef.current = next; setDirtyState(next); }, []);
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const listRequest = useRef(0);

  useEffect(() => {
    function restore() {
      const target = parseView(window.location.hash || initialPath);
      if (dirtyRef.current && target.view !== viewRef.current && !window.confirm("房间布局尚未保存，确定离开吗？")) { history.replaceState(null, "", WORKSPACE_PATH + hashFor(viewRef.current)); return; }
      if (target.view !== viewRef.current) setDirty(false);
      setView(target.view); setCreating(target.creating);
    }
    if (!window.location.hash) history.replaceState(null, "", WORKSPACE_PATH + (initial.creating ? "#/new" : hashFor(initial.view)));
    restore(); window.addEventListener("hashchange", restore);
    return () => window.removeEventListener("hashchange", restore);
  // 首次读取书签；之后的dirty/view由新的监听器读取。
  }, [initialPath, dirty, view, initial.creating, initial.view]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (creating && dialog.current && !dialog.current.open) { trigger.current = document.activeElement as HTMLElement; dialog.current.showModal(); }
    if (!creating && dialog.current?.open) { dialog.current.close(); trigger.current?.focus(); }
  }, [creating]);
  useEffect(() => {
    if (typeof view !== "number") { setDetail(null); return; }
    const controller = new AbortController();
    setDetail(null); setDetailError(""); setDirty(false);
    void fetch(apiPath(`/api/projects/${view}`), { signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "读取房间失败");
      if (!body.project || !Array.isArray(body.catalog) || !Array.isArray(body.placements)) throw Error("房间数据不完整");
      if (!controller.signal.aborted) setDetail(body);
    }).catch(reason => { if (!controller.signal.aborted) setDetailError(reason instanceof Error ? reason.message : "读取失败"); });
    editorHeading.current?.focus(); return () => controller.abort();
  }, [view, retry]);

  function navigate(next: View) {
    if (next !== viewRef.current && dirtyRef.current && !window.confirm("房间布局尚未保存，确定离开吗？")) return;
    if (next !== viewRef.current) setDirty(false);
    setView(next); setCreating(false);
    if (next === "home") void refreshProjects();
    history.pushState(null, "", WORKSPACE_PATH + hashFor(next));
  }
  function closeForm() { setCreating(false); history.replaceState(null, "", WORKSPACE_PATH + hashFor(viewRef.current)); }
  function openForm() {
    if (dirtyRef.current) {
      if (!window.confirm("房间布局尚未保存，确定放弃修改并新建吗？")) return;
      setDirty(false); setView("home");
    }
    setCreating(true); history.pushState(null, "", WORKSPACE_PATH + "#/new"); }
  const refreshProjects = useCallback(async () => {
    const request = ++listRequest.current; setLoadingList(true);
    try {
      const response = await fetch(apiPath("/api/projects")); const body = await response.json();
      if (!response.ok || !Array.isArray(body)) throw Error(body.error || "读取项目失败");
      if (request === listRequest.current) { setProjects(body); setTotal(body.length); setError(""); }
    } catch (reason) { if (request === listRequest.current) setError(reason instanceof Error ? reason.message : "读取失败"); }
    finally { if (request === listRequest.current) setLoadingList(false); }
  }, []);
  useEffect(() => { if (view === "projects") void refreshProjects(); }, [view, refreshProjects]);
  async function removeProject(id: number) {
    if (deleting !== null || !window.confirm("确定删除这个房间项目及其布局吗？")) return;
    setDeleting(id);
    try {
      const response = await fetch(apiPath(`/api/projects/${id}`), { method: "DELETE" });
      if (!response.ok) { const body = await response.json(); throw Error(body.error || "删除失败"); }
      setProjects(current => current.filter(project => project.id !== id)); setTotal(value => Math.max(0, value - 1)); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "删除失败"); }
    finally { setDeleting(null); }
  }

  return <AppShell variant="admin" brand={<strong>房间布置工作台 · Room Studio</strong>}
    navigation={<div className="flex flex-wrap gap-2"><Button variant={view === "home" ? "default" : "ghost"} onClick={() => navigate("home")}>首页</Button><Button variant={view === "projects" ? "default" : "ghost"} onClick={() => { navigate("projects"); }}>我的项目</Button></div>}
    actions={<Button onClick={openForm}>新建房间项目</Button>}
    footer={<p className="text-sm text-muted-foreground">数据保存在本机 SQLite；同页编辑，保存后刷新仍会保留。</p>}>
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6">
      {notice && <p role="status">{notice}</p>}
      <PageHeader title={typeof view === "number" ? (detail?.project.name ?? "房间编辑工作台") : view === "projects" ? "我的房间项目" : "先把一间房摆明白，再决定买什么"}
        description="选择真实尺寸、布置家具，在同一页完成创建、编辑和保存。" />
      {typeof view !== "number" ? <>
        {view === "home" && <section aria-label="素材统计" className="grid gap-3 sm:grid-cols-3">{[["内置素材", `${stats.total} 件`], ["素材分类", `${stats.categories.length} 类`], ["我的房间项目", `${total} 个`]].map(([label, value]) => <div key={label} className="rounded-xl border border-border bg-surface p-5"><p className="text-sm text-muted-foreground">{label}</p><strong className="text-2xl">{value}</strong></div>)}</section>}
        <section aria-labelledby="rooms-title" className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="rooms-title" className="text-xl font-semibold">{view === "home" ? "最近编辑的房间" : "全部房间项目"}</h2><Button variant="outline" onClick={() => void refreshProjects()} disabled={loadingList}>{loadingList ? "刷新中…" : "刷新项目列表"}</Button></div>
          {error && <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => void refreshProjects()}>重试读取项目</Button></div>}
          {projects.length === 0 ? <div className="rounded-xl border border-dashed border-border p-8"><h3>还没有房间项目</h3><p className="my-3 text-muted-foreground">新建一个房间开始布置。</p><Button onClick={openForm}>新建第一个房间</Button></div> : <div className="grid gap-4 md:grid-cols-2">{(view === "home" ? projects.slice(0, 3) : projects).map(project => <article key={project.id} className="grid gap-3 rounded-xl border border-border bg-surface p-5"><h3 className="text-lg font-semibold">{project.name}</h3><p>{project.roomType} · {project.widthCm} × {project.depthCm} 厘米 · {project.furnitureCount} 件家具</p><div className="flex gap-2"><Button onClick={() => navigate(project.id)} aria-label={`打开${project.name}`}>打开工作台</Button><Button variant="outline" disabled={deleting !== null} onClick={() => void removeProject(project.id)} aria-label={`删除${project.name}`}>{deleting === project.id ? "删除中…" : "删除"}</Button></div></article>)}</div>}
        </section>
        {view === "home" && <section className="rounded-xl border border-border bg-surface p-5"><h2 className="mb-3 text-lg font-semibold">内置素材分类</h2><ul className="flex flex-wrap gap-3">{stats.categories.map(category => <li key={category.category}>{category.category} · {category.count} 件</li>)}</ul></section>}
      </> : <section aria-label="房间编辑器" className="grid gap-4"><h2 ref={editorHeading} tabIndex={-1} className="text-lg font-semibold">{dirty ? "布局有未保存的修改" : "布置你的房间"}</h2>
        {detailError ? <div role="alert"><p>{detailError}</p><Button onClick={() => setRetry(value => value + 1)}>重试读取房间</Button></div> : !detail || detail.project.id !== view ? <p role="status">正在读取房间布局…</p> : <EditorBoundary key={`${view}-${retry}`} onRetry={() => setRetry(value => value + 1)}><Studio key={view} detail={detail} onDirtyChange={setDirty} /></EditorBoundary>}
      </section>}
    </div>
    <dialog ref={dialog} aria-labelledby="create-room-title" onCancel={() => closeForm()} onClose={() => setCreating(false)} style={{width:"min(44rem, calc(100% - 2rem))"}} className="m-auto max-h-[90dvh] overflow-y-auto rounded-2xl border border-border bg-surface p-5 text-foreground backdrop:bg-black/40">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 id="create-room-title" className="text-xl font-semibold">新建房间项目</h2><Button variant="ghost" onClick={closeForm} aria-label="收起新建表单">关闭</Button></div>
      <ProjectForm key={formVersion} onCancel={closeForm} onCreated={id => { const stillOpen = dialog.current?.open; closeForm(); setFormVersion(value => value + 1); if (stillOpen) navigate(id); else setNotice("房间已创建，可从我的项目打开。"); void refreshProjects(); }} />
    </dialog>
  </AppShell>;
}
