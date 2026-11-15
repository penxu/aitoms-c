"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Sparkles, LoaderCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { notifyProjectsChanged } from "@/components/layout/projects-changed";

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  status: string;
  createdAt: string;
}

type PanelTab = "discover" | "projects" | "templates";

const AGENTS = [
  { name: "Mike", role: "团队领导", cls: "from-[#4267ff] to-[#7b9bff]", joined: true },
  { name: "Adrian", role: "广告投放", cls: "from-[#ff9f45] to-[#ffd39b]", joined: false },
  { name: "Sarah", role: "SEO", cls: "from-[#ff7fa7] to-[#ffc4d4]", joined: false },
  { name: "Emma", role: "产品经理", cls: "from-[#b88ade] to-[#e2c6f7]", joined: true },
  { name: "Bob", role: "架构师", cls: "from-[#2dbb5c] to-[#8fe0aa]", joined: true },
  { name: "Alex", role: "工程师", cls: "from-[#37b4c9] to-[#9fe3ee]", joined: true },
  { name: "David", role: "数据分析", cls: "from-[#f0b429] to-[#ffdf9e]", joined: false },
  { name: "Iris", role: "深度研究", cls: "from-[#e0619e] to-[#ffb3d1]", joined: false },
];

const PLACEHOLDERS = [
  "请 Alex 构建一个宠物美容预约网站…",
  "请 Emma 把需求整理成清晰的规格…",
  "请 Bob 规划页面与数据模型…",
  "描述你的想法，AI 团队立即开工…",
];

const QUICK_PROMPTS = [
  { label: "落地页", prompt: "做一个 SaaS 产品落地页，包含首屏、特性介绍、定价与常见问题" },
  { label: "预约系统", prompt: "做一个宠物美容预约网站，有服务介绍、预约表单、后台查看预约" },
  { label: "数据看板", prompt: "做一个销售数据看板，有指标卡片、折线图和订单明细表" },
];

const TEMPLATES = [
  {
    title: "预约系统",
    desc: "服务列表 · 在线预约 · 后台查看",
    prompt: "做一个宠物美容预约网站，有服务介绍、预约表单、后台查看预约",
  },
  {
    title: "数据看板",
    desc: "指标卡片 · 趋势图 · 明细表",
    prompt: "做一个销售数据看板，有指标卡片、折线图和订单明细表",
  },
  {
    title: "产品落地页",
    desc: "首屏 · 特性 · 定价 · FAQ",
    prompt: "做一个 SaaS 产品落地页，包含首屏、特性介绍、定价与常见问题",
  },
];

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  created: { label: "待构建", cls: "bg-black/6 text-black/55" },
  generating: { label: "生成中", cls: "bg-[#b88ade]/15 text-[#7b4fb0]" },
  ready: { label: "已就绪", cls: "bg-[#2dbb5c]/12 text-[#1f8f46]" },
  running: { label: "运行中", cls: "bg-[#2dbb5c]/12 text-[#1f8f46]" },
  stopped: { label: "已停止", cls: "bg-black/6 text-black/45" },
  error: { label: "异常", cls: "bg-[#e5484d]/12 text-[#c53b40]" },
};

function timeAgo(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "";
  const diff = Date.now() - time;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return new Date(time).toLocaleDateString("zh-CN");
}

export function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PanelTab>("discover");
  const [promoOpen, setPromoOpen] = useState(true);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const sorted = useMemo(
    () =>
      [...projects].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [projects],
  );

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("项目列表加载失败，请重试。");
      const data = (await res.json()) as { projects: ProjectRow[] };
      setProjects(data.projects ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "项目列表加载失败");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // 首屏同步项目列表，属于与外部系统同步
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    const timer = setInterval(
      () => setPlaceholderIndex((index) => (index + 1) % PLACEHOLDERS.length),
      3200,
    );
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // 资源页/模板会带着 ?q= 跳到工作台，这里把需求预填进输入框
    const q = new URLSearchParams(window.location.search).get("q");
    if (!q) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrompt(q);
    inputRef.current?.focus();
  }, []);

  async function handleCreate(text: string) {
    const description = text.trim();
    if (creating) return;
    if (!description) { setError("先描述你想构建的应用。"); inputRef.current?.focus(); return; }
    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = (await res.json()) as { project?: { id: string }; error?: string };
      if (!res.ok || !data.project?.id) throw new Error(data.error ?? "创建项目失败，请重试。");
      if (data.project?.id) {
        router.push(`/app/${data.project.id}?q=${encodeURIComponent(description)}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络连接失败，请重试。");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(project: ProjectRow) {
    if (deleting) return;
    setError("");
    setDeleting(project.id);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "删除失败，请重试。");
      setProjects((list) => list.filter((item) => item.id !== project.id));
      setPendingDelete(null);
      notifyProjectsChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败，请重试。");
    } finally {
      setDeleting(null);
    }
  }

  function fillPrompt(text: string) {
    setPrompt(text);
    inputRef.current?.focus();
  }

  const visibleProjects = tab === "projects" ? sorted : sorted.slice(0, 3);

  return (
    <div
      className="dashboard-shell flex h-dvh flex-col bg-[#f8f8f5] text-[#0c0c0c]"
      style={{ fontFamily: "var(--font-ibm-plex-sans), system-ui, sans-serif" }}
    >
      {promoOpen ? (
        <div className="flex h-10 flex-none">
          <div className="hidden w-[248px] flex-none bg-[#f2f2ed] lg:block" />
          <div className="relative flex min-w-0 flex-1 items-center justify-center gap-3 bg-[linear-gradient(90deg,#eef1ff_0%,#f7f0ff_45%,#fff0f6_100%)] px-10">
            <span className="truncate text-[13.5px] text-black/70">
              让 Atoms 把你的想法变成可运行的应用。
            </span>
            <button
              type="button"
              onClick={() => inputRef.current?.focus()}
              className="flex h-6 flex-none items-center rounded-full bg-[#4267ff] px-2.5 text-[11.5px] font-medium text-white hover:bg-[#2f50f0]"
            >
              立即体验 ↗
            </button>
            <button
              type="button"
              aria-label="关闭提示"
              onClick={() => setPromoOpen(false)}
              className="absolute right-3 flex h-6 w-6 items-center justify-center rounded-full text-[14px] text-black/35 hover:bg-black/5 hover:text-black/60"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <AppSidebar active="home" projectsActive={tab === "projects"} />

        <main className="relative min-w-0 flex-1 overflow-y-auto">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_70%_at_50%_0%,rgba(66,103,255,0.10),rgba(184,138,222,0.08)_45%,transparent_75%)]" />

        <div className="relative mx-auto w-full max-w-[900px] px-5 pb-16 pt-12 sm:px-10">
          <div className="dashboard-intro"><span className="eyebrow">YOUR NEXT CHAPTER</span><h1>好想法，值得被做出来。</h1><p>用一句话描述应用。让 AI 把需求、代码和交付串在一起。</p></div>
          <div className="mt-6 flex justify-center">
            <div className="flex items-center">
              {AGENTS.map((agent, index) => (
                <span
                  key={agent.name}
                  title={`${agent.name} · ${agent.role}${agent.joined ? "" : " · 即将上线"}`}
                  className={`flex h-[46px] w-[46px] items-center justify-center rounded-full bg-gradient-to-br text-[15px] font-semibold text-white ring-2 ring-[#f6f6f6] ${agent.cls} ${
                    index === 0 ? "" : "-ml-3"
                  }`}
                >
                  {agent.name.slice(0, 1)}
                </span>
              ))}
            </div>
          </div>

          <form
            className="mt-6 rounded-3xl border border-black/12 bg-white p-3 shadow-[0_8px_32px_rgba(12,12,12,0.05)] focus-within:border-[#4267ff]/40"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreate(prompt);
            }}
          >
            <textarea
              aria-label="描述你想构建的应用"
              aria-describedby={error ? "dashboard-error" : undefined}
              ref={inputRef}
              rows={2}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleCreate(prompt);
                }
              }}
              placeholder={PLACEHOLDERS[placeholderIndex]}
              className="max-h-40 min-h-[56px] w-full resize-none bg-transparent px-2 py-2 text-[16px] leading-relaxed outline-none placeholder:text-black/35"
            />
            <div className="mt-1 flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-2 text-xs text-black/40"><Sparkles size={14} />需求 → 构建 → 交付</span>
              <button
                type="submit"
                disabled={!prompt.trim() || creating}
                aria-label="开始构建"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0c0c0c] text-[14px] text-white transition disabled:bg-black/10 disabled:text-black/30"
              >
                {creating ? <LoaderCircle size={17} className="animate-spin" /> : <ArrowUp size={17} />}
              </button>
            </div>
          </form>
          {error && <div id="dashboard-error" role="alert" className="feedback-error mt-3">{error}<button onClick={() => { setError(""); void loadProjects(); }}>刷新列表</button></div>}

          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {QUICK_PROMPTS.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => fillPrompt(item.prompt)}
                className="flex h-8 items-center rounded-full bg-white/95 px-3.5 text-[13.5px] text-black/65 shadow-[0_1px_2px_rgba(12,12,12,0.04)] hover:text-black"
              >
                {item.label}
              </button>
            ))}
          </div>

          <section className="mt-10 rounded-3xl bg-white p-8 shadow-[0_1px_3px_rgba(12,12,12,0.04)]">
            <div className="flex items-center gap-1">
              {(["discover", "projects", "templates"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTab(item)}
                  className={`h-8 rounded-full px-3 text-[13.5px] transition ${
                    tab === item
                      ? "bg-black/6 font-medium text-black"
                      : "text-black/45 hover:text-black/70"
                  }`}
                >
                  {item === "discover" ? "发现" : item === "projects" ? "项目" : "模板"}
                </button>
              ))}
              <Link
                href="/projects"
                className="ml-auto text-[12.5px] text-black/40 hover:text-black/65"
              >
                查看全部 ›
              </Link>
            </div>

            <div className="mt-5">
              {tab === "templates" ? (
                <ul className="flex flex-col gap-3">
                  {TEMPLATES.map((template) => (
                    <li key={template.title}>
                      <button
                        type="button"
                        onClick={() => fillPrompt(template.prompt)}
                        className="flex w-full items-center gap-3 rounded-2xl border border-black/8 px-4 py-3.5 text-left transition hover:border-black/20"
                      >
                        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-[#e8ecff] to-[#f3e9ff] text-[15px]">
                          <Sparkles size={18} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13.5px] font-medium">{template.title}</span>
                          <span className="block truncate text-[12.5px] text-black/50">
                            {template.desc}
                          </span>
                        </span>
                        <span className="ml-auto text-[12.5px] text-black/30">使用 →</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : loading ? <div className="flex items-center gap-2 py-10 text-sm text-black/50" role="status"><LoaderCircle size={17} className="animate-spin" />正在加载你的项目…</div> : visibleProjects.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-black/10 px-4 py-10 text-center">
                  <p className="text-[13.5px] font-medium">还没有项目</p>
                  <p className="mt-1 text-[12.5px] text-black/45">
                    在上方描述你的想法，AI 团队会先给出方案，再动手构建。
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {visibleProjects.map((project) => {
                    const status = STATUS_MAP[project.status] ?? STATUS_MAP.created;
                    const confirming = pendingDelete === project.id;
                    return (
                      <li key={project.id} className="group">
                        <div
                          className={`flex items-center gap-2 rounded-2xl border py-2 pl-4 pr-2 transition ${
                            confirming
                              ? "border-[#e5484d]/35 bg-[#fff6f6]"
                              : "border-black/8 group-hover:border-black/20"
                          }`}
                        >
                          <Link
                            href={`/app/${project.id}`}
                            className="flex min-w-0 flex-1 items-center gap-3 py-1.5"
                          >
                            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-[#e8ecff] to-[#f3e9ff] text-[14px] font-semibold text-[#4267ff]">
                              {project.name.slice(0, 1)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-medium">
                                {project.name}
                              </span>
                              <span className="block truncate text-[12.5px] text-black/45">
                                {project.description || "暂无描述"}
                              </span>
                            </span>
                          </Link>

                          {confirming ? (
                            <span className="flex flex-none items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setPendingDelete(null)}
                                className="h-7 rounded-full px-2 text-[12.5px] text-black/50 transition hover:text-black"
                              >
                                取消
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDelete(project)}
                                disabled={deleting === project.id}
                                className="flex h-7 items-center gap-1 rounded-full bg-[#e5484d] px-2.5 text-[12.5px] font-medium text-white transition hover:bg-[#c53b40] disabled:opacity-60"
                              >
                                {deleting === project.id ? (
                                  <>
                                    <LoaderCircle size={13} className="animate-spin" />
                                    删除中
                                  </>
                                ) : (
                                  "确认删除"
                                )}
                              </button>
                            </span>
                          ) : (
                            <span className="flex flex-none items-center gap-2">
                              <span
                                className={`hidden rounded-full px-2 py-0.5 text-[11.5px] font-medium sm:inline ${status.cls}`}
                              >
                                {status.label}
                              </span>
                              <span className="hidden w-[64px] text-right text-[12px] text-black/35 sm:inline">
                                {timeAgo(project.createdAt)}
                              </span>
                              <button
                                type="button"
                                aria-label={`删除项目 ${project.name}`}
                                onClick={() => {
                                  setPendingDelete(project.id);
                                  setError("");
                                }}
                                className="flex h-7 w-7 items-center justify-center rounded-full text-black/25 transition hover:bg-black/5 hover:text-[#e5484d] focus-visible:ring-2 focus-visible:ring-[#e5484d]/40 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                              >
                                <Trash2 size={15} />
                              </button>
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>
        </main>
      </div>
    </div>
  );
}
