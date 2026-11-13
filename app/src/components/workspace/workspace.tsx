"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { UIMessage } from "ai";
import { ChatPanel } from "./chat-panel";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { GenerationTimeline, type GenerationView } from "./generation-timeline";
import type { GenerationEventPayload, GenerationStage } from "@/lib/generation/types";

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
  initialQuery,
}: {
  project: ProjectInfo;
  initialMessages: UIMessage[];
  initialQuery?: string;
}) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [status, setStatus] = useState(project.status);
  const [previewKey, setPreviewKey] = useState(0);
  const [running, setRunning] = useState(project.status === "running");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [mobilePane, setMobilePane] = useState<"files" | "chat" | "preview">("chat");
  const [genView, setGenView] = useState<GenerationView | null>(null);
  const [genEvents, setGenEvents] = useState<GenerationEventPayload[]>([]);
  const [streaming, setStreaming] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [treeRes, infoRes] = await Promise.all([
        fetch(`/api/projects/${project.id}/files`),
        fetch(`/api/projects/${project.id}/service`),
      ]);
      if (treeRes.ok) {
        const data = await treeRes.json();
        setTree(data.tree ?? []);
      }
      if (infoRes.ok) {
        const data = await infoRes.json();
        setStatus(data.status ?? "stopped");
        setRunning(Boolean(data.port));
        setPreviewKey((k) => k + 1);
      }
    } catch {
      /* ignore */
    }
  }, [project.id]);

  useEffect(() => {
    // 首屏拉取项目文件树与服务状态，属于与外部系统同步，非渲染期派生状态
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  // 对话过程中轮询，及时反映文件与服务变化
  useEffect(() => {
    const timer = setInterval(() => void refresh(), 6000);
    return () => clearInterval(timer);
  }, [refresh]);

  const applyEvent = useCallback((event: GenerationEventPayload) => {
    setGenEvents((prev) => (prev.length >= 5000 ? [...prev.slice(-4999), event] : [...prev, event]));
    if (event.type === "run") {
      setGenView((prev) => ({
        status: event.status,
        stage: prev?.stage ?? null,
        error: event.status === "failed" ? (prev?.error ?? null) : null,
      }));
      return;
    }
    if (event.type === "stage") {
      setGenView((prev) => ({
        status: event.status === "failed" ? "failed" : "running",
        stage: event.stage,
        error: event.status === "failed" ? (event.error ?? null) : (prev?.error ?? null),
      }));
    }
  }, []);

  /** 读取一次生成状态与历史事件；失败时返回 null */
  const loadGeneration = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/generation`);
      if (!res.ok) return null;
      return (await res.json()) as {
        run: { status: string; stage: string | null; error: string | null } | null;
        events: { payload: GenerationEventPayload | null }[];
      };
    } catch {
      return null;
    }
  }, [project.id]);

  const attachGeneration = useCallback(
    async (requirement?: string, resumeFrom?: GenerationStage) => {
      setGenEvents([]);
      setGenView({ status: "running", stage: resumeFrom ?? null, error: null });
      setStreaming(true);
      setMobilePane("preview");
      try {
        const res = await fetch(`/api/projects/${project.id}/generate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ requirement, resumeFrom }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setGenView({
            status: "failed",
            stage: null,
            error: data.error ?? `生成请求失败（${res.status}）`,
          });
          return;
        }
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
          setGenView({
            status: data.run.status,
            stage: data.run.stage,
            error: data.run.error,
          });
          if (data.run.status === "ready") {
            setTab("preview");
            await refresh();
          }
        }
      } catch (error) {
        setGenView({
          status: "failed",
          stage: null,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setStreaming(false);
      }
    },
    [applyEvent, loadGeneration, project.id, refresh],
  );

  // 挂载时回填历史：有 running 的 run 就续订事件流，首次入口则用 initialQuery 触发生成
  useEffect(() => {
    let disposed = false;
    void (async () => {
      const data = await loadGeneration();
      if (disposed) return;
      if (data?.run?.status === "running") {
        void attachGeneration();
        return;
      }
      if (data) {
        setGenEvents(
          data.events
            .map((e) => e.payload)
            .filter((payload): payload is GenerationEventPayload => Boolean(payload)),
        );
        if (data.run) {
          setGenView({
            status: data.run.status,
            stage: data.run.stage,
            error: data.run.error,
          });
        }
      }
      if (initialQuery && initialMessages.length === 0 && !data?.run) {
        void attachGeneration(initialQuery);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [attachGeneration, initialMessages.length, initialQuery, loadGeneration]);

  async function cancelGeneration() {
    await fetch(`/api/projects/${project.id}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
  }

  async function serviceAction(action: "start" | "stop" | "restart") {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/service`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) await refresh();
    } finally {
      setBusy(false);
    }
  }

  const generating = genView?.status === "running";
  const showTimeline = streaming || (genView !== null && genView.status !== "ready");

  return (
    <div className="flex h-screen bg-[#f6f6f6] text-[#0c0c0c]">
      <AppSidebar active="project" className="hidden xl:flex" />
      <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-14 flex-none items-center gap-3 border-b border-black/8 bg-white px-4">
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
        <StatusPill status={generating ? "generating" : status} />

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-1 rounded-lg bg-black/4 p-1 md:flex">
            {(["files", "chat", "preview"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setMobilePane(p)}
                className={`rounded-md px-2.5 py-1 text-[12px] transition lg:hidden ${
                  mobilePane === p ? "bg-white shadow-sm" : "text-black/50"
                }`}
              >
                {p === "files" ? "文件" : p === "chat" ? "对话" : "预览"}
              </button>
            ))}
          </div>
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
          <a
            href={`/api/projects/${project.id}/export`}
            className="rounded-full border border-black/10 bg-white px-3.5 py-1.5 text-[12.5px] hover:border-black/25"
          >
            导出
          </a>
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

      <div className="flex min-h-0 flex-1">
        <aside
          className={`w-[248px] flex-none border-r border-black/8 bg-white ${
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
            locked={generating}
            onToolFinished={refresh}
          />
        </main>

        <section
          className={`min-w-0 flex-1 bg-[#f6f6f6] ${
            mobilePane === "preview" ? "flex" : "hidden"
          } lg:flex`}
        >
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-11 flex-none items-center gap-1 px-3">
              {(["preview", "code"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-full px-3 py-1 text-[12.5px] transition ${
                    tab === t
                      ? "bg-white font-medium text-black shadow-sm"
                      : "text-black/45 hover:text-black/70"
                  }`}
                >
                  {t === "preview" ? "预览" : "文件"}
                </button>
              ))}
              <span className="ml-auto font-mono text-[11px] text-black/30">
                /p/{project.id}/
              </span>
            </div>
            <div className="min-h-0 flex-1 px-3 pb-3">
              {tab === "preview" ? (
                showTimeline ? (
                  <GenerationTimeline
                    view={genView}
                    events={genEvents}
                    onCancel={() => void cancelGeneration()}
                    onRetry={() =>
                      void attachGeneration(
                        undefined,
                        (genView?.stage as GenerationStage | null) ?? undefined,
                      )
                    }
                  />
                ) : running ? (
                  <iframe
                    key={previewKey}
                    src={`/p/${project.id}/`}
                    className="h-full w-full rounded-2xl border border-black/8 bg-white shadow-[0_1px_3px_rgba(12,12,12,0.04)]"
                    title="项目预览"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <div className="max-w-sm rounded-3xl border border-black/8 bg-white p-8 text-center shadow-[0_1px_3px_rgba(12,12,12,0.04)]">
                      <h3 className="text-[15px] font-semibold">服务尚未运行</h3>
                      <p className="mt-2 text-[13px] leading-relaxed text-black/55">
                        点击右上角「运行」，或让 AI 在对话中启动服务，即可在这里预览你的应用。
                      </p>
                    </div>
                  </div>
                )
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

  async function openFile(path: string) {
    const res = await fetch(`/api/projects/${projectId}/files?path=${encodeURIComponent(path)}`);
    if (!res.ok) return;
    const data = await res.json();
    setEditing({ path, content: data.file.content ?? "" });
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      await fetch(`/api/projects/${projectId}/files`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editing),
      });
      setEditing(null);
      onRefresh();
    } finally {
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
          ⟳
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

      {editing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="flex h-[70vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center gap-3 border-b border-black/8 px-4 py-2.5">
              <span className="truncate font-mono text-[12.5px] text-black/70">{editing.path}</span>
              <button
                onClick={() => setEditing(null)}
                className="ml-auto text-[13px] text-black/40 hover:text-black/70"
              >
                ✕
              </button>
            </div>
            <textarea
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
          {isDir ? (expanded ? "▾" : "▸") : ""}
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

  useEffect(() => {
    if (!active) return;
    if (loadedRef.current === active) return;
    loadedRef.current = active;
    void fetch(`/api/projects/${projectId}/files?path=${encodeURIComponent(active)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setContent(d?.file?.content ?? "（无法读取）"))
      .catch(() => setContent("（无法读取）"));
  }, [active, projectId]);

  return (
    <div className="flex h-full overflow-hidden rounded-2xl border border-black/8 bg-white">
      <div className="w-[180px] flex-none overflow-y-auto border-r border-black/8 bg-[#fafaf9] py-2">
        {files.map((f) => (
          <button
            key={f.path}
            onClick={() => setActive(f.path)}
            className={`block w-full truncate px-3 py-1 text-left font-mono text-[11.5px] ${
              active === f.path ? "bg-white text-[#4267ff]" : "text-black/60 hover:bg-black/4"
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
