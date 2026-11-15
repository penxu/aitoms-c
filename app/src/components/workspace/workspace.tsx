"use client";

import { canStartInitialGeneration, shouldShowGenerationTimeline, publicGenerationProgress, pollGenerationStatus } from "./generation-presentation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { UIMessage } from "ai";
import { Monitor, Smartphone, Tablet, Rocket, Code2, Eye, RefreshCw, Download, ChevronDown, ChevronRight, FileCode2, ScrollText, X, LoaderCircle } from "lucide-react";
import { ReleasePanel } from "./release-panel";
import { downloadProject } from "./download-project";
import { ChatPanel } from "./chat-panel";
import { LiveCodeViewer } from "./live-code-viewer";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { GenerationTimeline, type GenerationView } from "./generation-timeline";
import type { GenerationEventPayload, GenerationStage } from "@/lib/generation/types";

import type { DiscussionRecord, DiscussionAnswers } from "@/lib/generation/discussion-schema";

interface GenerationResponse {
  discussion?: DiscussionRecord | null;
  run: { id: string; status: string; stage: string | null; error: string | null; requirement?: string } | null;
  progress?: unknown;
  events: { payload: GenerationEventPayload | null }[];
}

function generationSnapshot(data: GenerationResponse): GenerationView | null {
  if (!data.run) return null;
  return { discussion: data.discussion, runId: data.run.id, status: data.run.status, stage: data.run.stage, error: data.run.error,
    progress: publicGenerationProgress(data.progress), observedAt: Date.now(), progressUnavailable: false };
}

interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  children?: FileNode[];
}

interface ProjectInfo {
  id: string;
  name: string;
  status: string;
  assignedPort: number | null;
}

export function Workspace({
  project,
  initialMessages,
  hasExistingWork,
  initialQuery,
  modelConfigured,
}: {
  project: ProjectInfo;
  initialMessages: UIMessage[];
  hasExistingWork: boolean;
  initialQuery?: string;
  /** 是否配置了真实模型；未配置时阻止触发生成 */
  modelConfigured: boolean;
}) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [status, setStatus] = useState(project.status);
  const [runtimeLogs,setRuntimeLogs]=useState("");
  const [previewKey, setPreviewKey] = useState(0);
  const [running, setRunning] = useState(project.status === "running");
  const [busy, setBusy] = useState(false);
  /** 记录已完成加载的预览帧标识；标识变化即视为需要重新等待 next dev 编译 */
  const [loadedFrameKey, setLoadedFrameKey] = useState<string | null>(null);
  const previewFrameKey = `${previewKey}:${running}`;
  const [tab, setTab] = useState<"preview" | "code" | "release">("preview");
  const [mobilePane, setMobilePane] = useState<"files" | "chat" | "preview">("chat");
  const [genView, setGenView] = useState<GenerationView | null>(null);
  const [genEvents, setGenEvents] = useState<GenerationEventPayload[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [pollingGeneration, setPollingGeneration] = useState<number | null>(null);
  const generationVersion = useRef(0);
  const generationStreamActive = useRef(false);
  const generationSubscription = useRef<{ version: number; controller: AbortController } | null>(null);
  const stopGenerationSubscription = useCallback(() => {
    generationSubscription.current?.controller.abort();
    generationSubscription.current = null;
    generationStreamActive.current = false;
    setStreaming(false);
  }, []);
  const [requirement, setRequirement] = useState(initialQuery ?? "");
  const [codeMode, setCodeMode] = useState<"live" | "files">("live");
  const [recordView, setRecordView] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");

  // 同一时刻只允许一轮同步：轮询 + 文件事件都会触发 refresh，
  // 请求堆积会耗尽浏览器连接配额，导致后续 fetch（含对话）直接 Failed to fetch。
  const refreshing = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      // 超时兜底：网络卡住时不能让 refreshing 一直挂住
      const signal = AbortSignal.timeout(8000);
      const [treeRes, infoRes] = await Promise.all([
        fetch(`/api/projects/${project.id}/files`, { signal, cache: "no-store" }),
        fetch(`/api/projects/${project.id}/service`, { signal, cache: "no-store" }),
      ]);
      if (treeRes.ok) {
        const data = await treeRes.json();
        setTree(data.tree ?? []);
      }
      if (infoRes.ok) {
        const data = await infoRes.json();
        setStatus(data.status ?? "stopped");
        setRunning(Boolean(data.port));
        setRuntimeLogs(typeof data.output==="string"?data.output.slice(-6000):"");
        // Keep an open preview stable while polling service status.
      }
    } catch {
      setError("无法同步项目状态，请检查连接后刷新。");
    } finally {
      refreshing.current = false;
    }
  }, [project.id]);

  useEffect(() => {
    // 首屏拉取项目文件树与服务状态，属于与外部系统同步，非渲染期派生状态
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  // 对话过程中轮询，及时反映文件与服务变化；用 setTimeout 串行排队，避免叠请求
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState === "visible") await refresh();
      if (!stopped) timer = setTimeout(tick, 6000);
    };
    timer = setTimeout(tick, 6000);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [refresh]);

  const lastFileRefresh = useRef(0);
  const applyEvent = useCallback((event: GenerationEventPayload) => {
    setGenEvents((prev) => {
      if (event.type === "code") {
        // 累计快照只保留每个文件的最新一份，避免长文件占满内存
        return [...prev.filter((item) => !(item.type === "code" && item.path === event.path)), event];
      }
      const next = [...prev, event];
      return next.length > 2000 ? next.slice(-2000) : next;
    });

    if (event.type === "file" && event.status === "done") {
      // 文件落盘后刷新一次文件树，让代码面板与磁盘一致（1.2s 内合并）
      const now = Date.now();
      if (now - lastFileRefresh.current > 1200) {
        lastFileRefresh.current = now;
        void refresh();
      }
    }

    if(event.type==="discussion"){
      setGenView(prev=>({...prev,status:"waiting",stage:"discuss",error:null,discussion:event.discussion}));
      setMobilePane("chat");
      return;
    }
    if (event.type === "run") {
      setGenView((prev) => ({
        ...prev,
        status: event.status,
        stage: prev?.stage ?? null,
        error: event.status === "failed" ? (prev?.error ?? null) : null,
      }));
      return;
    }
    if (event.type === "stage") {
      setGenView((prev) => ({
        ...prev,
        status: event.status === "failed" ? "failed" : "running",
        stage: event.stage,
        error: event.status === "failed" ? (event.error ?? null) : (prev?.error ?? null),
      }));
    }
  }, [refresh]);

  /** 读取一次生成状态与历史事件；失败时返回 null */
  const loadGeneration = useCallback(async (signal?: AbortSignal) => {
    try {
      const timeout = AbortSignal.timeout(8000);
      const res = await fetch(`/api/projects/${project.id}/generation`, { cache: "no-store", signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      if (!res.ok) return null;
      return (await res.json()) as GenerationResponse;
    } catch {
      return null;
    }
  }, [project.id]);

  const attachGeneration = useCallback(
    async (nextRequirement?: string, resumeFrom?: GenerationStage, existingRunId?: string) => {
      if (!modelConfigured) { setError("尚未配置模型，无法开始生成。请先在服务器配置模型服务。"); return; }
      if (generationStreamActive.current) return;
      generationStreamActive.current = true;
      const version = ++generationVersion.current;
      const controller = new AbortController();
      generationSubscription.current = { version, controller };
      setPollingGeneration(null);
      const text = nextRequirement?.trim();
      if (text) setRequirement(text);
      setError("");
      setGenEvents([]);
      setGenView({ status: "running", stage: resumeFrom ?? null, error: null });
      setStreaming(true);
      setRecordView(false);
      setCodeMode("live");
      setMobilePane("preview");
      try {
        const res = await fetch(`/api/projects/${project.id}/generate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ requirement: text, resumeFrom, ...(existingRunId ? { action: "subscribe", runId: existingRunId } : {}) }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setGenView({
            status: "failed",
            stage: resumeFrom ?? null,
            error: data.error ?? `生成请求失败（${res.status}）`,
          });
          return;
        }
        // POST只建立这一条事件订阅；后续轮询只读取GET状态。
        setPollingGeneration(version);
        if (!res.body) {
          setStreaming(false);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              applyEvent(JSON.parse(trimmed) as GenerationEventPayload);
            } catch {
              /* 忽略非法行 */
            }
          }
        }

        // 流结束后对齐一次最终状态（历史事件已由服务端回放，这里只校正 run）
        const data = await loadGeneration();
        if (data?.run) {
          setGenView(generationSnapshot(data));
          if (!text && data.run.requirement) setRequirement(data.run.requirement);
          if (data.run.status === "ready") {
            await refresh();
          }
        }
      } catch {
        if (controller.signal.aborted) return;
        // 流中断不代表后台任务失败，继续轮询确认，不自动重复订阅或启动任务。
        const data = await loadGeneration();
        if (generationVersion.current !== version) return;
        if (data?.run) setGenView(generationSnapshot(data));
        else setGenView((prev) => prev ? { ...prev, progressUnavailable: true, observedAt: Date.now() } : prev);
        setPollingGeneration(version);
      } finally {
        if (generationVersion.current === version && generationSubscription.current?.version === version) {
          generationSubscription.current = null;
          generationStreamActive.current = false;
          setStreaming(false);
        }
      }
    },
    [applyEvent, loadGeneration, project.id, refresh, modelConfigured],
  );

  // 挂载时回填历史：有 running 的 run 就续订事件流，首次入口则用 initialQuery 触发生成
  useEffect(() => {
    let disposed = false;
    void (async () => {
      const data = await loadGeneration();
      if (disposed) return;
      // 回看/续订时都保留原始需求，避免“你的想法”丢失
      if (data?.run?.requirement) setRequirement(data.run.requirement);
      if (data?.run?.status === "running") {
        setGenView(generationSnapshot(data));
        setPollingGeneration(generationVersion.current);
        void attachGeneration(undefined,undefined,data.run.id);
        return;
      }
      if (data) {
        setGenEvents(
          data.events
            .map((e) => e.payload)
            .filter((payload): payload is GenerationEventPayload => Boolean(payload)),
        );
        if (data.run) {
          setGenView(generationSnapshot(data));
          if(data.run.status==="waiting") setPollingGeneration(generationVersion.current);
        }
      }
      if (initialQuery && !data?.run && !hasExistingWork) {
        // 从首页/工作台带过来的第一句话：直接进入分阶段生成，不走普通聊天接口
        void attachGeneration(initialQuery);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [attachGeneration, hasExistingWork, initialMessages.length, initialQuery, loadGeneration]);

  // 每轮请求结束后等待5秒，避免慢网络叠请求；不回放事件、不重新订阅流。
  useEffect(() => {
    if (!["running", "waiting"].includes(genView?.status??"") || pollingGeneration === null) return;
    const version = pollingGeneration;
    return pollGenerationStatus({
      load: loadGeneration,
      receive: (data) => {
        if (generationVersion.current !== version) return;
        const next = generationSnapshot(data);
        if(next&&next.status!==genView?.status){
          setGenEvents(data.events.map(e=>e.payload).filter((event):event is GenerationEventPayload=>Boolean(event)));
          if(next.status==="waiting")setMobilePane("chat");
          if(genView?.status==="waiting"&&next.status==="running"&&data.run)void attachGeneration(undefined,undefined,data.run.id);
        }
        setGenView((prev) => {
          if (!prev || !["running","waiting"].includes(prev.status)) return prev;
          return next ?? { ...prev, progressUnavailable: true, observedAt: Date.now() };
        });
        if (next && next.status !== "running") stopGenerationSubscription();
        if (next?.status === "ready") void refresh();
      },
      unavailable: () => {
        if (generationVersion.current !== version) return;
        setGenView((prev) => prev?.status === "running" ? { ...prev, progressUnavailable: true, observedAt: Date.now() } : prev);
      },
    });
  }, [genView?.status, pollingGeneration, loadGeneration, refresh, stopGenerationSubscription, attachGeneration]);

  useEffect(() => () => { generationSubscription.current?.controller.abort(); }, []);

  async function cancelGeneration() {
    const res = await fetch(`/api/projects/${project.id}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    if (!res.ok) { setError("取消失败，请重试。"); return; }
    const data = await loadGeneration();
    if (data?.run) {
      setGenView(generationSnapshot(data));
      if (data.run.status !== "running") stopGenerationSubscription();
    } else if (data) {
      setGenView((prev) => prev ? { ...prev, status: "cancelled", error: null } : prev);
      stopGenerationSubscription();
    }
  }

  async function serviceAction(action: "start" | "stop" | "restart") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${project.id}/service`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error ?? "服务操作失败"); }
      await refresh();
      setPreviewKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "服务操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function answerDiscussion(answers:DiscussionAnswers,useRecommended:boolean){
    if(!genView?.runId||!genView.discussion)throw new Error("请等待问题同步后重试");
    const res=await fetch(`/api/projects/${project.id}/generate`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"answer",runId:genView.runId,version:genView.discussion.version,answers,useRecommended}),signal:AbortSignal.timeout(15000)});
    const result=await res.json().catch(()=>({}));
    if(!res.ok){
      const latest=await loadGeneration();
      if(latest?.run)setGenView(generationSnapshot(latest));
      throw new Error(result.error??"回答未提交，请重试");
    }
    stopGenerationSubscription();
    const data=await loadGeneration();
    if(data?.run){
      setGenView(generationSnapshot(data));
      setGenEvents(data.events.map(e=>e.payload).filter((event):event is GenerationEventPayload=>Boolean(event)));
      if(!["running","waiting"].includes(data.run.status))return;
    }
    void attachGeneration(undefined,undefined,result.run.id);
  }

  const waiting=genView?.status==="waiting";
  const generating = genView?.status === "running";
  const showTimeline = shouldShowGenerationTimeline(streaming, genView?.status, running);

  return (
    <div className="workspace-shell flex h-dvh bg-[#f8f8f5] text-[#0c0c0c]">
      <AppSidebar active="project" className="hidden xl:flex" />
      <div className="flex min-w-0 flex-1 flex-col">
      <header className="workspace-header flex min-h-16 flex-none flex-wrap items-center gap-3 border-b border-black/8 bg-white px-4 py-2">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 xl:hidden"
          title="返回工作台"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#4267ff] to-[#b88ade] text-[13px] font-semibold text-white">
            A
          </span>
          <span className="text-[14px] font-semibold tracking-tight">Atoms</span>
        </Link>
        <span className="text-black/20 xl:hidden">/</span>
        <span className="truncate text-[13.5px] text-black/65">{project.name}</span>
        <StatusPill status={waiting ? "waiting" : generating ? "generating" : status} />

        <div className="ml-auto flex items-center gap-2">
          {running ? (
            <>
              <button
                onClick={() => void serviceAction("restart")}
                disabled={busy || generating}
                className="rounded-full border border-black/10 bg-white px-3.5 py-1.5 text-[12.5px] hover:border-black/25 disabled:opacity-50"
              >
                重启
              </button>
              <button
                onClick={() => void serviceAction("stop")}
                disabled={busy || generating}
                className="rounded-full border border-black/10 bg-white px-3.5 py-1.5 text-[12.5px] text-[#e5484d] hover:border-[#e5484d]/40 disabled:opacity-50"
              >
                停止
              </button>
            </>
          ) : (
            <button
              onClick={() => void serviceAction("start")}
              disabled={busy || generating}
              className="rounded-full bg-[#4267ff] px-4 py-1.5 text-[12.5px] font-medium text-white hover:bg-[#2f50f0] disabled:opacity-50"
            >
              {busy ? "启动中…" : "运行"}
            </button>
          )}
          <button disabled={downloading} onClick={async () => { setDownloading(true); setError(""); try { await downloadProject(project.id, "source"); } catch (e) { setError(e instanceof Error ? e.message : "下载失败"); } finally { setDownloading(false); } }} className="action-secondary"><Download size={14} /><span className="hidden sm:inline">{downloading ? "打包中…" : "源码"}</span></button>
          <button onClick={() => { setTab("release"); setMobilePane("preview"); }} className="action-primary"><Rocket size={14} />发布</button>
          <a
            href={`/p/${project.id}/`}
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-full border border-black/10 bg-white px-3.5 py-1.5 text-[12.5px] hover:border-black/25 sm:block"
          >
            新窗口打开 ↗
          </a>
        </div>
      </header>

      {error && <div className="feedback-error mx-3 my-2" role="alert">{error}<button onClick={() => { setError(""); void refresh(); }}>重试</button></div>}
      <div className="workspace-mobile-tabs lg:hidden">{(["files", "chat", "preview"] as const).map((pane) => <button key={pane} aria-pressed={mobilePane === pane} onClick={() => setMobilePane(pane)}>{pane === "files" ? "项目文件" : pane === "chat" ? "对话" : "应用 / 交付"}</button>)}</div>
      <div className="flex min-h-0 flex-1">
        <aside
          className={`w-full lg:w-[200px] flex-none border-r border-black/8 bg-white ${
            mobilePane === "files" ? "block" : "hidden"
          } lg:block`}
        >
          <FileTree projectId={project.id} tree={tree} onRefresh={refresh} />
        </aside>

        <main
          className={`min-w-0 flex-1 ${
            mobilePane === "chat" ? "flex" : "hidden"
          } lg:flex`}
        >
          <ChatPanel
            projectId={project.id}
            initialMessages={initialMessages}
            locked={generating || waiting}
            onAnswer={answerDiscussion}
            modelConfigured={modelConfigured}
            canGenerate={canStartInitialGeneration(hasExistingWork, genView?.status)}
            requirement={requirement}
            generationView={genView}
            generationEvents={genEvents}
            onGenerate={(text) => void attachGeneration(text)}
            onToolFinished={refresh}
            onOpenProcess={() => { setTab("code"); setCodeMode("live"); setMobilePane("preview"); }}
            onCancel={() => void cancelGeneration().catch(() => setError("取消请求失败，请重试。"))}
            onRetry={() => void attachGeneration(requirement || undefined, (genView?.stage as GenerationStage | null) ?? undefined)}
          />
        </main>

        <section
          className={`min-w-0 flex-1 bg-[#f6f6f6] ${
            mobilePane === "preview" ? "flex" : "hidden"
          } lg:flex`}
        >
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-11 flex-none items-center gap-1 px-3">
              {(["preview", "code", "release"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-full px-3 py-1 text-[12.5px] transition ${
                    tab === t
                      ? "bg-white font-medium text-black shadow-sm"
                      : "text-black/45 hover:text-black/70"
                  }`}
                >
                  <span className="flex items-center gap-1.5">{t === "preview" ? <Eye size={14} /> : t === "code" ? <Code2 size={14} /> : <Rocket size={14} />}{t === "preview" ? "预览" : t === "code" ? "代码" : "交付"}</span>
                </button>
              ))}
              {tab === "code" && (
                <div className="ml-auto flex items-center gap-1 rounded-full bg-black/4 p-0.5">
                  {(["live", "files"] as const).map((mode) => (
                    <button
                      key={mode}
                      aria-pressed={codeMode === mode}
                      onClick={() => setCodeMode(mode)}
                      className={`rounded-full px-2.5 py-1 text-[12px] ${codeMode === mode ? "bg-white font-medium text-black shadow-sm" : "text-black/45 hover:text-black/70"}`}
                    >
                      {mode === "live" ? "实时代码" : "文件树"}
                    </button>
                  ))}
                </div>
              )}
              {tab === "preview" && <div className="ml-auto flex items-center gap-1">{genView && !generating && <button onClick={() => setRecordView((v) => !v)} aria-pressed={recordView} className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] ${recordView ? "bg-white font-medium text-[#3355e0] shadow-sm" : "text-black/45 hover:text-black/70"}`}><ScrollText size={13} />执行记录</button>}{([{ id: "desktop", icon: Monitor, title: "桌面预览" }, { id: "tablet", icon: Tablet, title: "平板预览" }, { id: "mobile", icon: Smartphone, title: "手机预览" }] as const).map(({ id, icon: Icon, title }) => <button key={id} title={title} aria-label={title} aria-pressed={device === id} className={`rounded-md p-1.5 ${device === id ? "bg-white text-[#4267ff] shadow-sm" : "text-black/40"}`} onClick={() => setDevice(id)}><Icon size={15} /></button>)}<button title="刷新预览" aria-label="刷新预览" className="p-1.5 text-black/40" onClick={() => setPreviewKey((k) => k + 1)}><RefreshCw size={14} /></button></div>}
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
              {tab === "release" ? <ReleasePanel projectId={project.id} generating={generating} /> : tab === "preview" ? (
                showTimeline || recordView ? (
                  <GenerationTimeline
                    view={genView}
                    events={genEvents}
                    onCancel={() => void cancelGeneration().catch(() => setError("取消请求失败，请重试。"))}
                    onRetry={() =>
                      void attachGeneration(
                        requirement || undefined,
                        (genView?.stage as GenerationStage | null) ?? undefined,
                      )
                    }
                    onClose={recordView ? () => setRecordView(false) : undefined}
                  />
                ) : running ? (
                  <div className="flex h-full min-h-0 flex-col gap-2">
                  <div className="relative min-h-0 flex-1">
                    <iframe
                      key={previewFrameKey}
                      src={`/p/${project.id}/`}
                      onLoad={() => setLoadedFrameKey(previewFrameKey)}
                      style={{ maxWidth: device === "mobile" ? 375 : device === "tablet" ? 768 : "100%", display: "block", marginInline: "auto" }}
                      className="h-full w-full rounded-2xl border border-black/8 bg-white shadow-[0_1px_3px_rgba(12,12,12,0.04)]"
                      title="项目预览"
                    />
                    {loadedFrameKey !== previewFrameKey && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-white/95">
                        <div className="text-center">
                          <LoaderCircle className="mx-auto animate-spin text-[#4267ff]" size={22} />
                          <p className="mt-3 text-[13.5px] font-medium">正在准备页面…</p>
                          <p className="mt-1 text-[12px] text-black/50">首次访问会编译页面，耗时取决于服务器负载</p>
                        </div>
                      </div>
                    )}
                  </div>
                    <RuntimeLogPanel output={runtimeLogs} />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <div className="max-w-sm rounded-3xl border border-black/8 bg-white p-8 text-center shadow-[0_1px_3px_rgba(12,12,12,0.04)]">
                      <h3 className="text-[15px] font-semibold">服务尚未运行</h3>
                      <p className="mt-2 text-[13px] leading-relaxed text-black/55">
                        点击右上角「运行」，或让 AI 在对话中启动服务，即可在这里预览你的应用。
                      </p>
                      {runtimeLogs&&<div className="mt-4 text-left"><RuntimeLogPanel output={runtimeLogs}/></div>}
                    </div>
                  </div>
                )
              ) : codeMode === "live" && (generating || genEvents.some((event) => event.type === "code")) ? (
                <LiveCodeViewer events={genEvents} running={generating} />
              ) : (
                <CodeBrowser projectId={project.id} tree={tree} />
              )}
            </div>
          </div>
        </section>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    running: { label: "运行中", cls: "bg-[#2dbb5c]/12 text-[#1f8f46]" },
    ready: { label: "已就绪", cls: "bg-[#2dbb5c]/12 text-[#1f8f46]" },
    error: { label: "异常", cls: "bg-[#e5484d]/12 text-[#c53b40]" },
    stopped: { label: "已停止", cls: "bg-black/6 text-black/50" },
    created: { label: "待构建", cls: "bg-[#4267ff]/10 text-[#3355e0]" },
    waiting: { label: "等待你的选择", cls: "bg-amber-50 text-amber-700" },
    generating: { label: "生成中", cls: "bg-[#b88ade]/15 text-[#7b4fb0]" },
  };
  const s = map[status] ?? map.created;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${s.cls}`}>{s.label}</span>
  );
}

function FileTree({
  projectId,
  tree,
  onRefresh,
}: {
  projectId: string;
  tree: FileNode[];
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<{ path: string; content: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [fileError, setFileError] = useState("");

  async function openFile(path: string) {
    setFileError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/files?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "文件读取失败");
      setEditing({ path, content: data.file.content ?? "" });
    } catch (e) { setFileError(e instanceof Error ? e.message : "文件读取失败"); }
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/files`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editing),
      });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error ?? "保存失败"); }
      setEditing(null);
      onRefresh();
    } catch (e) { setFileError(e instanceof Error ? e.message : "保存失败"); } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 flex-none items-center justify-between border-b border-black/8 px-3">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-black/40">
          文件
        </span>
        <button
          onClick={onRefresh}
          className="rounded px-1.5 text-[13px] text-black/40 hover:text-black/70"
          title="刷新"
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 font-mono text-[12.5px]">
        {tree.length === 0 ? (
          <p className="px-2 py-4 text-[12px] leading-relaxed text-black/35">
            暂无文件。让 AI 开始构建后，文件会出现在这里。
          </p>
        ) : (
          tree.map((n) => (
            <TreeItem
              key={n.path}
              node={n}
              depth={0}
              open={open}
              toggle={(p) => setOpen((o) => ({ ...o, [p]: !o[p] }))}
              onOpenFile={openFile}
            />
          ))
        )}
      </div>

      {fileError && <p role="alert" className="feedback-error">{fileError}</p>}
      {editing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="flex h-[70vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center gap-3 border-b border-black/8 px-4 py-2.5">
              <span className="truncate font-mono text-[12.5px] text-black/70">{editing.path}</span>
              <button
                onClick={() => setEditing(null)}
                className="ml-auto text-[13px] text-black/40 hover:text-black/70"
              >
                <X size={16} />
              </button>
            </div>
            {fileError && <p role="alert" className="feedback-error">{fileError}</p>}
            <textarea
              aria-label="编辑文件内容"
              value={editing.content}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              spellCheck={false}
              className="min-h-0 flex-1 resize-none bg-[#0d0d12] p-4 font-mono text-[12.5px] leading-relaxed text-[#c8c8d4] outline-none"
            />
            <div className="flex justify-end gap-2 border-t border-black/8 px-4 py-2.5">
              <button
                onClick={() => setEditing(null)}
                className="rounded-lg border border-black/10 px-3 py-1.5 text-[12.5px]"
              >
                取消
              </button>
              <button
                onClick={() => void save()}
                disabled={saving}
                className="rounded-lg bg-[#4267ff] px-3.5 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-50"
              >
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TreeItem({
  node,
  depth,
  open,
  toggle,
  onOpenFile,
}: {
  node: FileNode;
  depth: number;
  open: Record<string, boolean>;
  toggle: (p: string) => void;
  onOpenFile: (p: string) => void;
}) {
  const isDir = node.type === "dir";
  const expanded = open[node.path] ?? depth === 0;
  return (
    <div>
      <button
        onClick={() => (isDir ? toggle(node.path) : onOpenFile(node.path))}
        className="flex w-full items-center gap-1.5 rounded px-1.5 py-[3px] text-left hover:bg-black/4"
        style={{ paddingLeft: 6 + depth * 12 }}
      >
        <span className="w-3 flex-none text-[10px] text-black/35">
          {isDir ? (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <FileCode2 size={12} />}
        </span>
        <span className="truncate text-black/75">{node.name}</span>
      </button>
      {isDir && expanded && node.children?.length ? (
        <div>
          {node.children.map((c) => (
            <TreeItem
              key={c.path}
              node={c}
              depth={depth + 1}
              open={open}
              toggle={toggle}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CodeBrowser({ projectId, tree }: { projectId: string; tree: FileNode[] }) {
  const files = useMemo(() => flatten(tree), [tree]);
  const [active, setActive] = useState<string | null>(files[0]?.path ?? null);
  const [content, setContent] = useState("");
  const loadedRef = useRef<string | null>(null);
  const selectedFile = active ?? files[0]?.path ?? null;

  useEffect(() => {
    if (!selectedFile) return;
    let disposed = false;
    loadedRef.current = selectedFile;
    void fetch(`/api/projects/${projectId}/files?path=${encodeURIComponent(selectedFile)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!disposed) setContent(d?.file?.content ?? "（无法读取，请重新选择文件重试）"); })
      .catch(() => { if (!disposed) setContent("（无法读取，请重新选择文件重试）"); });
    return () => { disposed = true; };
  }, [selectedFile, projectId]);

  return (
    <div className="flex h-full overflow-hidden rounded-2xl border border-black/8 bg-white">
      <div className="w-[120px] sm:w-[180px] flex-none overflow-y-auto border-r border-black/8 bg-[#fafaf9] py-2">
        {files.map((f) => (
          <button
            key={f.path}
            onClick={() => setActive(f.path)}
            className={`block w-full truncate px-3 py-1 text-left font-mono text-[11.5px] ${
              selectedFile === f.path ? "bg-white text-[#4267ff]" : "text-black/60 hover:bg-black/4"
            }`}
          >
            {f.path}
          </button>
        ))}
        {files.length === 0 && (
          <p className="px-3 py-2 text-[11.5px] text-black/35">暂无文件</p>
        )}
      </div>
      <pre className="min-w-0 flex-1 overflow-auto bg-[#0d0d12] p-4 font-mono text-[12px] leading-relaxed text-[#c8c8d4]">
        <code>{content}</code>
      </pre>
    </div>
  );
}

function flatten(nodes: FileNode[]): FileNode[] {
  const out: FileNode[] = [];
  const visit = (list: FileNode[]) => {
    for (const n of list) {
      if (n.type === "file") out.push(n);
      else if (n.children) visit(n.children);
    }
  };
  visit(nodes);
  return out;
}

function RuntimeLogPanel({output}:{output:string}){
  return <details className="flex-none rounded-xl border border-black/8 bg-white px-3 py-2 text-[12px]">
    <summary className="cursor-pointer text-black/60">启动与编译日志</summary>
    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-black/65">{output||"等待服务输出；日志每隔几秒自动更新。"}</pre>
  </details>;
}
