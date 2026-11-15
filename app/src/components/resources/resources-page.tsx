"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bookmark, Clock3, Flame } from "lucide-react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ShowcaseCard, TemplateCard } from "./showcase-card";
import { SHOWCASE_APPS, SHOWCASE_CATEGORIES, SHOWCASE_TEMPLATES } from "./showcase-data";

type ViewTab = "discover" | "templates";
type SortMode = "new" | "hot";

const SAVED_KEY = "atoms.resources.saved";

export function ResourcesPage() {
  const [tab, setTab] = useState<ViewTab>("discover");
  const [category, setCategory] = useState<string>("全部");
  const [sort, setSort] = useState<SortMode>("new");
  const [savedOnly, setSavedOnly] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setSaved(parsed.filter((item): item is string => typeof item === "string"));
        }
      }
    } catch {
      /* 本地存储不可用时忽略 */
    }
  }, []);

  function toggleSaved(id: string) {
    setSaved((list) => {
      const next = list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
      try {
        window.localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      } catch {
        /* 忽略写入失败 */
      }
      return next;
    });
  }

  const apps = useMemo(() => {
    const list = SHOWCASE_APPS.filter(
      (app) =>
        (category === "全部" || app.category === category) && (!savedOnly || saved.includes(app.id)),
    );
    return [...list].sort((a, b) =>
      sort === "hot"
        ? b.views - a.views
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [category, saved, savedOnly, sort]);

  return (
    <div
      className="dashboard-shell flex h-dvh flex-col bg-[#f8f8f5] text-[#0c0c0c]"
      style={{ fontFamily: "var(--font-ibm-plex-sans), system-ui, sans-serif" }}
    >
      <div className="flex min-h-0 flex-1">
        <AppSidebar active="resources" />

        <main className="relative min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1240px] px-5 pb-16 pt-14 sm:px-8 lg:pt-9">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-[22px] font-semibold tracking-[-0.02em]">资源</h1>
              <Link
                href="/dashboard"
                className="flex items-center gap-1 text-[12.5px] text-black/45 transition hover:text-black"
              >
                我的个人主页
                <ArrowUpRight size={13} />
              </Link>
            </div>

            <div className="mt-6 inline-flex items-center gap-1 rounded-full bg-black/5 p-1">
              {([
                { key: "discover", label: "发现" },
                { key: "templates", label: "模板" },
              ] as const).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  aria-pressed={tab === item.key}
                  className={`h-7 rounded-full px-3.5 text-[12.5px] transition ${
                    tab === item.key
                      ? "bg-white font-medium text-black shadow-[0_1px_2px_rgba(12,12,12,0.08)]"
                      : "text-black/45 hover:text-black/70"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {tab === "discover" ? (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <div className="-mx-1 flex min-w-0 flex-1 basis-full items-center gap-1 overflow-x-auto px-1 pb-1 sm:basis-0">
                  {SHOWCASE_CATEGORIES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setCategory(item)}
                      aria-pressed={category === item}
                      className={`h-8 flex-none rounded-full px-2.5 text-[12.5px] transition ${
                        category === item
                          ? "font-medium text-black"
                          : "text-black/45 hover:text-black/70"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>

                <div className="flex flex-none items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={savedOnly}
                    onClick={() => setSavedOnly((value) => !value)}
                    className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] transition ${
                      savedOnly
                        ? "bg-[#eef1ff] font-medium text-[#4267ff]"
                        : "text-black/45 hover:bg-black/5 hover:text-black/70"
                    }`}
                  >
                    <Bookmark size={13} fill={savedOnly ? "currentColor" : "none"} />
                    已保存
                  </button>
                  <button
                    type="button"
                    onClick={() => setSort((value) => (value === "new" ? "hot" : "new"))}
                    className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] text-black/45 transition hover:bg-black/5 hover:text-black/70"
                  >
                    {sort === "new" ? <Clock3 size={13} /> : <Flame size={13} />}
                    {sort === "new" ? "最新" : "最热"}
                  </button>
                  <span className="hidden text-[12px] text-black/30 sm:inline">共 {apps.length} 个</span>
                </div>
              </div>
            ) : null}

            <div className="mt-4">
              {tab === "templates" ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
                  {SHOWCASE_TEMPLATES.map((template) => (
                    <TemplateCard key={template.id} template={template} />
                  ))}
                </div>
              ) : apps.length === 0 ? (
                <div className="flex flex-col items-center rounded-2xl border border-dashed border-black/10 px-6 py-16 text-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#eef1ff,#f6ecff)] text-[#4267ff]">
                    <Bookmark size={18} />
                  </span>
                  <p className="mt-4 text-[13.5px] font-medium">
                    {savedOnly ? "还没有保存的应用" : "这个分类还没有应用"}
                  </p>
                  <p className="mt-1 max-w-[320px] text-[12.5px] leading-relaxed text-black/45">
                    {savedOnly
                      ? "把鼠标移到卡片右上角点击书签，就能把喜欢的应用收在这里。"
                      : "换个分类看看，或者切回「全部」。"}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
                  {apps.map((app) => (
                    <ShowcaseCard
                      key={app.id}
                      app={app}
                      saved={saved.includes(app.id)}
                      onToggleSaved={toggleSaved}
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
