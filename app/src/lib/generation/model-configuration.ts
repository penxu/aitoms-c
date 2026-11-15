/** 生成与对话共用的配置预检；错误不得回显凭据值。 */
export function getModelConfigurationError(env: { OPENAI_API_KEY?: string } = { OPENAI_API_KEY: process.env.OPENAI_API_KEY }) {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key || key === "stub") return {
    code: "MODEL_NOT_CONFIGURED",
    error: "尚未配置可用模型。请在平台运行环境（面板环境变量或 app/.env.local）设置有效的 OPENAI_API_KEY；兼容服务还需设置 OPENAI_BASE_URL 和 CHAT_MODEL、SPEC_MODEL、PLAN_MODEL、BUILD_MODEL、REPAIR_MODEL，然后重启平台并重试。",
  };
  if (!/^[\x21-\x7e]+$/.test(key)) return {
    code: "MODEL_CONFIGURATION_INVALID",
    error: "OPENAI_API_KEY 配置无效：包含中文、空白或控制字符，无法构造模型鉴权请求头。请从模型服务商复制真实密钥替换占位内容，勿对密钥做 URL/Base64 编码，然后重启平台。密钥值不会显示在错误信息中。",
  };
  return null;
}
