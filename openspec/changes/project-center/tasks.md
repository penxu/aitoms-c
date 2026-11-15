# Tasks

## 1. 项目中心页面

- [x] 1.1 新增 `/projects` 路由与 `ProjectsPage`，复用 `AppSidebar`，渲染「全部 / 已收藏」筛选与卡片网格；验证桌面 1440 / 平板 1100 / 移动 390 三档布局。
- [x] 1.2 卡片展示预览区、名称、创建日期与「…」菜单；菜单在卡片边界外正常展开，点击外部与 Esc 关闭。
- [x] 1.3 删除沿用二次确认浮层；确认后调用 `DELETE /api/projects/{id}` 并通知侧边栏刷新。

## 2. 预览与骨架屏

- [x] 2.1 运行时项目用 `/p/{id}/` 等比缩略预览，进入视口才探测与挂载；探测失败或未运行展示占位封面并标注「未运行」。
- [x] 2.2 加载态使用与卡片同构的骨架屏（含 shimmer 与 `prefers-reduced-motion` 降级）；验证加载前后不产生布局跳动。

## 3. 收藏与数据

- [x] 3.1 `projects` 增加 `favorited` 列，DDL 与已有库的幂等 ALTER 均覆盖；启动后旧数据默认未收藏。
- [x] 3.2 新增 `PATCH /api/projects/{id}`，校验布尔值并返回最新项目；`GET /api/projects` 附带 `running`。
- [x] 3.3 收藏采用乐观更新，失败回滚并提示；「已收藏」页签显示数量与空状态。

## 4. 入口

- [x] 4.1 侧边栏「项目」跳转 `/projects`（工作台与工作台内页一致），选中态正确。
- [x] 4.2 工作台「查看全部」跳转 `/projects`。

## 验证

- `npm run lint`、`npm run typecheck`、`npm run test:unit`（107 通过）均通过；
- 截图核对：卡片网格、菜单、删除确认、骨架屏、移动端；
- 接口核对：`GET /api/projects` 返回 `favorited` 与 `running`，`PATCH` 后持久化生效。
