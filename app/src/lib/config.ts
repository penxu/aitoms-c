import path from "node:path";

/** 平台运行配置（全部来自环境变量，带安全默认值） */
export const config = {
  /** 用户项目工作区根目录 */
  workspaceRoot: process.env.WORKSPACE_ROOT
    ? path.resolve(process.env.WORKSPACE_ROOT)
    : path.resolve(process.cwd(), "..", "data", "projects"),
  workspaceExecutionBackend: (process.env.WORKSPACE_EXECUTION_BACKEND ?? "auto") as "auto" | "native" | "docker",
  workspaceContainerImage: process.env.WORKSPACE_CONTAINER_IMAGE ?? "node:22-bookworm-slim",
  chromiumPath: process.env.CHROMIUM_PATH ?? "",
  browserChannel: process.env.BROWSER_CHANNEL ?? (process.platform === "darwin" ? "chrome" : ""),
  acceptanceTimeoutMs: Number(process.env.ACCEPTANCE_TIMEOUT_MS ?? 300_000),
  /** 默认先交付可运行预览；完整业务浏览器验收由 full 显式开启。 */
  generationVerificationMode: process.env.GENERATION_VERIFICATION_MODE === "full" ? "full" : "preview",
  packageRegistry: process.env.PACKAGE_REGISTRY?.trim() || "https://registry.npmjs.org",
  portRangeMin: Number(process.env.PORT_RANGE_MIN ?? 4000),
  portRangeMax: Number(process.env.PORT_RANGE_MAX ?? 4999),
  /** 单轮对话等待上限，避免上游不返回时永久占用。 */
  generationStageTimeoutMs: Number(process.env.GENERATION_STAGE_TIMEOUT_MS ?? 900_000),
  generationModelTimeoutMs: Number(process.env.GENERATION_MODEL_TIMEOUT_MS ?? 300_000),
  modelChunkTimeoutMs: Number(process.env.MODEL_CHUNK_TIMEOUT_MS ?? 60_000),
  chatTimeoutMs: Number(process.env.CHAT_TIMEOUT_MS ?? 300_000),
  modelFirstChunkTimeoutMs: Number(process.env.MODEL_FIRST_CHUNK_TIMEOUT_MS ?? 60_000),
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
  /** 固定模板依赖预热与复用；关闭时保留独立安装链路。 */
  templateDependencyReuse: process.env.TEMPLATE_DEPENDENCY_REUSE !== "false",
  /** 模板 node_modules 快照缓存根目录 */
  templateCacheRoot: process.env.TEMPLATE_CACHE_ROOT
    ? path.resolve(process.env.TEMPLATE_CACHE_ROOT)
    : path.resolve(process.cwd(), "..", "data", ".template-cache"),
  /** pnpm 内容寻址仓库目录 */
  pnpmStoreDir: process.env.PNPM_STORE_DIR
    ? path.resolve(process.env.PNPM_STORE_DIR)
    : path.resolve(process.cwd(), "..", "data", ".pnpm-store"),
};
