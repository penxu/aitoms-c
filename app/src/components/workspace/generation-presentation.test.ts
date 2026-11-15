import assert from "node:assert/strict";
import { test } from "node:test";
import {
  currentActivity,
  stageStates, generationHealth, shouldShowGenerationTimeline,
  inputDestination,
  latestCodeSnapshots,
  latestPlan,
  stageProgress,
  writtenFiles,
  type StudioEvent,
} from "./generation-presentation.ts";

test("first configured request starts the generation pipeline; later edits use chat", () => {
  assert.equal(inputDestination(true, true), "generate");
  assert.equal(inputDestination(true, false), "chat");
  assert.equal(inputDestination(false, true), "disabled");
  assert.equal(inputDestination(false, false), "disabled");
});

test("cumulative code snapshots replace their file content rather than appending it twice", () => {
  const snapshots = latestCodeSnapshots([{ type: "code", path: "page.tsx", content: "hello", status: "streaming" }, { type: "code", path: "other.ts", content: "x", status: "complete" }, { type: "code", path: "page.tsx", content: "hello world", status: "complete" }]);
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots.at(-1)?.content, "hello world");
  assert.equal(snapshots.at(-1)?.status, "complete");
});

test("plan event is surfaced before code so users can see what will be built", () => {
  const events: StudioEvent[] = [
    { type: "stage", stage: "spec", status: "done", durationMs: 1200 },
    { type: "plan", pages: ["/", "/admin"], items: [{ path: "app/page.tsx", purpose: "首页" }] },
  ];
  assert.deepEqual(latestPlan(events), { pages: ["/", "/admin"], items: [{ path: "app/page.tsx", purpose: "首页" }], degraded: false });
});

test("current activity reflects the real event stream instead of a generic thinking state", () => {
  const events: StudioEvent[] = [
    { type: "stage", stage: "build", status: "running" },
    { type: "code", path: "app/page.tsx", content: "a\nb\nc", status: "streaming", totalLines: 3 },
  ];
  const activity = currentActivity(events);
  assert.equal(activity?.title, "正在写入 page.tsx");
  assert.match(activity?.detail ?? "", /app\/page\.tsx/);
  assert.equal(currentActivity([{ type: "stage", stage: "verify", status: "running" }])?.title, "正在安装依赖、构建并检查服务");
});

test("written files ignore later failures and stage progress counts finished stages", () => {
  const events: StudioEvent[] = [
    { type: "file", path: "a.ts", status: "writing" },
    { type: "file", path: "a.ts", status: "done" },
    { type: "stage", stage: "scaffold", status: "done" },
    { type: "stage", stage: "spec", status: "done" },
    { type: "file", path: "b.ts", status: "done" },
    { type: "file", path: "b.ts", status: "failed", error: "boom" },
  ];
  assert.deepEqual(writtenFiles(events), ["a.ts"]);
  assert.deepEqual(stageProgress(events), { done: 2, total: 6 });
});

test('已恢复运行的项目不能被历史失败时间线遮住预览', async () => {
  const { shouldShowGenerationTimeline } = await import('./generation-presentation.ts');
  assert.equal(shouldShowGenerationTimeline(false, 'failed', true), false);
  assert.equal(shouldShowGenerationTimeline(false, 'failed', false), true);
  assert.equal(shouldShowGenerationTimeline(true, 'running', true), true);
});

test('旧任务失败或中断后只能修改原工程，不能把继续指令当新需求', async () => {
  const { canStartInitialGeneration } = await import('./generation-presentation.ts');
  assert.equal(canStartInitialGeneration(true, undefined), false);
  assert.equal(canStartInitialGeneration(true, 'failed'), false);
  assert.equal(canStartInitialGeneration(true, 'interrupted'), false);
  assert.equal(canStartInitialGeneration(false, 'failed'), false);
  assert.equal(canStartInitialGeneration(false, undefined), true);
});

test("进展展示仅保留公开字段，不携带workerPid", async () => {
 const { publicGenerationProgress } = await import("./generation-presentation.ts");
 assert.deepEqual(publicGenerationProgress({ phase: "build", heartbeatAt: 1000, lastProgressAt: 900, workerPid: 12345 }), { phase: "build", heartbeatAt: 1000, lastProgressAt: 900 });
 assert.equal(publicGenerationProgress(null), null);
 assert.deepEqual(publicGenerationProgress({ phase: "private-phase", heartbeatAt: "invalid", lastProgressAt: -1 }), { phase: null, heartbeatAt: null, lastProgressAt: null });
});

test("任务仍运行但长时间无进展时提示等待，不宣称失败", async () => {
 const { generationHealth } = await import("./generation-presentation.ts");
 const now = 300000;
 const health = generationHealth("running", { phase: "build", heartbeatAt: now - 2000, lastProgressAt: now - 130000 }, now);
 assert.equal(health?.state, "waiting");
 assert.match(health?.recentProgress ?? "", /2分钟/);
 assert.match(health?.detail ?? "", /等待|进展/);
 assert.doesNotMatch(health?.detail ?? "", /已失败|生成失败/);
 assert.equal(generationHealth("ready", { phase: "verify", heartbeatAt: 1, lastProgressAt: 1 }, now), null);
});

test("心跳异常与请求失败只表示状态暂不可确认，正常心跳及首次等待有区别", async () => {
 const { generationHealth } = await import("./generation-presentation.ts");
 const progress = { phase: "verify" as const, heartbeatAt: 1000, lastProgressAt: 900 };
 assert.equal(generationHealth("running", progress, 40000)?.state, "stale");
 assert.match(generationHealth("running", progress, 40000)?.detail ?? "", /无法确认|未更新/);
 assert.equal(generationHealth("running", progress, 2000)?.state, "normal");
 assert.equal(generationHealth("running", null, 40000)?.state, "starting");
 assert.equal(generationHealth("running", progress, 40000, true)?.state, "unavailable");
 assert.equal(generationHealth("running", progress, 1)?.state, "normal");
});


test("状态轮询每轮完成后等待5秒，不叠请求，停止后不接收迟到结果", async () => {
 const { pollGenerationStatus } = await import("./generation-presentation.ts");
 let loads = 0;let resolveRequest: (value: string | null) => void = () => {};
 let pendingTick: (() => void) | undefined;let scheduledDelay = 0;let cancelled = false;
 let requestSignal: AbortSignal | undefined;
 const received: string[] = [];
 const stop = pollGenerationStatus({
  load: (signal) => { loads++;requestSignal = signal;return new Promise<string | null>((resolve) => { resolveRequest = resolve; }); },
  receive: (value) => received.push(value), unavailable: () => received.push("unavailable"),
 }, (tick, delay) => { pendingTick = tick;scheduledDelay = delay;return () => { cancelled = true; }; });
 assert.equal(loads, 1);assert.equal(pendingTick, undefined);
 resolveRequest("first");await new Promise(setImmediate);
 assert.deepEqual(received, ["first"]);assert.equal(scheduledDelay, 5000);
 const tick = pendingTick as (() => void) | undefined;pendingTick = undefined;tick?.();
 assert.equal(loads, 2);assert.equal(pendingTick, undefined);
 stop();assert.equal(requestSignal?.aborted, true);assert.equal(cancelled, true);
 resolveRequest("late");await new Promise(setImmediate);
 assert.deepEqual(received, ["first"]);assert.equal(pendingTick, undefined);
});

test('需求讨论属于生成阶段，等待用户时不产生心跳异常',()=>{
 assert.equal(stageStates([]).discuss,'pending');
 assert.equal(generationHealth('waiting',null,Date.now()),null);
 assert.equal(shouldShowGenerationTimeline(false,'waiting',false),true);
});
