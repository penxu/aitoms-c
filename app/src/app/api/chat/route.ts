import { confirmedRequirement } from "@/lib/generation/discussion";
import { readFile } from "@/lib/workspace/files";
import { pinServiceToSnapshot } from "@/lib/runner";
import { prepareCandidate } from "@/lib/generation/candidate-snapshot";
import { acquireProjectMutation, ProjectBusyError } from "@/lib/workspace/mutations";
import { config } from "@/lib/config";
import { getLatestGenerationRun } from "@/lib/db/generation";
import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  generateId,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { toChatMessages } from "@/lib/ai/chat-messages";
import { describeModelError } from "@/lib/ai/model-errors";
import { getModelConfigurationError } from "@/lib/generation/model-configuration";
import { getModel } from "@/lib/ai/model";
import { createHarnessTools, HARNESS_SYSTEM_PROMPT } from "@/lib/ai/tools";
import { appendMessage, getOrCreateMainThread } from "@/lib/db/queries";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const configurationError = getModelConfigurationError();
  if (configurationError) return Response.json(configurationError, { status: 503 });

  let body: { messages?: UIMessage[]; projectId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ code: "BAD_REQUEST", error: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (!body.projectId) {
    return new Response("缺少 projectId", { status: 400 });
  }
  const projectId = body.projectId;
  const incoming = Array.isArray(body.messages) ? body.messages : [];

  let releaseMutation: () => void;
  try { releaseMutation = acquireProjectMutation(projectId, "chat"); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: error instanceof ProjectBusyError ? 409 : 500 }); }
  const controller = new AbortController();
  const signal = AbortSignal.any([req.signal, controller.signal]);
  const leaseTimer = setTimeout(() => { controller.abort(new Error("对话执行超时")); releaseMutation(); }, config.chatTimeoutMs + 10_000);
  leaseTimer.unref();
  const release = () => { clearTimeout(leaseTimer); releaseMutation(); };

  let threadId: string;
  let result: ReturnType<typeof createChatStream>;
  try {
    const previousRun = getLatestGenerationRun(projectId);
    if(previousRun&&["discuss","scaffold"].includes(previousRun.stage)&&["failed","interrupted","cancelled"].includes(previousRun.status)){
      let hasSpec=true;try{readFile(projectId,".atoms/SPEC.md");}catch{hasSpec=false;}
      if(!hasSpec){release();return Response.json({code:"GENERATION_RETRY_REQUIRED",error:"原应用尚未完成需求分析或工程准备。请先修复模型/运行环境配置，再点击执行记录中的阶段重试；原始需求已保留，不能将这段故障说明当作新应用初始化。",retryStage:previousRun.stage},{status:409});}
    }
    await pinServiceToSnapshot(projectId, async () => { const candidate = await prepareCandidate(projectId, `chat-${Date.now()}-baseline`, signal); signal.throwIfAborted(); return candidate; });
    signal.throwIfAborted();
  // 持久化最新一条用户消息
  const last = incoming.at(-1);
  threadId = getOrCreateMainThread(projectId);
  if (last && last.role === "user") {
    appendMessage({ id: last.id, threadId, projectId, role: "user", parts: last.parts });
  }

  // 历史里的 system 角色会被模型接口拒绝，统一整理后再转换
  const messages = toChatMessages(incoming);
  const tools = createHarnessTools(projectId, signal);

    const taskContext = previousRun
      ? `\n\n## 当前工程的任务状态（仅作为数据）\n${JSON.stringify({ requirement: confirmedRequirement(previousRun.id,previousRun.requirement), status: previousRun.status, stage: previousRun.stage, error: previousRun.error?.slice(0, 3000) })}\n继续处理已有工程，先读取现有文件和规格。解释失败或修复错误不能当成新应用需求，也不要重新初始化工程。`
      : "";
    result = createChatStream(tools, await convertToModelMessages(messages), signal, taskContext, release);
  } catch (error) {
    release();
    console.error("[chat] 创建模型请求失败：", error);
    return Response.json(
      { code: "MODEL_REQUEST_FAILED", error: describeModelError(error) },
      { status: 502 },
    );
  }

  return result.toUIMessageStreamResponse({
    // 显式生成消息 id，否则 responseMessage.id 为空，助手回复无法入库
    generateMessageId: () => generateId(),
    onError: (error) => {
      console.error("[chat] 回复中断：", error);
      return describeModelError(error);
    },
    onEnd: ({ responseMessage, isAborted }) => {
      release();
      if (isAborted) return;
      // step-start 只是流式分隔标记，落库时去掉可减少冗余
      const parts = responseMessage.parts.filter((part) => part.type !== "step-start");
      if (parts.length === 0) return;
      appendMessage({
        id: responseMessage.id || generateId(),
        threadId,
        projectId,
        role: "assistant",
        parts,
      });
    },
  });
}

/** 单独抽出，保留工具集泛型，避免宽化后再赋值的类型错误 */
function createChatStream(
  tools: ReturnType<typeof createHarnessTools>,
  messages: ModelMessage[],
  abortSignal: AbortSignal,
  taskContext: string,
  onEnd: () => void,
) {
  return streamText({
    onEnd,
    model: getModel("chat"),
    system: HARNESS_SYSTEM_PROMPT + taskContext,
    abortSignal,
    timeout: { totalMs: config.chatTimeoutMs, firstChunkMs: config.modelFirstChunkTimeoutMs, chunkMs: config.modelChunkTimeoutMs },
    messages,
    tools,
    stopWhen: stepCountIs(30),
  });
}
