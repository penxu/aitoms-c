"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home as IconHome, LayoutGrid as IconGrid, FolderOpen as IconFolder, Clock3 as IconClock, FolderPlus, Menu, X } from "lucide-react";
import { AtomsLogo } from "@/components/marketing/atoms-logo";
import { notifyProjectsChanged, onProjectsChanged } from "@/components/layout/projects-changed";

interface ProjectRow {
  id: string;
  name: string;
  createdAt: string;
}

export function AppSidebar({
  active,
  projectsActive,
  className = "",
}: {
  /** 当前所处位置：工作台首页、资源页、项目中心或某个项目 */
  active: "home" | "project" | "resources";
  /** 工作台里「项目」页签是否选中 */
  projectsActive?: boolean;
  className?: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const router = useRouter();

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) return;
      const data = (await res.json()) as { projects: ProjectRow[] };
      setProjects(
        [...(data.projects ?? [])].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      );
    } catch {
      /* 忽略网络抖动 */
    }
  }, []);

  useEffect(() => {
    // 侧边栏同步项目列表，属于与外部系统同步
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => onProjectsChanged(() => void loadProjects()), [loadProjects]);

  /** 输入名称后回车或点「新建」：建一个空项目并直接进入工作台 */
  const submitCreate = useCallback(async () => {
    const name = draftName.trim();
    if (!name || creatingBusy) return;
    setCreatingBusy(true);
    setCreateError("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        project?: { id: string };
        error?: string;
      };
      if (!res.ok || !data.project?.id) throw new Error(data.error ?? "创建失败，请重试");

      setCreating(false);
      setDraftName("");
      notifyProjectsChanged();
      router.push(`/app/${data.project.id}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "创建失败，请重试");
    } finally {
      setCreatingBusy(false);
    }
  }, [creatingBusy, draftName, router]);

  return (
    <>
    <button type="button" aria-label="打开项目导航" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)} className="mobile-nav-trigger"><Menu size={19} /></button>
    {mobileOpen && <button aria-label="关闭导航" className="mobile-nav-backdrop" onClick={() => setMobileOpen(false)} />}
    <aside className={`app-sidebar flex w-[248px] flex-none flex-col bg-[#f2f2ed] px-3 py-5 ${className} ${mobileOpen ? "is-mobile-open" : ""}`}>
      <div className="flex h-9 items-center justify-between px-2">
        <Link href="/" aria-label="Atoms 首页">
          <AtomsLogo className="h-[18px] w-auto fill-[#0c0c0c]" />
        </Link>
        <button
          type="button"
          aria-label="关闭项目导航"
          onClick={() => setMobileOpen(false)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-black/40 hover:bg-black/5 hover:text-black/70"
        >
          <X size={17} />
        </button>
      </div>

      <div
        className="mt-5 flex h-9 items-center gap-2 rounded-lg px-2 text-[13.5px] font-medium hover:bg-black/5"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-[#4267ff] to-[#b88ade] text-[11px] font-semibold text-white">
          A
        </span>
        <span className="truncate">Atoms 工作区</span>
      </div>

      <nav className="mt-3 flex flex-col gap-0.5">
        <NavItem icon={<IconHome />} label="首页" active={active === "home"} href="/dashboard" />
        <NavItem icon={<IconGrid />} label="资源" active={active === "resources"} href="/resources" />
        <NavItem
          icon={<IconFolder />}
          label="项目"
          active={active === "project" || Boolean(projectsActive)}
          href="/projects"
          action={
            <button
              type="button"
              aria-label="新建项目"
              title="新建项目"
              onClick={() => {
                setCreating((open) => !open);
                setCreateError("");
              }}
              className="flex h-6 w-6 items-center justify-center rounded-md text-black/35 transition hover:bg-black/8 hover:text-black/70"
            >
              <FolderPlus size={14} />
            </button>
          }
        />
        {creating ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitCreate();
            }}
            className="mt-1 rounded-lg border border-black/8 bg-white p-1.5 shadow-sm"
          >
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setCreating(false);
                    setDraftName("");
                    setCreateError("");
                  }
                }}
                maxLength={40}
                placeholder="项目名称"
                aria-label="新项目名称"
                className="h-7 min-w-0 flex-1 bg-transparent px-1 text-[12.5px] text-black outline-none placeholder:text-black/30"
              />
              <button
                type="submit"
                disabled={creatingBusy || draftName.trim().length === 0}
                className="flex-none rounded-md px-1.5 py-1 text-[11.5px] font-medium text-[#4267ff] transition disabled:text-black/25"
              >
                {creatingBusy ? "创建中…" : "新建"}
              </button>
            </div>
            {createError ? (
              <p className="px-1 pt-1 text-[11.5px] leading-snug text-red-500">{createError}</p>
            ) : null}
          </form>
        ) : null}
        <NavItem icon={<IconClock />} label="定时任务" disabled />
      </nav>

      <div className="mt-5 px-2 text-[12px] text-black/40">最近</div>
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
        {projects.length === 0 ? (
          <p className="px-2 py-3 text-[12.5px] leading-relaxed text-black/35">
            还没有项目，从右侧描述一个想法开始。
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {projects.slice(0, 8).map((project) => (
              <li key={project.id}>
                <Link
                  href={`/app/${project.id}`}
                  className="flex h-9 items-center gap-2 rounded-lg px-2 text-[13px] text-black/70 hover:bg-black/5 hover:text-black"
                >
                  <span className="flex h-5 w-5 flex-none items-center justify-center rounded-md bg-black/6 text-[10px] font-semibold text-black/50">
                    {project.name.slice(0, 1)}
                  </span>
                  <span className="truncate">{project.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-black/8 bg-white/60 p-3 text-xs leading-relaxed text-black/50">从一个想法开始。<br />构建、预览，然后交付。</div>
    </aside>
    </>
  );
}

function NavItem({
  icon,
  label,
  href,
  active,
  disabled,
  onClick,
  action,
}: {
  icon: ReactNode;
  label: string;
  href?: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  /** 行尾操作按钮（如「新建项目」的加号），不能嵌在 Link 里 */
  action?: ReactNode;
}) {
  const cls = `flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-[13.5px] transition ${
    active ? "bg-white font-medium text-[#4267ff] shadow-sm" : "text-black/65 hover:bg-black/5 hover:text-black"
  } ${disabled ? "cursor-default text-black/30 hover:bg-transparent hover:text-black/30" : ""}`;
  const content = (
    <>
      <span className="sidebar-icon text-black/45">{icon}</span>
      <span className="truncate">{label}</span>
      {disabled ? <span className="ml-auto text-[10.5px] text-black/25">即将上线</span> : null}
    </>
  );

  if (href) {
    return (
      <div className="relative flex items-center">
        <Link href={href} className={`${cls} ${action ? "pr-9" : ""}`}>
          {content}
        </Link>
        {action ? (
          <div className="absolute right-1.5 flex items-center">{action}</div>
        ) : null}
      </div>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${cls} text-left`}>
      {content}
    </button>
  );
}
