import { NextResponse } from "next/server";
import { getProject } from "@/lib/db/queries";
import {
  getActiveGenerationRun,
  getLatestGenerationRun,
  listGenerationEvents,
} from "@/lib/db/generation";

export const runtime = "nodejs";

/** 生成状态与历史事件（刷新页面后回填时间线） */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }

  const run = getActiveGenerationRun(id) ?? getLatestGenerationRun(id) ?? null;
  return NextResponse.json({
    run,
    events: run ? listGenerationEvents(run.id) : [],
  });
}
