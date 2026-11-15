import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as nodeModule from "node:module";
import type { GenerationEventPayload } from "./types.ts";

const { stripTypeScriptTypes } = nodeModule as unknown as { stripTypeScriptTypes: (source: string) => string };
const source = fs.readFileSync(new URL("./events.ts", import.meta.url), "utf8");

function loadBus(persisted: unknown[]) {
  const js = stripTypeScriptTypes(source).replace(/^import[\s\S]*?;\n/gm, "").replace(/^export /gm, "");
  const context = {
    STAGE_ROLES: { scaffold: { title: "Team Leader / 团队负责人" } },
    appendGenerationEvent: (input: unknown) => persisted.push(input),
    listGenerationEvents: () => [],
    console,
  };
  return vm.runInNewContext(`${js}\nGenerationEventBus`, context) as new (runId: string) => {
    emit: (event: GenerationEventPayload) => void;
    subscribe: (listener: (event: GenerationEventPayload) => void) => () => void;
  };
}

test("流式代码快照实时广播但不逐帧入库，完成态才持久化", () => {
  const persisted: unknown[] = [];
  const GenerationEventBus = loadBus(persisted);
  const bus = new GenerationEventBus("run_1");
  const received: GenerationEventPayload[] = [];
  bus.subscribe((event) => received.push(event));

  const streaming: GenerationEventPayload = { type: "code", path: "app/page.tsx", content: "exp", status: "streaming", totalLines: 1 };
  const complete: GenerationEventPayload = { ...streaming, content: "export default 1;", status: "complete" };
  bus.emit(streaming);
  bus.emit(streaming);
  bus.emit(complete);
  bus.emit({ type: "file", path: "app/page.tsx", status: "done" });

  assert.equal(received.length, 4, "实时订阅必须收到每一帧");
  assert.equal(persisted.length, 2, "只有完成态与文件事件入库");
});
