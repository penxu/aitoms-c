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
    await new Promise(resolve=>setImmediate(resolve));
    controller.abort();
    assert.equal(await pending, false);
    assert.equal(requests, 1);
    assert.equal(await subject.waitForHealth(4000, 60_000, "", controller.signal), false);
    assert.equal(requests, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('健康接口忽略AbortSignal时仍在总期限内停止等待',async()=>{
 const {waitForHealth}=await import('./health.ts');const original=globalThis.fetch;
 let guard:ReturnType<typeof setTimeout>|undefined;
 globalThis.fetch=async()=>new Promise<Response>(()=>{});
 try{
  const result=await Promise.race([waitForHealth(4000,20),new Promise<'hung'>(resolve=>{guard=setTimeout(()=>resolve('hung'),150);})]);
  assert.equal(result,false);
 }finally{globalThis.fetch=original;clearTimeout(guard);}
});
test('健康状态已返回时不等待body.cancel完成',async()=>{
 const {waitForHealth}=await import('./health.ts');const original=globalThis.fetch;
 let guard:ReturnType<typeof setTimeout>|undefined,cancelled=false;
 globalThis.fetch=async()=>({ok:true,body:{cancel(){cancelled=true;return new Promise<void>(()=>{});}}}) as Response;
 try{
  const result=await Promise.race([waitForHealth(4000,20),new Promise<'hung'>(resolve=>{guard=setTimeout(()=>resolve('hung'),150);})]);
  assert.equal(result,true);assert.equal(cancelled,true);
 }finally{globalThis.fetch=original;clearTimeout(guard);}
});
