import { NextResponse } from "next/server";
import { getProject, setProjectFavorite } from "@/lib/db/queries";
import { getRuntimePort } from "@/lib/runner";
import { deleteProject } from "@/lib/projects/delete";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }
  return NextResponse.json({
    project,
    port: getRuntimePort(id),
    previewUrl: `/p/${id}/`,
  });
}

/** 更新项目属性：目前只支持收藏状态 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { favorited?: unknown };
  if (typeof body.favorited !== "boolean") {
    return NextResponse.json({ error: "favorited 必须是布尔值" }, { status: 400 });
  }
  const project = setProjectFavorite(id, body.favorited);
  if (!project) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }
  return NextResponse.json({ project: { ...project, running: getRuntimePort(id) !== null } });
}

/** 删除项目：停进程 → 清数据库 → 删工作区/发布/生产数据目录 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = deleteProject(id);

  if (result.ok) {
    return NextResponse.json({ ok: true, releases: result.releases, runs: result.runs, warnings: result.warnings });
  }

  if (result.reason === "not-found") {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }
  if (result.reason === "generating") {
    return NextResponse.json(
      { error: "生成任务正在运行，已请求停止，请稍后重试删除。" },
      { status: 409 },
    );
  }
  return NextResponse.json(
    { error: "发布任务进行中，请等发布结束后再删除。" },
    { status: 409 },
  );
}
