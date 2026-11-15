import { getModelConfigurationError } from "@/lib/generation/model-configuration";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { config } from "@/lib/config";

/** 模型用途：对话与各生成阶段，便于按阶段选不同模型 */
export type ModelKind = "chat" | "spec" | "plan" | "build" | "repair";

/** 模块级单例 provider，避免每次请求重复创建 */
const provider = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY?.trim(),
});

const MODEL_NAMES: Record<ModelKind, string> = {
  chat: config.chatModel,
  spec: config.specModel,
  plan: config.planModel,
  build: config.buildModel,
  repair: config.repairModel,
};

export function getModel(kind: ModelKind): LanguageModel {
  // 固定走 /chat/completions：DeepSeek 等兼容接口不提供 Responses API
  return provider.chat(MODEL_NAMES[kind]);
}

/** 是否配置了真实模型：测试桩的 key 为 stub，不能进行对话与工具调用 */
export function isModelConfigured(): boolean {
  return getModelConfigurationError() === null;
}
