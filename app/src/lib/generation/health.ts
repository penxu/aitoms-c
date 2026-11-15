import { setTimeout as delay } from "node:timers/promises";

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
    const timeout = AbortSignal.timeout(Math.max(1, Math.min(5000, remaining)));
    try {
      const response = await fetch(`http://127.0.0.1:${port}${basePath}/api/health`, {
        cache: "no-store",
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      // Drain responses so repeated probes can reuse connections.
      await response.body?.cancel();
      if (response.ok && !signal?.aborted) return true;
    } catch { /* Unready, timed out or cancelled. */ }
    if (signal?.aborted || Date.now() >= deadline) return false;
    try {
      await delay(Math.min(1000, deadline - Date.now()), undefined, { signal });
    } catch { return false; }
  }
  return false;
}
