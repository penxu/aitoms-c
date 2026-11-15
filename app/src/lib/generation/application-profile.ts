export type ApplicationKind = "showcase" | "admin" | "form" | "game";

export interface ApplicationProfile {
  kind: ApplicationKind;
  layout: { shell: ApplicationKind; sections: string[]; maxWidth: string };
  tokens: Record<string, string>;
  components: { importPath: string; exports: string[]; usage: string }[];
  responsiveRules: string[];
  stateRules: string[];
  accessibilityRules: string[];
}

const COMPONENTS: ApplicationProfile["components"] = [
  { importPath: "@/components/app/navigation-link", exports: ["NavigationLink"], usage: "必要的独立页面导航，API同next/link，pending时立即显示正在打开；普通同页业务操作用按钮。" },
  { importPath: "@/components/app/app-shell", exports: ["AppShell"], usage: "页面唯一主容器；variant=showcase/admin/form/game，brand/navigation/actions/footer为ReactNode，children为正文，不再嵌套main。" },
  { importPath: "@/components/app/page-header", exports: ["PageHeader"], usage: "title必填并输出h1；eyebrow/description/actions可选，页面只用一个主标题。" },
  { importPath: "@/components/app/empty-state", exports: ["EmptyState"], usage: "title必填，description/icon/action可选；零数据提供真实引导操作，默认role=status。" },
  { importPath: "@/components/app/metric-card", exports: ["MetricCard"], usage: "label/value必填，detail可选；指标来自真实数据，不能伪造增长率。" },
  { importPath: "@/components/app/form-field", exports: ["FormField"], usage: "id/label/children必填，hint/error/required可选；children为单个Input/input/select/textarea，自动关联label与aria-describedby。" },
];

const LAYOUTS: Record<ApplicationKind, ApplicationProfile["layout"]> = {
  showcase: { shell: "showcase", sections: ["清晰的价值主张与主要行动", "产品或服务的核心内容", "可信信息与下一步行动"], maxWidth: "76rem" },
  admin: { shell: "admin", sections: ["导航与当前工作区", "关键指标与筛选工具", "真实数据列表及详情操作"], maxWidth: "90rem" },
  form: { shell: "form", sections: ["任务说明与步骤", "分组字段与即时校验", "提交确认与成功回执"], maxWidth: "48rem" },
  game: { shell: "game", sections: ["规则与开始入口", "独立的游戏区域与输入控制", "分数状态与结束后重新开始"], maxWidth: "64rem" },
};

/** 从原始需求选骨架，作为SPEC/BUILD上下文而非业务需求的替代品。 */
export function getApplicationProfile(requirement: string): ApplicationProfile {
  const text = requirement.toLowerCase();
  const gameInteraction = /小游戏|贪吃蛇|消除|扫雷|得分|分数|键盘|触屏|playable|keyboard|controls|score|snake|puzzle/.test(text);
  const showcaseIntent = /官网|落地页|作品展示|作品集|landing page|portfolio|marketing website/.test(text);
  const kind: ApplicationKind = /后台|管理系统|管理平台|订单管理|客户管理|库存管理|数据看板|仪表盘|\b(?:dashboard|admin|inventory|management)\b/.test(text) ? "admin"
    : /表单|预约|报名|问卷|登记|申请|\b(?:form|booking|registration|survey)\b/.test(text) ? "form"
    : gameInteraction || (!showcaseIntent && /游戏|\bgame\b/.test(text)) ? "game"
    : "showcase";
  return {
    kind,
    layout: { ...LAYOUTS[kind], sections: [...LAYOUTS[kind].sections] },
    tokens: {
      "--background": "#f7f8fa", "--foreground": "#18212f", "--surface": "#ffffff",
      "--primary": kind === "game" ? "#6d28d9" : "#1d4ed8", "--primary-foreground": "#ffffff",
      "--muted": "#eef1f5", "--muted-foreground": "#526174", "--border": "#d6dde7",
      "--danger": "#b42318", "--ring": "#2563eb", "--radius": "1rem", "--content-width": LAYOUTS[kind].maxWidth,
    },
    components: COMPONENTS.map((component) => ({ ...component, exports: [...component.exports] })),
    responsiveRules: [
      "移动端从单列布局开始；标题和主要行动按内容换行，导航可换行且不隐藏关键入口。",
      "指标区使用metric-grid、表单使用field-grid；宽屏增加列数，窄屏回到一列。",
      "长列表/表格放入table-scroll容器；图片与游戏区域受容器宽度约束，页面本身不横向溢出。",
    ],
    stateRules: [
      "默认单页工作台，同页完成新建、编辑、详情与列表；轻量表单立即打开，重型编辑器按需加载，保留未保存保护。必要路由跳转用NavigationLink和loading边界反馈。",
      "异步操作区分初始、加载、空数据、错误失败、成功状态；错误给出可执行的重试或修正入口。",
      "提交或保存期间防止重复操作；保留已填写信息，在完成时反馈真实结果，不展示伪造成功。",
      kind === "game" ? "游戏必须支持未开始、进行中、暂停或失焦、结束及重新开始；键盘与触屏均可操作。"
        : kind === "form" ? "必填字段、格式错误和服务端错误分别反馈；成功回执包含可核对的信息。"
        : kind === "admin" ? "零数据、无筛选结果和请求失败使用不同文案；删除与批量操作需要可恢复或确认机制。"
        : "主要行动有明确目标；展示内容加载失败与空内容时提供替代说明。",
    ],
    accessibilityRules: [
      "所有交互支持键盘操作与可见焦点；使用原生按钮/链接，图标按钮有可访问名称。",
      "使用AppShell跳转链接、单一h1及语义地标；FormField连接标签、提示、错误，不只靠颜色传达状态。",
      "保留prefers-reduced-motion规则；避免强制动画或自动播放，文字与背景保持足够对比。",
    ],
  };
}
