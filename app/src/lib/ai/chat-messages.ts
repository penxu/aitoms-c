import type { UIMessage } from "ai";

/**
 * 整理发给模型的历史消息。
 * 模型接口不接受 messages 里的 system 角色（系统提示要走 instructions / system 参数），
 * 而流水线会把生成摘要存成档案消息，历史上也可能残留 system 行，
 * 这里统一改写为 assistant，既保留上下文又不触发 AI_InvalidPromptError。
 */
export function toChatMessages(messages: readonly UIMessage[]): UIMessage[] {
  const result: UIMessage[] = [];

  for (const message of messages) {
    if (message.parts.length === 0) continue;
    if (message.role === "system") {
      result.push({ ...message, role: "assistant" } as UIMessage);
      continue;
    }
    if (message.role === "user" || message.role === "assistant") result.push(message);
  }

  return result;
}
