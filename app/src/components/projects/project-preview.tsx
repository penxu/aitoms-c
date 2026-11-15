"use client";

import { useEffect, useRef, useState } from "react";

/** 预览按桌面宽度等比缩放进卡片，保证截取的是首屏排版 */
const PREVIEW_WIDTH = 1280;
const PREVIEW_HEIGHT = 800;

type PreviewState = "probing" | "live" | "offline";

/**
 * 项目卡片预览。
 * - 服务在运行时，用 /p/{id}/ 的真实页面做等比缩略图（不可交互）；
 * - 未运行或探测失败时退回占位封面，避免把「服务未运行」错误页塞进卡片。
 */
export function ProjectPreview({
  projectId,
  name,
  running,
}: {
  projectId: string;
  name: string;
  running: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PreviewState>(running ? "probing" : "offline");
  const [loaded, setLoaded] = useState(false);
  const [scale, setScale] = useState(0.25);
  const [visible, setVisible] = useState(false);

  // 进入视口才探测/加载，避免一屏之外的卡片同时拉起多个项目服务
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const sync = () => setScale(el.clientWidth / PREVIEW_WIDTH);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !running) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/p/${projectId}/`, { method: "HEAD", cache: "no-store" });
        if (!cancelled) setState(res.ok ? "live" : "offline");
      } catch {
        if (!cancelled) setState("offline");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, running, visible]);

  const live = state === "live";

  return (
    <div ref={boxRef} className="relative h-full w-full overflow-hidden bg-[#f7f7f3]">
      {live ? (
        <>
          {!loaded && <div className="project-skeleton absolute inset-0" aria-hidden />}
          <iframe
            src={`/p/${projectId}/`}
            title={`${name} 预览`}
            tabIndex={-1}
            aria-hidden
            loading="lazy"
            onLoad={() => setLoaded(true)}
            className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
            style={{
              width: PREVIEW_WIDTH,
              height: PREVIEW_HEIGHT,
              transform: `scale(${scale})`,
            }}
          />
        </>
      ) : (
        <div className="relative flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#f6f7f1_0%,#eef1fb_100%)]">
          <div className="w-[58%] rounded-md border border-black/6 bg-white/85 p-2 shadow-[0_6px_18px_rgba(12,12,12,0.05)]">
            <div className="flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff5f57]/60" />
              <span className="h-1.5 w-1.5 rounded-full bg-[#febc2e]/60" />
              <span className="h-1.5 w-1.5 rounded-full bg-[#28c840]/60" />
            </div>
            <div className="mt-2 space-y-1">
              <div className="h-1.5 w-3/4 rounded-full bg-black/8" />
              <div className="h-1.5 w-1/2 rounded-full bg-black/6" />
            </div>
          </div>
          <span className="absolute bottom-2 left-3 flex items-center gap-1 text-[10px] text-black/35">
            <span className="h-1 w-1 rounded-full bg-black/25" />
            {state === "probing" ? "预览加载中" : "未运行"}
          </span>
        </div>
      )}
    </div>
  );
}
