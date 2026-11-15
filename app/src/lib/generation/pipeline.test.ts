import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as nodeModule from "node:module";
const { stripTypeScriptTypes } = nodeModule as unknown as { stripTypeScriptTypes: (source: string) => string };
const source = fs.readFileSync(new URL("./pipeline.ts", import.meta.url), "utf8");

test("取消时阶段抛异常仍记为cancelled，不启动后续阶段", async () => {
  const controller = new AbortController();
  const updates: Record<string, unknown>[] = [];
  let specStarted = false;
  const js = stripTypeScriptTypes(source).replace(/^import[\s\S]*?;\n/gm, "").replace(/^export /gm, "");
  const context = {
    runDiscussionStage(){},confirmedRequirement:(_id:string,r:string)=>r, pinServiceToSnapshot:async()=>{}, config: {generationStageTimeoutMs:1000}, recordProgress(){}, setInterval, clearInterval,
    withDeadline: (_signal:AbortSignal,_ms:number, action:(s:AbortSignal)=>unknown)=>action(controller.signal),
    STAGE_ORDER: ["scaffold", "spec", "plan", "build", "verify"],
    STAGE_ROLES: {},
    getEventBus: () => ({ emit() {} }), releaseEventBus() {}, updateProjectStatus() {},
    updateGenerationRun: (_id: string, update: Record<string, unknown>) => updates.push(update),
    ScaffoldConflictError: class extends Error {},
    scaffoldProject: async () => { controller.abort(); throw new Error("AbortError"); },
    runSpecStage: async () => { specStarted = true; return { ok: true }; },
    runPlanStage() {}, runBuildStage() {}, runVerifyStage() {},
  };
  const executeRun = vm.runInNewContext(`${js}\nexecuteRun`, context);
  await executeRun({ id: "run", projectId: "test", stage: "scaffold" }, controller.signal);
  assert.equal(updates.at(-1)?.status, "cancelled");
  assert.equal(specStarted, false);
});

test("SPEC 在模型返回和取消同时发生时不再写入文件", async () => {
  const controller = new AbortController();
  let written = false;
  const specSource = fs.readFileSync(new URL("./stages/spec.ts", import.meta.url), "utf8");
  const js = stripTypeScriptTypes(specSource).replace(/^import[\s\S]*?;\n/gm, "").replace(/^export /gm, "");
  const context = {
    runDiscussionStage(){},confirmedRequirement:(_id:string,r:string)=>r, pinServiceToSnapshot:async()=>{}, config: {generationStageTimeoutMs:1000}, recordProgress(){}, setInterval, clearInterval,
    withDeadline: (_signal:AbortSignal,_ms:number, action:(s:AbortSignal)=>unknown)=>action(controller.signal),
    generateText: async () => { controller.abort(); return { text: "valid spec", usage: {} }; },
    getModel() {}, addRunTokens() {}, specUserPrompt: () => "requirement", SPEC_SYSTEM_PROMPT: "spec",
    validateSpec: () => ({ ok: true, errors: [] }),
    writeFile: () => { written = true; },
  };
  const runSpecStage = vm.runInNewContext(`${js}\nrunSpecStage`, context);
  const result = await runSpecStage({ projectId: "test", runId: "run", requirement: "book", signal: controller.signal, log() {}, emit() {} });
  assert.equal(result.error, "cancelled");
  assert.equal(written, false);
});

test('需求讨论等待回答时不搭建工程，也不固定旧预览', async()=>{
 let scaffolded=false,pinned=false;
 const js=stripTypeScriptTypes(source).replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,'');
 const emitted:unknown[]=[];
 const context={
  config:{generationStageTimeoutMs:1000},recordProgress(){},setInterval,clearInterval,
  withDeadline:(_s:AbortSignal,_ms:number,action:(s:AbortSignal)=>unknown)=>action(new AbortController().signal),
  STAGE_ORDER:['discuss','scaffold','spec','plan','build','verify'], STAGE_ROLES:{},
  getEventBus:()=>({emit:(e:unknown)=>emitted.push(e)}),releaseEventBus(){},updateProjectStatus(){},updateGenerationRun(){},
  runDiscussionStage:async()=>({ok:true,waiting:true}),confirmedRequirement:()=> '做个管理系统',
  pinServiceToSnapshot:async()=>{pinned=true;},
  scaffoldProject:async()=>{scaffolded=true;return {action:'created',filesWritten:0};},
  runSpecStage(){},runPlanStage(){},runBuildStage(){},runVerifyStage(){},ScaffoldConflictError:class extends Error{},
 };
 const executeRun=vm.runInNewContext(`${js}\nexecuteRun`,context);
 await executeRun({id:'r',projectId:'p',stage:'discuss',requirement:'做个管理系统'},new AbortController().signal);
 assert.equal(scaffolded,false);assert.equal(pinned,false);
 assert.ok(emitted.some(e=>(e as {type:string;status:string}).type==='run'&&(e as {status:string}).status==='waiting'));
});
