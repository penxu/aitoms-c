"use client";

import Link from "next/link";
import { ArrowUpRight, Bookmark, Eye } from "lucide-react";
import { ShowcasePreview } from "./showcase-preview";
import type { ShowcaseApp, ShowcaseTemplate } from "./showcase-data";

/** 点击卡片会把这条需求带到工作台，直接开一个新项目 */
function startHref(prompt: string) {
  return `/dashboard?q=${encodeURIComponent(prompt)}`;
}

export function ShowcaseCard({
  app,
  saved,
  onToggleSaved,
}: {
  app: ShowcaseApp;
  saved: boolean;
  onToggleSaved: (id: string) => void;
}) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-black/8 bg-white transition duration-200 hover:-translate-y-0.5 hover:border-black/16 hover:shadow-[0_12px_30px_rgba(12,12,12,0.08)]">
      <Link href={startHref(app.prompt)} aria-label={`用「${app.title}」的想法开始构建`} className="block">
        <div className="relative aspect-[16/11] w-full overflow-hidden border-b border-black/6">
          <ShowcasePreview kind={app.kind} palette={app.palette} seed={app.seed} />
        </div>
        <div className="flex items-start gap-2.5 px-3.5 py-3">
          <span className="mt-px flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[linear-gradient(135deg,#4267ff,#8f7bff)] text-[11px] font-semibold text-white">
            {app.author.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[13px] font-medium leading-5 text-[#14140f]">{app.title}</h3>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-black/40">
              <span className="truncate">{app.author}</span>
              <span className="text-black/20">·</span>
              <Eye size={11} className="flex-none" />
              <span className="flex-none">{app.views}</span>
            </p>
          </div>
        </div>
      </Link>

      <button
        type="button"
        aria-label={saved ? `取消保存 ${app.title}` : `保存 ${app.title}`}
        aria-pressed={saved}
        onClick={() => onToggleSaved(app.id)}
        className={`absolute right-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/92 text-black/45 shadow-[0_1px_4px_rgba(12,12,12,0.14)] backdrop-blur transition hover:bg-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 ${
          saved ? "text-[#4267ff] sm:opacity-100" : ""
        }`}
      >
        <Bookmark size={13} fill={saved ? "currentColor" : "none"} />
      </button>
    </article>
  );
}

export function TemplateCard({ template }: { template: ShowcaseTemplate }) {
  return (
    <Link
      href={startHref(template.prompt)}
      className="group relative block overflow-hidden rounded-2xl border border-black/8 bg-white transition duration-200 hover:-translate-y-0.5 hover:border-black/16 hover:shadow-[0_12px_30px_rgba(12,12,12,0.08)]"
    >
      <div className="relative aspect-[16/11] w-full overflow-hidden border-b border-black/6">
        <ShowcasePreview kind={template.kind} palette={template.palette} seed={template.seed} />
        <span className="absolute left-2.5 top-2.5 rounded-full bg-white/90 px-2 py-0.5 text-[10.5px] font-medium text-black/55">
          模板
        </span>
      </div>
      <div className="flex items-start gap-2 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-medium text-[#14140f]">{template.title}</h3>
          <p className="mt-0.5 truncate text-[11px] text-black/40">{template.desc}</p>
        </div>
        <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-black/25 transition group-hover:bg-black/5 group-hover:text-black/60">
          <ArrowUpRight size={14} />
        </span>
      </div>
    </Link>
  );
}
