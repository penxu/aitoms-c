import { NextResponse } from "next/server";
import { getProject } from "@/lib/db/queries";
import { getRuntimePort } from "@/lib/runner";

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
