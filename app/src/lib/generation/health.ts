import { setTimeout as delay } from "node:timers/promises";
import {withDeadline} from "./deadline.ts";

/** Bound each request and the total wait, and promptly stop when the run is cancelled. */
export async function waitForHealth(
  port: number,
  timeoutMs = 60_000,
  basePath = "",
  signal?: AbortSignal,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !signal?.aborted) {
    const remaining = deadline - Date.now();
    try {
      const healthy=await withDeadline(signal??new AbortController().signal,Math.max(1,Math.min(5000,remaining)),async requestSignal=>{
        const response=await fetch(`http://127.0.0.1:${port}${basePath}/api/health`,{cache:"no-store",signal:requestSignal});
        // 仅检查状态；释放响应，但取消正文也不能成为新的无限等待。
        void response.body?.cancel().catch(()=>{});
        return response.ok;
      });
      if(healthy&&!signal?.aborted)return true;
    } catch { /* Unready, timed out or cancelled. */ }
    if (signal?.aborted || Date.now() >= deadline) return false;
    try {
      await delay(Math.min(1000, deadline - Date.now()), undefined, { signal });
    } catch { return false; }
  }
  return false;
}
