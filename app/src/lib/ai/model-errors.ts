/**
 * 把模型调用异常翻译成可操作的中文提示。
 * 原始堆栈只写服务端日志，不直接抛给浏览器。
 */
export function describeModelError(error: unknown): string {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? "");
  const text = raw.toLowerCase();

  if (/bytestring/.test(text)) return "模型请求头配置无效：请检查 OPENAI_API_KEY 是否含中文占位内容或控制字符，替换为服务商的真实密钥后重启；不要编码密钥，也无需改写业务应用。";
  if (/docker/.test(text) && /permission denied|eacces/.test(text)) return "工程执行环境权限不足：平台运行用户无法读取 Docker 配置或连接 Docker daemon。请检查面板运行用户、Docker 连接配置和 socket 访问权限；修复前无法安装、构建或预览，不能通过重写应用解决。";
  if (/timeout|timed out/.test(text)) {
    return "模型或工具等待超时，本轮已停止。可以继续原任务，无需重新生成工程。";
  }
  if (/invalid prompt|system messages are not allowed/.test(text)) {
    return "对话历史包含模型接口不接受的消息角色，请刷新页面后重试。";
  }
  if (/401|unauthorized|invalid api key|incorrect api key|authentication/.test(text)) {
    return "模型鉴权失败：请确认 app/.env.local 的 OPENAI_API_KEY 有效，然后重启平台。";
  }
  if (/404|model_not_found|model not found|no such model|does not exist/.test(text)) {
    return "模型不存在：请检查 CHAT_MODEL / SPEC_MODEL 等模型名是否为服务商支持的名称。";
  }
  if (/429|rate limit|too many requests|quota|insufficient/.test(text)) {
    return "模型服务限流或额度不足，请稍后重试。";
  }
  if (/context length|maximum context|too many tokens/.test(text)) {
    return "对话上下文超出模型上限，请新建对话或缩短历史后重试。";
  }
  if (/econn|enotfound|etimedout|fetch failed|network|socket hang up/.test(text)) {
    return "无法连接模型服务：请检查 OPENAI_BASE_URL 与服务器网络。";
  }
  return `模型调用失败：${raw.slice(0, 200)}`;
}

/**
 * 把前端拿到的 error（可能是字符串、Error 或 JSON 对象）转成一行可读文本。
 * 对象直接 String() 只会得到 "[object Object]"，这里改为序列化。
 */
export function formatErrorDetail(error: unknown): string {
  if (error == null) return "";
  const text =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : serialize(error);
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(text)) {
    return "请求没有发出去：请确认平台服务仍在运行、网络正常，然后重试。";
  }
  return text;
}

function serialize(error: unknown): string {
  try {
    const text = JSON.stringify(error);
    if (!text || text === "{}") return String(error);
    return text.length > 300 ? `${text.slice(0, 300)}…` : text;
  } catch {
    return String(error);
  }
}

