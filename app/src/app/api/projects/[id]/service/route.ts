import { NextResponse } from "next/server";
import { getRuntimePort, restartService, startService, stopService } from "@/lib/runner";
import { getProject } from "@/lib/db/queries";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  const port = getRuntimePort(id);
  return NextResponse.json({
    status: project.status,
    port,
    previewUrl: port ? `/p/${id}/` : null,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { action } = (await req.json()) as { action: "start" | "stop" | "restart" };
  try {
    if (action === "stop") {
      stopService(id);
      return NextResponse.json({ status: "stopped", port: null, previewUrl: null });
    }
    const result = action === "restart" ? await restartService(id) : await startService(id);
    return NextResponse.json({
      status: "running",
      port: result.port,
      previewUrl: `/p/${id}/`,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
