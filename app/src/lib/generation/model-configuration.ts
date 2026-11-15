/** Shared preflight for generation and chat; never includes credential values. */
export function getModelConfigurationError(env: { OPENAI_API_KEY?: string } = { OPENAI_API_KEY: process.env.OPENAI_API_KEY }) {
  const key = env.OPENAI_API_KEY?.trim();
  if (key && key !== "stub") return null;
  return {
    code: "MODEL_NOT_CONFIGURED",
    error: "尚未配置可用模型。请在 app/.env.local 设置有效的 OPENAI_API_KEY；兼容服务还需设置 OPENAI_BASE_URL 和 CHAT_MODEL、SPEC_MODEL、PLAN_MODEL、BUILD_MODEL、REPAIR_MODEL，然后重启平台并重试。",
  };
}
