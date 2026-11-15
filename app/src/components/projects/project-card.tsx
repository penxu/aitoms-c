"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  LoaderCircle,
  MoreHorizontal,
  Star,
  StarOff,
  Trash2,
} from "lucide-react";
import { ProjectPreview } from "./project-preview";
import type { ProjectSummary } from "./types";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function ProjectCard({
  project,
  favoriteBusy,
  deleting,
  onToggleFavorite,
  onDelete,
}: {
  project: ProjectSummary;
  favoriteBusy: boolean;
  deleting: boolean;
  onToggleFavorite: (project: ProjectSummary) => void;
  onDelete: (project: ProjectSummary) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <article
      className={`group relative rounded-2xl border border-black/8 bg-white transition hover:border-black/16 hover:shadow-[0_10px_28px_rgba(12,12,12,0.07)] ${
        menuOpen ? "z-20" : ""
      }`}
    >
      <Link
        href={`/app/${project.id}`}
        aria-label={`打开项目 ${project.name}`}
        className="relative block aspect-[16/10] w-full overflow-hidden rounded-t-2xl border-b border-black/6"
      >
        <ProjectPreview projectId={project.id} name={project.name} running={project.running} />
        {project.favorited ? (
          <span
            role="img"
            aria-label="已收藏"
            className="absolute left-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/92 text-[#eaa51c] shadow-[0_1px_4px_rgba(12,12,12,0.12)]"
          >
            <Star size={12} fill="currentColor" strokeWidth={0} />
          </span>
        ) : null}
      </Link>

      <div className="flex items-start gap-2 px-4 py-3">
        <Link href={`/app/${project.id}`} className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-medium text-[#131410]">{project.name}</h3>
          <p className="mt-0.5 text-[11.5px] text-black/40">{formatDate(project.createdAt)}</p>
        </Link>

        <div ref={menuRef} className="relative flex-none">
          <button
            type="button"
            aria-label={`项目操作 ${project.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-black/30 transition hover:bg-black/5 hover:text-black/70 focus-visible:ring-2 focus-visible:ring-[#4267ff]/35 focus-visible:outline-none"
          >
            {favoriteBusy ? (
              <LoaderCircle size={15} className="animate-spin" />
            ) : (
              <MoreHorizontal size={16} />
            )}
          </button>

          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-8 z-20 w-[152px] overflow-hidden rounded-xl border border-black/8 bg-white p-1 shadow-[0_14px_34px_rgba(12,12,12,0.14)]"
            >
              <Link
                role="menuitem"
                href={`/app/${project.id}`}
                className="flex h-8 items-center gap-2 rounded-lg px-2.5 text-[12.5px] text-black/70 hover:bg-black/5 hover:text-black"
              >
                <ExternalLink size={14} />打开项目
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onToggleFavorite(project);
                }}
                className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[12.5px] text-black/70 hover:bg-black/5 hover:text-black"
              >
                {project.favorited ? <StarOff size={14} /> : <Star size={14} />}
                {project.favorited ? "取消收藏" : "收藏"}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirming(true);
                }}
                className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[12.5px] text-[#c53b40] hover:bg-[#e5484d]/8"
              >
                <Trash2 size={14} />删除项目
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {confirming ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/94 px-4 text-center backdrop-blur-[2px]">
          <p className="text-[13px] font-medium">删除这个项目？</p>
          <p className="text-[11.5px] leading-relaxed text-black/45">
            项目文件、会话与发布记录会一并删除，且不可恢复。
          </p>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="h-7 rounded-full px-3 text-[12px] text-black/55 transition hover:bg-black/5 hover:text-black"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => onDelete(project)}
              disabled={deleting}
              className="flex h-7 items-center gap-1 rounded-full bg-[#e5484d] px-3 text-[12px] font-medium text-white transition hover:bg-[#c53b40] disabled:opacity-60"
            >
              {deleting ? (
                <>
                  <LoaderCircle size={12} className="animate-spin" />
                  删除中
                </>
              ) : (
                "确认删除"
              )}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
