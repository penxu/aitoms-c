import { NextResponse } from "next/server";
import { ensureProjectRoot } from "@/lib/workspace/paths";
import { createProject, getProject, listProjects, updateProjectStatus } from "@/lib/db/queries";
import { getOrCreateMainThread } from "@/lib/db/queries";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ projects: listProjects() });
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
