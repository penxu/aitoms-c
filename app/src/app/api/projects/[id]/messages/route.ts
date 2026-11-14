import { NextResponse } from "next/server";
import {
  getProcessByProject,
  getProject,
  listThreadMessages,
  getOrCreateMainThread,
  appendMessage,
} from "@/lib/db/queries";

export const runtime = "nodejs";

/** GET：项目状态 + 对话历史 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });

  const threadId = getOrCreateMainThread(id);
  const messages = listThreadMessages(threadId);
  const processRow = getProcessByProject(id);

  return NextResponse.json({
    project,
    threadId,
    messages,
    process: processRow ?? null,
  });
}

/** POST：追加一条消息（用于持久化对话历史） */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json()) as {
    id?: string;
    role?: string;
    parts?: unknown[];
  };
  if (!body.id || !body.role || !Array.isArray(body.parts)) {
    return NextResponse.json({ error: "参数不完整" }, { status: 400 });
  }
  const threadId = getOrCreateMainThread(id);
  appendMessage({
    id: body.id,
    threadId,
    projectId: id,
    role: body.role,
    parts: body.parts,
  });
  return NextResponse.json({ ok: true });
}
