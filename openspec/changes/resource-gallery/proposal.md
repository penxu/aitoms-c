# Proposal

## Why

侧边栏的「资源」一直标记为「即将上线」。产品需要一个能展示「别人发布过的应用」的灵感广场：用户可以按分类浏览、收藏、把别人的想法一键带回工作台。

## What Changes

- 新增 `/resources` 资源页：`发现 / 模板` 两个页签，发现页为「分类 + 已保存 + 最新/最热」筛选的应用卡片网格，模板页为起步模板卡片。
- 应用卡片包含预览图、标题、作者与浏览量；预览图由 `ShowcasePreview` 按 `kind + palette` 用色块拼出应用首屏，不依赖外链图片与截图服务。
- 卡片支持悬停/移动端常显的书签按钮，收藏状态存在 `localStorage`，「已保存」可按收藏过滤。
- 点击卡片或模板会把对应需求带到 `/dashboard?q=…`，工作台读取参数预填输入框。
- 侧边栏「资源」由禁用态改为 `/resources` 入口并带选中态。

## Capabilities

### New Capabilities

- `resource-gallery`: 资源页的浏览、分类、收藏与模板复用。

### Modified Capabilities

无。资源页为独立页面，复用现有侧边栏与工作台，不改动生成、发布与存储行为。

## Impact

- 代码：`app/src/app/resources/page.tsx`、`components/resources/*`、`components/layout/app-sidebar.tsx`（`active` 增加 `resources`）、`components/dashboard/dashboard-page.tsx`（读取 `?q=` 预填）。
- 数据：无数据库变更；收藏仅为本地存储。
- 说明：示例应用与作者信息为虚构内容，用于呈现页面形态。
