# Tasks

## 1. 资源页

- [x] 1.1 新增 `/resources` 路由与 `ResourcesPage`，复用 `AppSidebar`，侧边栏「资源」可跳转并显示选中态。
- [x] 1.2 `发现 / 模板` 页签切换；发现页提供分类筛选、已保存过滤、最新/最热排序与数量提示。
- [x] 1.3 卡片展示预览图、标题、作者、浏览量；移动端单列、桌面 `auto-fill minmax(230px)` 多列。

## 2. 预览与数据

- [x] 2.1 `ShowcasePreview` 用 8 种布局（site/game/shop/dash/blog/card/poster/mobile）与配色纯 CSS 渲染首屏，无外链图片依赖。
- [x] 2.2 18 条示例应用 + 6 个起步模板数据集中在 `showcase-data.ts`。

## 3. 收藏与复用

- [x] 3.1 书签按钮切换收藏，状态写入 `localStorage`；移动端常显、桌面悬停显示。
- [x] 3.2 点击卡片/模板跳转 `/dashboard?q=<需求>`，工作台读取参数预填输入框。

## 验证

- `npm run lint`、`npm run typecheck`、`npm run test:unit` 通过；
- 交互核对：分类筛选（游戏 → 4 条）、最热排序（241/215/186/168）、收藏 → 已保存仅 1 条、模板页 6 张、点击模板后工作台输入框已预填；
- 布局核对：1440 四列、390 单列且筛选行换行不挤压。
