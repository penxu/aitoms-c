import {sourceSyntaxErrors} from "./source-syntax.ts";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import * as nodeModule from "node:module";
import { consumeTextPreview } from "./stream-preview.ts";
import { stripCodeFence } from "./model-output.ts";
import { checkTemplateContract } from "./contracts.ts";
import { checkpointHash } from "./file-checkpoints.ts";
import { dependencyContext } from "./dependency-context.ts";
import { normalizeSource } from "./source-normalize.ts";
import type { GenerationEventPayload, StageContext } from "./types.ts";

const { stripTypeScriptTypes } = nodeModule as unknown as { stripTypeScriptTypes: (source: string) => string };
const source = fs.readFileSync(new URL("./stages/build.ts", import.meta.url), "utf8");

function loadBuildStage(options: { files?: Map<string, string>; afterOutput?: () => void; prompt?: (input: Record<string, unknown>) => void } = {}) {
  const files = options.files ?? new Map<string, string>();
  const get = (filename: string) => {
    const content = files.get(filename);
    if (content === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
    return content;
  };
  const js = stripTypeScriptTypes(source).replace(/^import[\s\S]*?;\n/gm, "").replace(/^export /gm, "");
  const context = {
    fs: {
      mkdirSync() {},
      readFileSync: (filename: string) => get(filename),
      statSync: (filename: string) => ({ size: Buffer.byteLength(get(filename)) }),
      writeFileSync: (filename: string, content: string) => { files.set(filename, content); },
      renameSync: (from: string, to: string) => { files.set(to, get(from)); files.delete(from); },
    },
    Buffer,
    fileCheckpoints: () => ({ inspect: () => "generate", save() {} }),
    checkpointHash,
    dependencyContext, sourceSyntaxErrors,
    getApplicationProfile: () => ({}),
    path,
    streamText: () => ({
      textStream: (async function* () {
        yield "```tsx\n";
        yield "export default function Page() {\n";
        yield "  return <main>hi</main>;\n";
        yield "}\n```";
        options.afterOutput?.();
      })(),
      usage: Promise.resolve({ inputTokens: 3, outputTokens: 5 }),
    }),
    getModel: () => "stub-model",
    config: { maxToolOutputChars: 4000 },
    addRunTokens() {},
    readFile: (_id: string, rel: string) => get(path.join("/tmp/atoms-test", rel)),
    resolveInsideProject: (_projectId: string, rel: string) => path.join("/tmp/atoms-test", rel),
    consumeTextPreview,
    BUILD_SYSTEM_PROMPT: "system",
    buildFilePrompt: (input: Record<string, unknown>) => { options.prompt?.(input); return "prompt"; },
    stripCodeFence,
    checkTemplateContract,
    normalizeSource,
  };
  return vm.runInNewContext(`${js}\nrunBuildStage`, context) as (ctx: StageContext) => Promise<{ ok: boolean }>;
}

test("BUILD 阶段边生成边推送代码快照，最终写入清理后的完整文件", async () => {
  const runBuildStage = loadBuildStage();
  const events: GenerationEventPayload[] = [];
  const ctx = {
    projectId: "p1",
    runId: "r1",
    requirement: "做一个页面",
    signal: new AbortController().signal,
    emit: (event: GenerationEventPayload) => events.push(event),
    log: () => {},
    plan: {
      pages: ["/"],
      items: [{ path: "app/page.tsx", action: "create" as const, purpose: "首页", dependsOn: [] }],
      dataModel: [],
    },
  } as unknown as StageContext;

  const result = await runBuildStage(ctx);
  assert.equal(result.ok, true);

  const code = events.filter((event) => event.type === "code");
  assert.ok(code.length >= 2, "首块与完成快照都要推送");
  assert.equal(code[0].status, "streaming");
  const last = code.at(-1);
  assert.equal(last?.status, "complete");
  assert.equal(last?.content, "export default function Page() {\n  return <main>hi</main>;\n}");

  const kinds = events.map((event) => `${event.type}:${"status" in event ? event.status : ""}`);
  assert.ok(kinds.includes("file:writing"));
  assert.ok(kinds.includes("file:done"));
});


function buildContext(signal = new AbortController().signal): StageContext {
  return { projectId: "p1", runId: "r1", requirement: "页面", signal, log() {}, emit() {}, plan: { pages: ["/"], items: [{ path: "app/page.tsx", action: "modify", purpose: "页面", dependsOn: [] }], dataModel: [] } } as unknown as StageContext;
}

test("BUILD等待模型期间文件被修改或删除时保留人工操作", async () => {
 for (const change of ["manual", null]) {
  const filename = "/tmp/atoms-test/app/page.tsx";
  const files = new Map([[filename, "before"]]);
  const run = loadBuildStage({ files, afterOutput: () => { if (change === null) files.delete(filename); else files.set(filename, change); } });
  const result = await run(buildContext());
  assert.equal(result.ok, false);
  assert.equal(files.get(filename), change ?? undefined);
 }
});

test("BUILD创建新文件时不覆盖等待期间人工新增的文件", async () => {
 const filename = "/tmp/atoms-test/app/page.tsx";
 const files = new Map<string, string>();
 const run = loadBuildStage({ files, afterOutput: () => files.set(filename, "manual-create") });
 const ctx = buildContext();ctx.plan!.items[0].action = "create";
 assert.equal((await run(ctx)).ok, false);
 assert.equal(files.get(filename), "manual-create");
});

test("BUILD取消后不落盘", async () => {
 const controller = new AbortController();
 const filename = "/tmp/atoms-test/app/page.tsx";
 const files = new Map([[filename, "before"]]);
 const run = loadBuildStage({ files, afterOutput: () => controller.abort() });
 assert.equal((await run(buildContext(controller.signal))).ok, false);
 assert.equal(files.get(filename), "before");
});

test("BUILD读取完整依赖和foundation契约，超限文件明确失败", async () => {
 const dependency = "/tmp/atoms-test/lib/shared.ts";
 const foundation = "/tmp/atoms-test/lib/db/index.ts";
 const content = "// filler\n".repeat(7000) + "export interface TailContract { id: string }";
 const files = new Map([[dependency, content], [foundation, content]]);
 let prompts = 0;
 const run = loadBuildStage({ files, prompt: (input) => {
  prompts++;
  assert.ok(JSON.stringify(input.dependencies).includes("TailContract"));
  assert.ok(JSON.stringify(input.foundation).includes("TailContract"));
 }});
 const ctx = buildContext();ctx.plan!.items[0].dependsOn = ["lib/shared.ts"];
 assert.equal((await run(ctx)).ok, true);assert.equal(prompts, 1);
 files.set(dependency, "x".repeat(500001));
 await assert.rejects(async () => { await loadBuildStage({ files })(ctx); }, /500000|500KB|超出|超过/);
});

test("REPAIR模型忽略取消或写入事件触发取消时均不再改文件", async () => {
 const verifySource = fs.readFileSync(new URL("./stages/verify.ts", import.meta.url), "utf8");
 const js = stripTypeScriptTypes(verifySource).replace(/^import[\s\S]*?;\n/gm, "").replace(/^export \{[^\n]*\n/gm, "").replace(/^export /gm, "");
 for (const cancelAt of ["model", "write"]) {
  const controller = new AbortController();let writes = 0;
  const context = {
   fs, path,
   config: {}, getModel: () => "stub", REPAIR_SYSTEM_PROMPT: "", repairUserPrompt: () => "",
   parseTscDiagnostics: () => [], parseNextBuildDiagnostics: () => [], resolveGeneratedDiagnostics: () => [],
   computeProjectHash:()=>"source", projectRoot: () => "/tmp/unused", collectExports: () => [],
   isSafePlanPath: () => true, isProtectedPath: () => false,
   generateText: async () => { if (cancelAt === "model") controller.abort();return { text: "fix", usage: {} }; },
   addRunTokens() {}, parseRepairOutput: () => ({ truncated: false, fixes: [{ path: "app/page.tsx" }] }),
   readFile: () => "before", applyRepairFix: () => ({ applied: 1, content: "after" }),
   normalizeSource: (_filename: string, content: string) => ({ content, notes: [] }), checkTemplateContract: () => null,
   writeFileAtomic: () => { writes++; },
  };
  const repair = vm.runInNewContext(`${js}\nrepair`, context);
  const result = await repair({ ...buildContext(controller.signal), emit: (event: GenerationEventPayload) => { if (cancelAt === "write" && event.type === "file" && event.status === "writing") controller.abort(); } }, "failure");
  assert.equal(result.status, "aborted");assert.equal(writes, 0);
 }
});
