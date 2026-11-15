import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import * as nodeModule from "node:module";
import { infrastructureFailure } from "./infrastructure-errors.ts";
import { createVerificationReport } from "./verification-report.ts";
const { stripTypeScriptTypes } = nodeModule as unknown as { stripTypeScriptTypes: (source: string) => string };
const require = nodeModule.createRequire(import.meta.url);
const { z } = require("zod");
const source = fs.readFileSync(new URL("./stages/verify.ts", import.meta.url), "utf8");

for (const { cached, blocked, mode } of [{ cached: true, blocked: false, mode:'full' }, { cached: false, blocked: false, mode:'full' }, { cached: false, blocked: true, mode:'full' },{cached:false,blocked:false,mode:'preview'}]) test(`VERIFY ${mode} ${cached ? "缓存" : "安装"}${blocked ? "识别外部拦截且不重复修复" : "与构建隔离数据并保存真实报告"}`, async () => {
  const commands: { command: string; env?: Record<string, string> }[] = [];
  let inBuildSlot = false;
  let report: ReturnType<typeof createVerificationReport> | undefined;
  const js = stripTypeScriptTypes(source).replace(/^import[\s\S]*?;\n/gm, "").replace(/^export \{[^\n]*\n/gm, "").replace(/^export /gm, "");
  const context = {
    ensureWorkspaceRuntime:async()=>({backend:'native'}),
    AbortSignal, z, fs, path, os, infrastructureFailure, checkImportClosure:()=>[], prepareCandidate:async()=>({relativeRoot:".atoms/candidates/test",absoluteRoot:"/unused/candidate"}),checkCandidate:async()=>[], ensureProjectDependencies:async (_id:string,_signal:AbortSignal,env:Record<string,string>)=>{commands.push({command:"fixed-pnpm-cli install --no-frozen-lockfile --registry=https://registry.npmjs.org",env});return{exitCode:0,aborted:false}}, createVerificationReport, pnpmShellCommand: () => "fixed-pnpm-cli", config: {generationVerificationMode:mode, pnpmStoreDir: "/tmp/test-store" },
    withBuildSlot: async (action: () => Promise<unknown>) => {
      inBuildSlot = true;
      try { return await action(); } finally { inBuildSlot = false; }
    },
    restoreNodeModulesCache: async () => cached, saveNodeModulesCache: async () => {},
    runCommand: async (_id: string, command: string, options: { env?: Record<string, string> }) => {
      if (command.includes(" build --webpack") || command.includes("tsc --noEmit")) assert.equal(inBuildSlot, true, "构建必须进入共享队列");
      commands.push({ command, env: options.env });
      if (blocked && command.includes(" build --webpack")) return { exitCode: 1, stdout: "build failed", stderr: "SAFE_DELETE_BULK_CONFIRM_REQUIRED", aborted: false };
      return { exitCode: 0, stdout: "", stderr: "", aborted: false };
    },
    getRuntimePort: () => 4000, restartService: async (_id:string,options:{validate:(v:{port:number},signal:AbortSignal)=>Promise<void>}) => {await options.validate({port:4000},new AbortController().signal)}, waitForHealth: async () => true,
    readFile: () => "## 验收清单\n- 保存并刷新查询\n## 外部依赖\n- 无",
    resolveInsideProject: (_id: string, rel: string) => path.join("/unused/project", rel),
    projectRoot: () => "/unused/project", computeProjectHash: () => "source-hash",
    writeFile: (_id: string, filename: string, text: string) => { if (filename === ".atoms/VERIFICATION.json") report = JSON.parse(text); },
  };
  const runVerifyStage = vm.runInNewContext(`${js}\nrunVerifyStage`, context);
  const result = await runVerifyStage({ projectId: "test", runId: "run", signal: new AbortController().signal, log() {}, emit() {}, plan: null });
  if (blocked) {
    assert.equal(result.ok, false);
    assert.match(result.error, /CodeBuddy.*确认/);
    assert.equal(commands.filter(item => item.command.includes(" build --webpack")).length, 1);
    assert.equal(report, undefined);
    return;
  }
  assert.equal(result.ok, true);
  if(mode==='preview'){
    assert.equal(commands.some(item=>item.command.includes(' build')),false,'dev预览不应执行生产构建');
    assert.equal(report?.checked.find(item=>item.id==='build')?.status,'skipped');
    assert.equal(report?.previewMode,'development');return;
  }
  assert.ok(commands.some(item=>item.command.includes(" install ")), "依赖必须完成实际校验安装");
  const build = commands.find((item) => item.command.includes(" build --webpack"));
  assert.ok(build?.env?.ATOMS_DATA_DIR, "构建必须使用独立数据库目录");
  const install = commands.find((item) => item.command.includes(" install "));
  assert.equal(install?.env?.ATOMS_DATA_DIR, build.env.ATOMS_DATA_DIR, "依赖安装也必须使用临时数据目录");
  assert.equal(install?.env?.DATABASE_PATH, build.env.DATABASE_PATH, "不得继承平台DATABASE_PATH");
  assert.equal(fs.existsSync(build.env.ATOMS_DATA_DIR), false, "完成后清理验收数据库");
  assert.ok(install?.command.startsWith("fixed-pnpm-cli "), "安装必须使用平台固定CLI");
  assert.match(install.command, /--registry=https:\/\/registry\.npmjs\.org/);
  assert.match(install.command, /--no-frozen-lockfile/);
  assert.ok(build.command.startsWith("fixed-pnpm-cli "), "构建必须使用平台固定CLI");
  assert.ok(commands.find(item => item.command.includes("tsc --noEmit"))?.command.startsWith("fixed-pnpm-cli "));
  assert.equal(report?.sourceHash, "source-hash");
  assert.equal(report?.businessVerified, false);
});

for(const cancelled of [false,true]) test(cancelled?'验证准备环境时取消，不继续安装和修复':'环境初始化失败保留代码并返回验证重试提示',async()=>{
  const controller=new AbortController();
  let installations=0,repairs=0,reports=0;
  const js=stripTypeScriptTypes(source).replace(/^import[\s\S]*?;\n/gm,'').replace(/^export \{[^\n]*\n/gm,'').replace(/^export /gm,'');
  const api=vm.runInNewContext(`${js}\nrunVerifyStage`,{
    fs,path,os,AbortSignal,z,projectRoot:()=> '/unused/project',
    ensureWorkspaceRuntime:async()=>{if(cancelled)controller.abort();throw Error('Docker 工程工具链初始化超时');},
    ensureProjectDependencies:async()=>{installations++;throw Error('Docker 工程工具链初始化超时');},
    generateText:async()=>{repairs++;},writeFile:()=>{reports++;},
  });
  const result=await api({projectId:'p',runId:'r',signal:controller.signal,log(){},emit(){},plan:null});
  assert.equal(result.ok,false);
  assert.match(result.error,cancelled?/^cancelled$/:/代码已生成.*运行环境.*初始化超时.*重试/);
  assert.equal(installations,0);assert.equal(repairs,0);assert.equal(reports,0);
});
