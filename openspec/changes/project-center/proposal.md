# Proposal

## Why

工作台的「项目」只是一个页签内的行式列表：没有预览，无法一眼认出是哪个应用；也没有收藏与加载骨架，项目一多就难找、首屏会闪。需要把它升级为独立的项目中心页面。

## What Changes

- 新增 `/projects` 项目中心路由：左侧沿用工作台侧边栏，右侧为「全部 / 已收藏」筛选 + 项目卡片网格。
- 卡片包含预览区、项目名、创建日期与「…」操作菜单（打开 / 收藏 / 删除），删除沿用二次确认。
- 预览区优先展示项目真实页面：服务在运行时用 `/p/{id}/` 等比缩略成卡片大小（不可交互）；未运行时显示占位封面，避免把「服务未运行」错误页塞进卡片。
- `projects` 表新增 `favorited` 列（含已有库的幂等 ALTER），`GET /api/projects` 附带 `running`，新增 `PATCH /api/projects/{id}` 更新收藏。
- 加载态改为与卡片同构的骨架屏（含 `prefers-reduced-motion` 降级），消除加载完成后布局跳动。
- 侧边栏「项目」改为跳转 `/projects`；工作台「查看全部」同样指向该页。

## Capabilities

### New Capabilities

- `project-center`: 项目卡片网格、实时预览、收藏筛选与加载骨架。

### Modified Capabilities

- `data-persistence`: `projects` 增加 `favorited` 列及幂等迁移。

## Impact

- 代码：`app/src/app/projects/page.tsx`、`components/projects/*`、`components/layout/app-sidebar.tsx`、`components/dashboard/dashboard-page.tsx`、`lib/db/{schema,index,queries}.ts`、`app/api/projects/{route.ts,[id]/route.ts}`、`globals.css`。
- 数据：`projects.favorited INTEGER NOT NULL DEFAULT 0`，旧库启动时自动补列，不影响既有项目。
- 运行时：预览仅在项目「正在运行」且进入视口时挂载 iframe，避免批量拉起子进程。
