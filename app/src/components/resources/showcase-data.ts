/**
 * 资源页展示数据（示例内容，用于呈现「别人发布过的应用」）。
 * 预览不依赖外链图片，全部由 ShowcasePreview 按 kind + palette 画出来。
 */

export type PreviewKind =
  | "site"
  | "game"
  | "shop"
  | "dash"
  | "blog"
  | "card"
  | "poster"
  | "mobile";

export interface Palette {
  /** 页面底色 */
  bg: string;
  /** 主文字 / 线条色 */
  ink: string;
  /** 强调色 */
  accent: string;
  /** 卡片 / 面板底色 */
  soft: string;
}

export interface ShowcaseApp {
  id: string;
  title: string;
  /** 点击卡片时带到工作台的初始需求 */
  prompt: string;
  author: string;
  views: number;
  category: string;
  kind: PreviewKind;
  palette: Palette;
  seed: number;
  createdAt: string;
}

export interface ShowcaseTemplate {
  id: string;
  title: string;
  desc: string;
  prompt: string;
  kind: PreviewKind;
  palette: Palette;
  seed: number;
}

const P = {
  snake: { bg: "#0e1a12", ink: "#e6f6dd", accent: "#7de86b", soft: "#17291b" },
  charcoal: { bg: "#131313", ink: "#f2f1ec", accent: "#d9d5c6", soft: "#1d1d1d" },
  paper: { bg: "#f8f6ef", ink: "#1b1914", accent: "#4267ff", soft: "#eceadd" },
  night: { bg: "#0b1020", ink: "#eef1ff", accent: "#b9c7ff", soft: "#161d33" },
  pitch: { bg: "#0c2a15", ink: "#e9fbe2", accent: "#6ddd67", soft: "#14391d" },
  mint: { bg: "#eef7f1", ink: "#12301f", accent: "#27a267", soft: "#ddefe5" },
  lemon: { bg: "#fdf6e2", ink: "#1f1a0d", accent: "#f3c316", soft: "#f7edc9" },
  sand: { bg: "#f4efe6", ink: "#2a2118", accent: "#c69a5f", soft: "#e9e0d1" },
  ink: { bg: "#0d1220", ink: "#e9edff", accent: "#5b7cff", soft: "#161d33" },
  slate: { bg: "#f6f7f9", ink: "#191b21", accent: "#4267ff", soft: "#e9ecf3" },
  amber: { bg: "#1a1208", ink: "#f4e7d0", accent: "#d7ae67", soft: "#2a1d0e" },
  cream: { bg: "#fff9ec", ink: "#2a2113", accent: "#ff8a3d", soft: "#f7ead4" },
  teal: { bg: "#eaf6f4", ink: "#0f2b29", accent: "#11a394", soft: "#d8ece9" },
  white: { bg: "#f2f3f5", ink: "#14161a", accent: "#4267ff", soft: "#ffffff" },
  warm: { bg: "#faf8f4", ink: "#231f19", accent: "#dd6f4a", soft: "#f0ece2" },
  violet: { bg: "#f5f1fb", ink: "#241b33", accent: "#7b5cf0", soft: "#e9e1f7" },
  rose: { bg: "#fdf2f4", ink: "#2b1418", accent: "#e2587a", soft: "#f8e2e7" },
  coffee: { bg: "#fbf7f0", ink: "#2a2018", accent: "#b5793a", soft: "#f0e8da" },
} satisfies Record<string, Palette>;

export const SHOWCASE_CATEGORIES = [
  "全部",
  "网站",
  "游戏",
  "设计",
  "电商",
  "数据看板",
  "生产力",
  "博客",
  "名片",
] as const;

export const SHOWCASE_APPS: ShowcaseApp[] = [
  {
    id: "snake-game",
    title: "帮我生成一个简易的贪吃蛇小游戏",
    prompt: "帮我生成一个简易的贪吃蛇小游戏，有分数、最高分和键盘方向键控制",
    author: "Atoms_1GKJ7ZY",
    views: 186,
    category: "游戏",
    kind: "game",
    palette: P.snake,
    seed: 3,
    createdAt: "2026-11-14T09:12:00+08:00",
  },
  {
    id: "dark-portfolio",
    title: "搭建一个暗色风格的作品集网站",
    prompt: "搭建一个暗色风格的设计师作品集网站，包含作品列表与联系方式",
    author: "杰克王",
    views: 150,
    category: "网站",
    kind: "site",
    palette: P.charcoal,
    seed: 1,
    createdAt: "2026-11-14T08:40:00+08:00",
  },
  {
    id: "outfit-ai",
    title: "AI 智能穿搭设计工具",
    prompt: "做一个 AI 智能穿搭设计工具，按场景推荐搭配并生成搭配卡片",
    author: "Atoms_7B17ZDKA",
    views: 265,
    category: "设计",
    kind: "mobile",
    palette: P.paper,
    seed: 5,
    createdAt: "2026-11-14T07:55:00+08:00",
  },
  {
    id: "moon",
    title: "月亮",
    prompt: "做一个以月亮为主题的沉浸式品牌首页，深色宇宙背景配大标题",
    author: "Atoms_N3SEGQL",
    views: 207,
    category: "设计",
    kind: "poster",
    palette: P.night,
    seed: 2,
    createdAt: "2026-11-13T22:18:00+08:00",
  },
  {
    id: "football",
    title: "帮我设计一个足球主题的小游戏",
    prompt: "帮我设计一个足球主题的小游戏，玩家点球射门，有比分和回合计时",
    author: "Atoms_PJVRM8J",
    views: 215,
    category: "游戏",
    kind: "game",
    palette: P.pitch,
    seed: 7,
    createdAt: "2026-11-13T20:02:00+08:00",
  },
  {
    id: "learn-chinese",
    title: "创建一个面向英语母语者的中文学习网站",
    prompt: "创建一个面向英语母语者的中文学习网站，含课程列表、拼音标注和练习",
    author: "por.chen",
    views: 227,
    category: "网站",
    kind: "site",
    palette: P.mint,
    seed: 4,
    createdAt: "2026-11-13T18:30:00+08:00",
  },
  {
    id: "phone-case",
    title: "积木手机壳推广示意图",
    prompt: "做一个积木手机壳的推广落地页，展示产品卖点、配色和购买按钮",
    author: "疯狂五部",
    views: 224,
    category: "电商",
    kind: "shop",
    palette: P.lemon,
    seed: 6,
    createdAt: "2026-11-13T16:11:00+08:00",
  },
  {
    id: "wedding-3d",
    title: "3D 婚纱设计工具",
    prompt: "做一个 3D 婚纱设计工具，可以切换面料、领型和场景预览",
    author: "274814505",
    views: 195,
    category: "设计",
    kind: "poster",
    palette: P.ink,
    seed: 8,
    createdAt: "2026-11-13T14:47:00+08:00",
  },
  {
    id: "tetris",
    title: "帮我设计一个俄罗斯方块",
    prompt: "帮我设计一个俄罗斯方块，支持暂停、下一块预览和消除计分",
    author: "Atoms_0P9CVG2",
    views: 241,
    category: "游戏",
    kind: "game",
    palette: P.ink,
    seed: 9,
    createdAt: "2026-11-13T12:05:00+08:00",
  },
  {
    id: "ride-dashboard",
    title: "帮我做一个可视化网约车新媒体看板",
    prompt: "帮我做一个网约车业务的新媒体数据看板，含订单趋势、城市分布和渠道对比",
    author: "Atoms_5H2KQ8T",
    views: 178,
    category: "数据看板",
    kind: "dash",
    palette: P.slate,
    seed: 2,
    createdAt: "2026-11-13T10:26:00+08:00",
  },
  {
    id: "temple",
    title: "生成一张五百罗汉殿的效果图",
    prompt: "生成一张五百罗汉殿的概念效果图页面，带光效与文字说明",
    author: "Atoms_2QW8LM4",
    views: 132,
    category: "设计",
    kind: "poster",
    palette: P.amber,
    seed: 11,
    createdAt: "2026-11-12T21:39:00+08:00",
  },
  {
    id: "fruit-game",
    title: "创作一个可以玩的接水果小游戏",
    prompt: "创作一个可以玩的接水果小游戏，篮子跟随鼠标移动，接住水果加分",
    author: "Atoms_9KX3VB1",
    views: 168,
    category: "游戏",
    kind: "game",
    palette: P.cream,
    seed: 12,
    createdAt: "2026-11-12T19:14:00+08:00",
  },
  {
    id: "camp-booking",
    title: "帮我做一个周末露营地预约网站",
    prompt: "帮我做一个周末露营地预约网站，含营位日历、价格和在线预订",
    author: "阿野",
    views: 143,
    category: "电商",
    kind: "shop",
    palette: P.teal,
    seed: 3,
    createdAt: "2026-11-12T17:08:00+08:00",
  },
  {
    id: "name-card",
    title: "帮我做一张设计师个人名片页",
    prompt: "帮我做一张设计师个人名片页，含头像、职位、作品入口和联系方式",
    author: "Atoms_4C9FDR2",
    views: 121,
    category: "名片",
    kind: "card",
    palette: P.white,
    seed: 1,
    createdAt: "2026-11-12T15:22:00+08:00",
  },
  {
    id: "podcast",
    title: "搭建一个播客节目主页",
    prompt: "搭建一个播客节目主页，含最新一期、往期列表和订阅入口",
    author: "声波FM",
    views: 156,
    category: "博客",
    kind: "blog",
    palette: P.warm,
    seed: 4,
    createdAt: "2026-11-12T11:45:00+08:00",
  },
  {
    id: "coffee-brand",
    title: "咖啡店品牌官网",
    prompt: "做一个手冲咖啡店的品牌官网，含门店故事、菜单和会员卡",
    author: "山丘咖啡",
    views: 189,
    category: "网站",
    kind: "site",
    palette: P.coffee,
    seed: 6,
    createdAt: "2026-11-11T20:31:00+08:00",
  },
  {
    id: "okr-board",
    title: "做一个团队 OKR 看板",
    prompt: "做一个团队 OKR 看板，支持目标进度、负责人和季度筛选",
    author: "产品小组",
    views: 134,
    category: "生产力",
    kind: "dash",
    palette: P.violet,
    seed: 5,
    createdAt: "2026-11-11T16:09:00+08:00",
  },
  {
    id: "kids-reading",
    title: "做一个儿童英语绘本阅读小程序",
    prompt: "做一个儿童英语绘本阅读小程序，含分级书单、朗读和打卡",
    author: "Atoms_7YH2QD5",
    views: 202,
    category: "生产力",
    kind: "mobile",
    palette: P.rose,
    seed: 7,
    createdAt: "2026-11-11T10:12:00+08:00",
  },
];

export const SHOWCASE_TEMPLATES: ShowcaseTemplate[] = [
  {
    id: "tpl-saas",
    title: "SaaS 落地页",
    desc: "首屏 · 特性 · 定价 · FAQ",
    prompt: "做一个 SaaS 产品落地页，包含首屏、特性介绍、定价与常见问题",
    kind: "site",
    palette: P.paper,
    seed: 2,
  },
  {
    id: "tpl-booking",
    title: "预约系统",
    desc: "服务列表 · 在线预约 · 后台查看",
    prompt: "做一个宠物美容预约网站，有服务介绍、预约表单、后台查看预约",
    kind: "shop",
    palette: P.mint,
    seed: 4,
  },
  {
    id: "tpl-dashboard",
    title: "数据看板",
    desc: "指标卡片 · 趋势图 · 明细表",
    prompt: "做一个销售数据看板，有指标卡片、折线图和订单明细表",
    kind: "dash",
    palette: P.slate,
    seed: 3,
  },
  {
    id: "tpl-portfolio",
    title: "个人作品集",
    desc: "首屏 · 作品 · 联系",
    prompt: "做一个设计师个人作品集网站，含首屏、作品列表和联系方式",
    kind: "site",
    palette: P.charcoal,
    seed: 5,
  },
  {
    id: "tpl-shop",
    title: "电商活动页",
    desc: "主视觉 · 商品 · 下单",
    prompt: "做一个电商活动落地页，含主视觉、商品列表和下单入口",
    kind: "shop",
    palette: P.lemon,
    seed: 6,
  },
  {
    id: "tpl-poster",
    title: "活动海报页",
    desc: "主视觉 · 信息 · 报名",
    prompt: "做一个线下活动海报页，含主视觉、时间地点和报名表单",
    kind: "poster",
    palette: P.violet,
    seed: 8,
  },
];
