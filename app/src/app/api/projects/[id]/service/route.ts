import {sanitizeInstallOutput} from "@/lib/generation/install-progress";
import { refreshProjectPreview } from "@/lib/workspace/preview";
import { acquireProjectMutation, ProjectBusyError } from "@/lib/workspace/mutations";
import { infrastructureFailure } from "@/lib/generation/infrastructure-errors";
import { NextResponse } from "next/server";
import { getRuntimeLogs, getRuntimePort, stopService } from "@/lib/runner";
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
    output:sanitizeInstallOutput(getRuntimeLogs(id)),
    previewUrl: port ? `/p/${id}/` : null,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { action } = (await req.json()) as { action: "start" | "stop" | "restart" };
  if (!["start", "stop", "restart"].includes(action)) return NextResponse.json({ error: "无效操作" }, { status: 400 });
  let release: (() => void) | undefined;
  try {
    release = acquireProjectMutation(id, "service");
    if (action === "stop") {
      stopService(id);
      return NextResponse.json({ status: "stopped", port: null, previewUrl: null });
    }
    const result = await refreshProjectPreview(id, req.signal);
    return NextResponse.json({
      status: "running",
      port: result.port,
      previewUrl: `/p/${id}/`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: infrastructureFailure(message) ?? message }, { status: err instanceof ProjectBusyError ? 409 : 500 });
  } finally { release?.(); }
}
