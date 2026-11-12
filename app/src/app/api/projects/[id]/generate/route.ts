import { NextResponse } from "next/server";
import { getProject } from "@/lib/db/queries";
import { getGenerationRun } from "@/lib/db/generation";
import { getEventBus } from "@/lib/generation/events";
import { cancelGeneration, startGeneration } from "@/lib/generation/pipeline";
import { hasScaffoldConflict } from "@/lib/generation/scaffold";
import type { GenerationEventPayload, GenerationStage } from "@/lib/generation/types";

export const runtime = "nodejs";
export const maxDuration = 1800;

/**
 * 触发生成并以 NDJSON 推送事件。
 * 客户端断开只取消订阅，job 继续执行（可稍后用 GET /generation 续订）。
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    requirement?: string;
    resumeFrom?: GenerationStage;
    action?: "cancel";
  };

  if (body.action === "cancel") {
    return NextResponse.json({ ok: cancelGeneration(id) });
  }

  const requirement = (body.requirement ?? "").trim();
  if (requirement && (requirement.length < 4 || requirement.length > 2000)) {
    return NextResponse.json({ error: "需求描述长度需在 4–2000 字之间" }, { status: 400 });
  }

  // 目录已有内容且无 .atoms/：不覆盖用户已有成果
  if (hasScaffoldConflict(id)) {
    return NextResponse.json({ error: "该项目已有文件，请在对话中继续修改" }, { status: 409 });
  }

  let started: Awaited<ReturnType<typeof startGeneration>>;
  try {
    started = await startGeneration({ projectId: id, requirement, resumeFrom: body.resumeFrom });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  const bus = getEventBus(started.run.id);
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: GenerationEventPayload) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          /* 已关闭 */
        }
      };

      // 先回放历史（DB），再订阅实时事件
      for (const event of bus.history()) send(event);

      const current = getGenerationRun(started.run.id);
      if (current && current.status !== "running") {
        close();
        return;
      }

      unsubscribe = bus.subscribe((event) => {
        send(event);
        if (event.type === "run") close();
      });
    },
    cancel() {
      // 客户端断开：只取消订阅，不中断 job
      unsubscribe?.();
      unsubscribe = null;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
