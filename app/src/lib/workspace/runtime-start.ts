import { setTimeout as delay } from "node:timers/promises";

/** 端口分配不代表页面可用；保留启动错误，避免只返回无法解释的预览空白。 */
export async function waitForPreviewStart(
  url: string,
  failure: () => string | null,
  timeoutMs = 60_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const error = failure();
    if (error) throw new Error(`预览启动失败：${error}`);
    try {
      const response = await fetch(url, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(Math.max(1, Math.min(2500, deadline - Date.now()))) });
      await response.body?.cancel();
      if (response.ok && !failure()) return;
    } catch { /* 等待开发服务器就绪，下一轮检查进程退出原因 */ }
    await delay(Math.min(300, Math.max(0, deadline - Date.now())));
  }
  throw new Error(`预览启动超时：${failure() ?? "页面在 60 秒内未就绪，请检查生成代码和项目依赖"}`);
}
