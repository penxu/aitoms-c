/**
 * 项目集合变更（删除项目等）后通知其他区域刷新。
 * 侧边栏与项目中心各自拉取列表，用一个轻量事件避免引入全局状态。
 */
export const PROJECTS_CHANGED_EVENT = "atoms:projects-changed";

export function notifyProjectsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT));
}

export function onProjectsChanged(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(PROJECTS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, handler);
}
