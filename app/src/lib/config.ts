import path from "node:path";

/** 平台运行配置（全部来自环境变量，带安全默认值） */
export const config = {
  /** 用户项目工作区根目录 */
  workspaceRoot: process.env.WORKSPACE_ROOT
    ? path.resolve(process.env.WORKSPACE_ROOT)
    : path.resolve(process.cwd(), "..", "data", "projects"),
  portRangeMin: Number(process.env.PORT_RANGE_MIN ?? 4000),
  portRangeMax: Number(process.env.PORT_RANGE_MAX ?? 4999),
  chatModel: process.env.CHAT_MODEL ?? "gpt-4o",
  /** 各生成阶段所用模型（可按用途分别配置） */
  specModel: process.env.SPEC_MODEL ?? "gpt-4o",
  planModel: process.env.PLAN_MODEL ?? "gpt-4o",
  buildModel: process.env.BUILD_MODEL ?? "gpt-4o-mini",
  repairModel: process.env.REPAIR_MODEL ?? "gpt-4o",
  /** 单条命令最长执行时间 */
  commandTimeoutMs: Number(process.env.COMMAND_TIMEOUT_MS ?? 120_000),
  /** 工具返回内容的最大字符数 */
  maxToolOutputChars: Number(process.env.MAX_TOOL_OUTPUT_CHARS ?? 30_000),
  /** 模板根目录（内含 next-base） */
  templateRoot: process.env.TEMPLATE_ROOT
    ? path.resolve(process.env.TEMPLATE_ROOT)
    : path.resolve(process.cwd(), "..", "templates"),
  /** 模板 node_modules 快照缓存根目录 */
  templateCacheRoot: process.env.TEMPLATE_CACHE_ROOT
    ? path.resolve(process.env.TEMPLATE_CACHE_ROOT)
    : path.resolve(process.cwd(), "..", "data", ".template-cache"),
  /** pnpm 内容寻址仓库目录 */
  pnpmStoreDir: process.env.PNPM_STORE_DIR
    ? path.resolve(process.env.PNPM_STORE_DIR)
    : path.resolve(process.cwd(), "..", "data", ".pnpm-store"),
};
