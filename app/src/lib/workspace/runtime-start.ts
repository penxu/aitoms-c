import { setTimeout as delay } from "node:timers/promises";
import net from "node:net";

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

/** loopback 端口是否已可连接；只做 TCP 握手，不发送任何 HTTP 请求。 */
function canConnect(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    const finish = (ok: boolean) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(1000, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

/**
 * 开发预览的就绪判定：只等 loopback TCP 端口可连接，不请求首页或健康接口。
 * next dev 启动即监听端口，页面在首次请求时才编译；主动 GET 会触发编译并把它拖进启动等待。
 * 端口就绪只代表服务已监听，页面与健康接口的真实响应仍需浏览器侧确认。
 */
export async function waitForPreviewSocket(
  port: number,
  failure: () => string | null,
  signal: AbortSignal,
  timeoutMs = 60_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    const error = failure();
    if (error) throw new Error(`预览启动失败：${error}`);
    if (await canConnect(port)) return;
    signal.throwIfAborted();
    try {
      await delay(Math.min(300, Math.max(0, deadline - Date.now())), undefined, { signal });
    } catch {
      signal.throwIfAborted();
      throw new Error("预览启动已取消");
    }
  }
  throw new Error(`预览端口监听超时：${failure() ?? `${Math.round(timeoutMs / 1000)} 秒内端口未就绪，请检查生成代码和项目依赖`}`);
}
