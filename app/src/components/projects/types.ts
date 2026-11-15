/** 项目中心卡片所需的最小字段集合（来自 GET /api/projects）。 */
export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  status: string;
  favorited: boolean;
  /** 开发预览当前是否可访问，用于决定卡片里挂实时预览还是占位封面 */
  running: boolean;
  createdAt: string;
  updatedAt: string;
}
