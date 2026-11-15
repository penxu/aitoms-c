import { sqlite } from "@/lib/db";
import { isModelConfigured } from "@/lib/ai/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 容器健康检查：只暴露“能否服务”的布尔状态，不泄露配置内容。
 * Docker HEALTHCHECK / Nginx 探活 / 负载均衡都可以直接用。
 */
export async function GET() {
  const startedAt = Date.now();

  try {
    const row = sqlite.prepare("SELECT 1 AS ok").get() as { ok: number } | undefined;
    const databaseOk = row?.ok === 1;

    return Response.json(
      {
        ok: databaseOk,
        database: databaseOk ? "up" : "down",
        model: isModelConfigured() ? "configured" : "missing",
        uptimeSeconds: Math.round(process.uptime()),
        dependencyMs: Date.now() - startedAt,
      },
      { status: databaseOk ? 200 : 503, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        database: "down",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
