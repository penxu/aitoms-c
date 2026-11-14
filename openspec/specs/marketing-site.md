# Marketing Site Specification

> 来源：change `bootstrap-atoms-ai-builder`（2026-11-12 归档）
> 影响范围：首页 `/`

## Requirements

### Requirement: 落地页视觉复刻

以 `atoms-clone.html` 为唯一视觉基准，使用 Next.js + Tailwind + shadcn/ui 复刻全部区块：顶部横幅、导航、Hero、构建卡片、信任区、Logo 墙、AI 团队、工作流、视频区、bento、成功故事、定价、FAQ、最终 CTA、Footer。

实现位置：`app/src/app/page.tsx`、`app/src/components/marketing/marketing-page.tsx`、`app/src/app/marketing.css`

#### Scenario: 桌面端视觉一致
- GIVEN 用户以 ≥1280px 宽度访问首页
- WHEN 页面渲染完成
- THEN 各区块布局、配色（`--blue:#4267ff` 等设计令牌）、字体（IBM Plex Sans/Mono）与 atoms-clone.html 一致

#### Scenario: 响应式适配
- GIVEN 用户以 768px 或 375px 宽度访问首页
- WHEN 页面渲染完成
- THEN 布局无横向滚动，网格降为对应列数（断点 1024px / 640px）

### Requirement: Hero 输入框接入项目创建

Hero 区的输入框不是摆设，提交后创建项目并进入工作台。

#### Scenario: 从想法创建项目
- GIVEN 用户在 Hero 输入框填写需求描述并提交
- WHEN `POST /api/projects` 成功
- THEN 跳转到 `/app/{projectId}?q={描述}`，输入内容作为首条对话自动发送

### Requirement: 交互动画

#### Scenario: 滚动渐显
- GIVEN 用户向下滚动页面
- WHEN `.reveal` 元素进入视口
- THEN 元素以淡入上移动画出现（IntersectionObserver 实现）

#### Scenario: 定价周期切换
- GIVEN 定价区默认展示按年价格
- WHEN 用户切换月/年开关
- THEN 专业版与 Max 价格随周期切换显示

#### Scenario: FAQ 手风琴
- GIVEN FAQ 列表渲染完成
- WHEN 用户点击某个问题
- THEN 该项展开，再次点击收起，同时仅一项展开
