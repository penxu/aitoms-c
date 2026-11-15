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
  confirmedRequirement:(_id:string,requirement:string)=>requirement+'（已确认：服务列表与后台）',readFile:()=> 'existing spec',
  HARNESS_SYSTEM_PROMPT:'工程师',stepCountIs:()=>30,generateId:()=> 'id',describeModelError:String,
  config:{chatTimeoutMs:300000,modelFirstChunkTimeoutMs:60000},
  streamText:(v:Record<string,unknown>)=>{options=v;return{toUIMessageStreamResponse:()=>new Response('ok')}},
 });
 await post({signal:controller.signal,json:async()=>({projectId:'old-project',messages:[]})});
 assert.equal((options.abortSignal as AbortSignal).aborted,controller.signal.aborted);
 assert.equal((options.timeout as {totalMs:number})?.totalMs,300000);
 assert.equal((options.timeout as {firstChunkMs:number})?.firstChunkMs,60000);
 assert.match(String(options.system),/site-nav/);
 assert.match(String(options.system),/宠物预约网站/);
 assert.match(String(options.system),/已确认/);
});

test('需求讨论早期失败且没有规格时拒绝普通聊天初始化，保留原任务续跑入口',async()=>{
 let streamed=false,released=false;
 const updated=stripTypeScriptTypes(fs.readFileSync(new URL('../../app/api/chat/route.ts',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,'');
 const post=vm.runInNewContext(`${updated}\nPOST`,{Response,AbortController,AbortSignal,setTimeout,clearTimeout,config:{chatTimeoutMs:1000},getModelConfigurationError:()=>null,acquireProjectMutation:()=>()=>{released=true;},getLatestGenerationRun:()=>({id:'r',status:'failed',stage:'discuss',requirement:'预约应用'}),readFile:()=>{throw new Error('missing');},streamText:()=>{streamed=true;},console});
 const response=await post({signal:new AbortController().signal,json:async()=>({projectId:'p',messages:[]})});
 assert.equal(response.status,409);assert.equal((await response.json()).code,'GENERATION_RETRY_REQUIRED');assert.equal(streamed,false);assert.equal(released,true);
});
