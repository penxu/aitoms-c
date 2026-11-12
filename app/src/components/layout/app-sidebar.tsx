"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { AtomsLogo } from "@/components/marketing/atoms-logo";

interface ProjectRow {
  id: string;
  name: string;
  createdAt: string;
}

export function AppSidebar({
  active,
  projectsActive,
  className = "",
  onProjectsClick,
}: {
  /** 当前所处位置：工作台首页或某个项目 */
  active: "home" | "project";
  /** 工作台里「项目」页签是否选中 */
  projectsActive?: boolean;
  className?: string;
  onProjectsClick?: () => void;
}) {
  const [projects, setProjects] = useState<ProjectRow[]>([]);

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

  return (
    <aside className={`flex w-[270px] flex-none flex-col bg-[#f1f1ef] px-2 py-3 ${className}`}>
      <div className="flex h-9 items-center justify-between px-2">
        <Link href="/" aria-label="Atoms 首页">
          <AtomsLogo className="h-[18px] w-auto fill-[#0c0c0c]" />
        </Link>
        <button
          type="button"
          title="收起侧边栏"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-black/40 hover:bg-black/5 hover:text-black/70"
        >
          <IconPanel />
        </button>
      </div>

      <button
        type="button"
        className="mt-2 flex h-9 items-center gap-2 rounded-lg px-2 text-[13.5px] font-medium hover:bg-black/5"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-[#4267ff] to-[#b88ade] text-[11px] font-semibold text-white">
          A
        </span>
        <span className="truncate">Atoms 工作区</span>
        <IconChevron className="ml-auto text-black/35" />
      </button>

      <nav className="mt-3 flex flex-col gap-0.5">
        <NavItem icon={<IconHome />} label="首页" active={active === "home"} href="/dashboard" />
        <NavItem icon={<IconGrid />} label="资源" disabled />
        <NavItem
          icon={<IconFolder />}
          label="项目"
          active={active === "project" || Boolean(projectsActive)}
          onClick={onProjectsClick}
          href={onProjectsClick ? undefined : "/dashboard"}
        />
        <NavItem icon={<IconClock />} label="定时任务" disabled />
      </nav>

      <div className="mt-6 flex items-center justify-between px-2 text-[12px] text-black/40">
        <span>文件夹</span>
        <button type="button" className="text-[12px] text-black/35 hover:text-black/60">
          + 创建文件夹
        </button>
      </div>

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

      <div className="mt-3 flex items-center gap-1 px-1">
        <button
          type="button"
          title="设置"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-black/45 hover:bg-black/5 hover:text-black/70"
        >
          <IconGear />
        </button>
        <button
          type="button"
          title="帮助"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 text-[12px] text-black/45 hover:text-black/70"
        >
          ?
        </button>
        <span className="ml-auto flex h-7 w-7 items-center justify-center rounded-full bg-[#4267ff] text-[11px] font-semibold text-white">
          A
        </span>
      </div>
    </aside>
  );
}

function NavItem({
  icon,
  label,
  href,
  active,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  href?: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const cls = `flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-[13.5px] transition ${
    active ? "bg-black/6 font-medium text-black" : "text-black/65 hover:bg-black/5 hover:text-black"
  } ${disabled ? "cursor-default text-black/30 hover:bg-transparent hover:text-black/30" : ""}`;
  const content = (
    <>
      <span className="text-black/45">{icon}</span>
      <span className="truncate">{label}</span>
      {disabled ? <span className="ml-auto text-[10.5px] text-black/25">即将上线</span> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cls}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${cls} text-left`}>
      {content}
    </button>
  );
}

function baseIcon(children: ReactNode) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function IconHome() {
  return baseIcon(
    <>
      <path d="M2.5 6.5 8 2.5l5.5 4v6a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1z" />
      <path d="M6.3 13.5V9.5h3.4v4" />
    </>,
  );
}

function IconGrid() {
  return baseIcon(
    <>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
    </>,
  );
}

function IconFolder() {
  return baseIcon(
    <path d="M2.5 4.5a1 1 0 0 1 1-1h3l1.3 1.6h4.7a1 1 0 0 1 1 1v5.4a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" />,
  );
}

function IconClock() {
  return baseIcon(
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v3.2l2.2 1.3" />
    </>,
  );
}

function IconPanel() {
  return baseIcon(
    <>
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <path d="M6.5 3v10" />
    </>,
  );
}

function IconGear() {
  return baseIcon(
    <>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 2.5v1.4M8 12.1v1.4M2.5 8h1.4M12.1 8h1.4M4.1 4.1l1 1M10.9 10.9l1 1M11.9 4.1l-1 1M5.1 10.9l-1 1" />
    </>,
  );
}

function IconChevron({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
    </svg>
  );
}
