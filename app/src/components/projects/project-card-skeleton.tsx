/** 项目卡片骨架屏：结构与真实卡片一致，避免加载完成后布局跳动。 */
export function ProjectCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-black/8 bg-white">
      <div className="project-skeleton aspect-[16/10] w-full border-b border-black/6" />
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="project-skeleton h-3 w-2/3 rounded-full" />
          <div className="project-skeleton h-2.5 w-1/3 rounded-full" />
        </div>
        <div className="project-skeleton h-6 w-6 flex-none rounded-full" />
      </div>
    </div>
  );
}

export function ProjectGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4"
      role="status"
      aria-label="正在加载项目"
    >
      {Array.from({ length: count }, (_, index) => (
        <ProjectCardSkeleton key={index} />
      ))}
    </div>
  );
}
