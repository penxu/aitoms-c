import test from "node:test";
import assert from "node:assert/strict";
import type { GenerationEventPayload } from "./types.ts";

type CodeEvent = Extract<GenerationEventPayload, { type: "code" }>;

test('设置输出上限后拒绝超大流且不发完成事件',async()=>{
 const {consumeTextPreview}=await import('./stream-preview.ts');const events:CodeEvent[]=[];
 async function* stream(){yield '123';yield '456';}
 await assert.rejects(consumeTextPreview({path:'.atoms/PLAN.json',stream:stream(),signal:new AbortController().signal,emit:e=>events.push(e),maxChars:5}),/输出.*上限/);
 assert.equal(events.some(e=>e.status==='complete'),false);
});

test("真实文本首块立即发出，200ms内合并，最后发送清理后的累计快照", async () => {
  const subject = await import("./stream-preview.ts").catch(() => null);
  assert.ok(subject, "需要真实流预览消费者");
  const events: CodeEvent[] = [];
  let clock = 0;
  async function* stream() {
    yield "```ts\n";
    assert.equal(events.length, 1, "消费下一块前必须可见第一块");
    clock = 50; yield "export const ";
    clock = 100; yield "a = ";
    assert.equal(events.length, 1);
    clock = 220; yield "1;";
    clock = 230; yield "\n```";
  }
  const full = await subject.consumeTextPreview({ path: "app/page.tsx", stream: stream(), signal: new AbortController().signal, emit: event => events.push(event), now: () => clock, normalize: text => text.replace(/^```ts\n|\n```$/g, "") });
  assert.equal(full, "export const a = 1;");
  assert.equal(events.length, 3);
  assert.equal(events[1].content, "```ts\nexport const a = 1;");
  assert.deepEqual(events.at(-1), { type: "code", path: "app/page.tsx", content: full, status: "complete", totalChars: full.length, totalLines: 1 });
});

test("预览有界而返回完整文件，重试从新快照开始", async () => {
  const subject = await import("./stream-preview.ts").catch(() => null);
  assert.ok(subject);
  const events: CodeEvent[] = [];
  async function* stream() { yield "prefix\n" + "x".repeat(20000); }
  const full = await subject.consumeTextPreview({ path: "long.ts", stream: stream(), signal: new AbortController().signal, emit: event => events.push(event) });
  assert.equal(full.length, 20007);
  assert.equal(events.at(-1)?.content.length, 18000);
  assert.equal(events.at(-1)?.totalChars, 20007);
  assert.equal(events.at(-1)?.totalLines, 2);
  async function* retry() { yield "new"; }
  await subject.consumeTextPreview({ path: "long.ts", stream: retry(), signal: new AbortController().signal, emit: event => events.push(event) });
  assert.equal(events.at(-2)?.content, "new");
});

test("取消会中断等待中的流，不发complete也不消费后续块", async () => {
  const subject = await import("./stream-preview.ts").catch(() => null);
  assert.ok(subject);
  const controller = new AbortController();
  const events: CodeEvent[] = [];
  let read = 0;
  const stream = { [Symbol.asyncIterator]() { return { next: async () => { read++; if (read === 1) return { done: false, value: "first" }; controller.abort(); return new Promise<IteratorResult<string>>(() => {}); } }; } };
  await assert.rejects(subject.consumeTextPreview({ path: "x", stream, signal: controller.signal, emit: event => events.push(event) }), /abort/i);
  assert.equal(read, 2);
  assert.equal(events.length, 1);
  assert.equal(events[0].status, "streaming");
});

test("流出错时保留最新部分源码且不伪报complete", async () => {
  const subject = await import("./stream-preview.ts").catch(() => null);
  assert.ok(subject);
  const events: CodeEvent[] = [];
  async function* stream() { yield "first"; yield " second"; throw new Error("provider disconnected"); }
  await assert.rejects(subject.consumeTextPreview({ path: "x", stream: stream(), signal: new AbortController().signal, emit: event => events.push(event) }), /provider disconnected/);
  assert.equal(events.at(-1)?.content, "first second");
  assert.ok(events.every(event => event.status === "streaming"));
});
