import test from "node:test";
import assert from "node:assert/strict";

test("健康检查在取消时中止在途请求且不继续轮询", async () => {
  const subject = await import("./health.ts").catch(() => null);
  assert.ok(subject, "需要支持取消的健康检查");
  const controller = new AbortController();
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (_url, options) => {
    requests += 1;
    return new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  };
  try {
    const pending = subject.waitForHealth(4000, 60_000, "/p/test", controller.signal);
    controller.abort();
    assert.equal(await pending, false);
    assert.equal(requests, 1);
    assert.equal(await subject.waitForHealth(4000, 60_000, "", controller.signal), false);
    assert.equal(requests, 1);
  } finally { globalThis.fetch = originalFetch; }
});
