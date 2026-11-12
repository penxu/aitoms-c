import { convertToModelMessages, streamText, stepCountIs, type UIMessage } from "ai";
import { getModel } from "@/lib/ai/model";
import { createHarnessTools, HARNESS_SYSTEM_PROMPT } from "@/lib/ai/tools";
import { appendMessage, getOrCreateMainThread } from "@/lib/db/queries";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json()) as {
    messages: UIMessage[];
    projectId: string;
  };

  if (!body.projectId) {
    return new Response("缺少 projectId", { status: 400 });
  }

  // 持久化最新一条用户消息
  const last = body.messages.at(-1);
  if (last && last.role === "user") {
    const threadId = getOrCreateMainThread(body.projectId);
    appendMessage({
      id: last.id,
      threadId,
      projectId: body.projectId,
      role: "user",
      parts: last.parts,
    });
  }

  const tools = createHarnessTools(body.projectId);
  const threadId = getOrCreateMainThread(body.projectId);

  const result = streamText({
    model: getModel("chat"),
    system: HARNESS_SYSTEM_PROMPT,
    messages: await convertToModelMessages(body.messages),
    tools,
    stopWhen: stepCountIs(30),
  });

  return result.toUIMessageStreamResponse({
    onFinish: ({ responseMessage }) => {
      appendMessage({
        id: responseMessage.id,
        threadId,
        projectId: body.projectId,
        role: "assistant",
        parts: responseMessage.parts,
      });
    },
  });
}
