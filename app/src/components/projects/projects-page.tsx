"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderOpen, RefreshCw } from "lucide-react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { notifyProjectsChanged } from "@/components/layout/projects-changed";
import { ProjectCard } from "./project-card";
import { ProjectGridSkeleton } from "./project-card-skeleton";
import type { ProjectSummary } from "./types";

type Filter = "all" | "favorites";

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [favoriteBusy, setFavoriteBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      if (!res.ok) throw new Error("项目列表加载失败，请重试。");
      const data = (await res.json()) as { projects?: ProjectSummary[] };
      setProjects(
        [...(data.projects ?? [])].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "项目列表加载失败，请重试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 首屏同步项目列表，属于与外部系统同步
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProjects();
  }, [loadProjects]);

  const visible = useMemo(
    () => (filter === "favorites" ? projects.filter((project) => project.favorited) : projects),
    [filter, projects],
  );

  const favoriteCount = useMemo(
    () => projects.filter((project) => project.favorited).length,
    [projects],
  );

  async function handleToggleFavorite(project: ProjectSummary) {
    if (favoriteBusy) return;
    const next = !project.favorited;
    setFavoriteBusy(project.id);
    setError("");
    setProjects((list) =>
      list.map((item) => (item.id === project.id ? { ...item, favorited: next } : item)),
    );
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ favorited: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "收藏状态更新失败，请重试。");
      }
    } catch (e) {
      setProjects((list) =>
        list.map((item) =>
          item.id === project.id ? { ...item, favorited: project.favorited } : item,
        ),
      );
      setError(e instanceof Error ? e.message : "收藏状态更新失败，请重试。");
    } finally {
      setFavoriteBusy(null);
    }
  }

  async function handleDelete(project: ProjectSummary) {
    if (deleting) return;
    setDeleting(project.id);
    setError("");
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "删除失败，请重试。");
      setProjects((list) => list.filter((item) => item.id !== project.id));
      notifyProjectsChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败，请重试。");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div
      className="dashboard-shell flex h-dvh flex-col bg-[#f8f8f5] text-[#0c0c0c]"
      style={{ fontFamily: "var(--font-ibm-plex-sans), system-ui, sans-serif" }}
    >
      <div className="flex min-h-0 flex-1">
        <AppSidebar active="project" />

        <main className="relative min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1180px] px-5 pb-16 pt-14 sm:px-8 lg:pt-9">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-[22px] font-semibold tracking-[-0.02em]">项目</h1>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  void loadProjects();
                }}
                className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] text-black/40 transition hover:bg-black/5 hover:text-black/70"
              >
                <RefreshCw size={13} />刷新
              </button>
            </div>

            <div className="mt-6 flex items-center gap-1.5">
              {([
                { key: "all", label: "全部" },
                { key: "favorites", label: `已收藏${favoriteCount > 0 ? ` ${favoriteCount}` : ""}` },
              ] as const).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  aria-pressed={filter === item.key}
                  className={`h-8 rounded-full px-3.5 text-[13px] transition ${
                    filter === item.key
                      ? "bg-black/6 font-medium text-black"
                      : "text-black/45 hover:text-black/70"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {error ? (
              <div className="feedback-error mt-5">
                {error}
                <button type="button" onClick={() => void loadProjects()}>
                  重试
                </button>
              </div>
            ) : null}

            <div className="mt-5">
              {loading ? (
                <ProjectGridSkeleton />
              ) : visible.length === 0 ? (
                <div className="flex flex-col items-center rounded-2xl border border-dashed border-black/10 px-6 py-16 text-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#eef1ff,#f6ecff)] text-[#4267ff]">
                    <FolderOpen size={19} />
                  </span>
                  <p className="mt-4 text-[13.5px] font-medium">
                    {filter === "favorites" ? "还没有收藏的项目" : "还没有项目"}
                  </p>
                  <p className="mt-1 max-w-[320px] text-[12.5px] leading-relaxed text-black/45">
                    {filter === "favorites"
                      ? "在卡片右上角的「…」菜单里收藏常用项目，之后会出现在这里。"
                      : "回到工作台描述你的想法，AI 团队会先给出方案，再动手构建。"}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                  {visible.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      favoriteBusy={favoriteBusy === project.id}
                      deleting={deleting === project.id}
                      onToggleFavorite={handleToggleFavorite}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
