import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as nodeModule from 'node:module';
const { stripTypeScriptTypes } = nodeModule as unknown as { stripTypeScriptTypes: (source: string) => string };
const source=fs.readFileSync(new URL('../../app/api/chat/route.ts',import.meta.url),'utf8');
const js=stripTypeScriptTypes(source).replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,'');
test('继续旧任务携带最后失败原因，并将取消信号和等待上限传给模型',async()=>{
 let options:Record<string,unknown>={};const controller=new AbortController();
 const post=vm.runInNewContext(`${js}\nPOST`,{
  AbortController, AbortSignal, pinServiceToSnapshot:async()=>{}, acquireProjectMutation:()=>()=>{}, ProjectBusyError:class extends Error{},setTimeout,clearTimeout,Response,console,getModelConfigurationError:()=>null,getOrCreateMainThread:()=> 'thread',appendMessage(){},
  toChatMessages:(v:unknown)=>v,createHarnessTools:()=>({}),convertToModelMessages:async()=>[],getModel:()=> 'model',
  getLatestGenerationRun:()=>({status:'failed',stage:'verify',requirement:'宠物预约网站',error:"Cannot find module '@/components/layout/site-nav'"}),
  HARNESS_SYSTEM_PROMPT:'工程师',stepCountIs:()=>30,generateId:()=> 'id',describeModelError:String,
  config:{chatTimeoutMs:300000,modelFirstChunkTimeoutMs:60000},
  streamText:(v:Record<string,unknown>)=>{options=v;return{toUIMessageStreamResponse:()=>new Response('ok')}},
 });
 await post({signal:controller.signal,json:async()=>({projectId:'old-project',messages:[]})});
 assert.equal((options.abortSignal as AbortSignal).aborted,controller.signal.aborted);
 assert.equal((options.timeout as {totalMs:number})?.totalMs,300000);
 assert.equal((options.timeout as {firstChunkMs:number})?.firstChunkMs,60000);
 assert.match(String(options.system),/site-nav/);
});
