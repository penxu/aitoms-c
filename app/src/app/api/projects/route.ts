import { NextResponse } from "next/server";
import { ensureProjectRoot } from "@/lib/workspace/paths";
import { createProject, getProject, listProjects, updateProjectStatus } from "@/lib/db/queries";
import { getOrCreateMainThread } from "@/lib/db/queries";
import { getRuntimePort } from "@/lib/runner";

export const runtime = "nodejs";

export async function GET() {
  try {
    // running 表示开发预览当前可访问，项目中心用它在卡片里挂实时预览
    const projects = listProjects().map((project) => ({
      ...project,
      running: getRuntimePort(project.id) !== null,
    }));
    return NextResponse.json({ projects });
  } catch (error) {
    console.error("[projects] 列表读取失败：", error);
    return NextResponse.json(
      { error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    name?: string;
    description?: string;
    id?: string;
  };
  const description = (body.description ?? "").trim();
  const id = body.id ?? `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const name = (body.name ?? description.slice(0, 24) ?? "未命名项目").trim() || "未命名项目";

  ensureProjectRoot(id);
  const project = createProject({
    id,
    name,
    description,
    workspacePath: ensureProjectRoot(id),
  });
  const threadId = getOrCreateMainThread(id);
  updateProjectStatus(id, "created");

  return NextResponse.json({ project: getProject(project.id), threadId });
}
