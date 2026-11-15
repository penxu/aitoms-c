import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as nodeModule from 'node:module';
import {validatePlan} from './plan-schema.ts';
import {validateAcceptance} from './acceptance.ts';
import {consumeTextPreview} from './stream-preview.ts';
import {PLAN_SYSTEM_PROMPT} from './prompts.ts';
import {streamText} from 'ai';
import {createOpenAI} from '@ai-sdk/openai';
import {withDeadline} from './deadline.ts';
const require=nodeModule.createRequire(import.meta.url);
const {z}=require('zod');
const {stripTypeScriptTypes}=nodeModule as unknown as {stripTypeScriptTypes:(source:string)=>string};
const js=stripTypeScriptTypes(fs.readFileSync(new URL('./stages/plan.ts',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,'');
const base={pages:['/'],items:[{path:'app/page.tsx',action:'modify',purpose:'儿童英语学习',dependsOn:[]}],dataModel:[]};
function fixture(mode='preview',answer:unknown=base,fail=false,extra:Record<string,unknown>={}){
 let calls=0,writes=0;const options:Record<string,unknown>[]=[],logs:string[]=[];
 const response=JSON.stringify(answer);
 const request=(o:Record<string,unknown>)=>{calls++;options.push(o);return{text:response,usage:Promise.resolve({}),finishReason:Promise.resolve('stop'),textStream:(async function*(){if(fail)throw Error('upstream disconnected');yield response.slice(0,25);yield response.slice(25);})()};};
 const api=vm.runInNewContext(`${js}\nrunPlanStage`,{
  z,AbortController,AbortSignal,setTimeout,clearTimeout,Date,
  generateText:async(o:Record<string,unknown>)=>{if(fail){calls++;throw Error('upstream disconnected');}const r=request(o);return{...r,usage:{}};},streamText:request,
  config:{generationVerificationMode:mode,generationModelTimeoutMs:1000,modelFirstChunkTimeoutMs:100,modelChunkTimeoutMs:100},
  getModel:()=>({}),addRunTokens(){},readFile:()=> '## 页面\n- `/` 首页\n## 验收清单\nAC-01',writeFile:()=>{writes++;},
  listTemplateFiles:()=>['app/page.tsx'],projectRoot:()=> '/unused',collectSource:()=>[],collectExports:()=>[],
  planUserPrompt:()=> '需求',PLAN_SYSTEM_PROMPT,PREVIEW_PLAN_SYSTEM_PROMPT:'只生成业务实现结构，不生成 acceptance',
  extractJson:JSON.parse,validatePlan,validateAcceptance,requiredSpecRoutes:()=> ['/'],PLAN_JSON_PATH:'.atoms/PLAN.json',consumeTextPreview,withDeadline,
  ...extra,
 });
 return{run:(signal=new AbortController().signal)=>api({projectId:'p',runId:'r',signal,log:(_level:string,message:string)=>logs.push(message),emit(){}}),calls:()=>calls,writes:()=>writes,options,logs};
}
for(const acceptance of [undefined,[{id:'AC-01',steps:[]}],{invalid:true}])test(`默认预览不因缺失或错误验收而重写整份计划：${JSON.stringify(acceptance)}`,async()=>{
 const f=fixture('preview',{...base,acceptance});const result=await f.run();
 assert.equal(result.ok,true);assert.equal(f.calls(),1);assert.equal(f.writes(),1);assert.equal(result.plan.acceptance,undefined);
 assert.equal(f.options[0].maxRetries,0);assert.match(String(f.options[0].system),/不生成 acceptance/);
});
test('full 模式仍严格拒绝错误验收',async()=>{
 const f=fixture('full',{...base,acceptance:[{id:'AC-01',steps:[]}]});
 assert.equal((await f.run()).ok,false);assert.equal(f.writes(),0);
});
test('规划请求中断不静默重发，不写入部分计划',async()=>{
 const f=fixture('preview',base,true);const result=await f.run();
 assert.equal(result.ok,false);assert.equal(f.calls(),1);assert.equal(f.writes(),0);assert.match(result.error,/upstream disconnected/);
});
test('取消规划不请求模型，不写入文件',async()=>{
 const f=fixture();const c=new AbortController();c.abort();
 assert.equal((await f.run(c.signal)).error,'cancelled');assert.equal(f.calls(),0);assert.equal(f.writes(),0);
});

test('真实 SDK 在上游响应头迟迟不返回时也受首次响应期限控制',async()=>{
 let requests=0;
 const provider=createOpenAI({apiKey:'fixture-only',fetch:async(_url,options)=>{
  requests++;const signal=options?.signal;
  return new Promise<Response>((_resolve,reject)=>{if(signal?.aborted)reject(signal.reason);else signal?.addEventListener('abort',()=>reject(signal.reason),{once:true});});
 }});
 const f=fixture('preview',base,false,{streamText,getModel:()=>provider.chat('fixture'),config:{generationVerificationMode:'preview',generationModelTimeoutMs:1000,modelFirstChunkTimeoutMs:30,modelChunkTimeoutMs:30}});
 const result=await f.run();
 assert.equal(result.ok,false);assert.match(result.error,/首次响应超时/);assert.equal(requests,1);assert.equal(f.writes(),0);
});

test('真实 SDK 接收流式 JSON，规划无需非流式超时参数告警',async()=>{
 let requests=0;
 const provider=createOpenAI({apiKey:'fixture-only',fetch:async()=>{
  requests++;const data={id:'fixture',created:1,object:'chat.completion.chunk',model:'fixture',choices:[{index:0,delta:{content:JSON.stringify(base)},finish_reason:'stop'}]};
  return new Response(`data: ${JSON.stringify(data)}\n\ndata: [DONE]\n\n`,{headers:{'content-type':'text/event-stream'}});
 }});
 const f=fixture('preview',base,false,{streamText,getModel:()=>provider.chat('fixture')});
 const result=await f.run();
 assert.equal(result.ok,true);assert.equal(requests,1);assert.equal(f.writes(),1);assert.ok(f.logs.some(s=>s.includes('正在接收文件规划')));
});

test('真实 SDK 收到部分 JSON 后连接失败，不把部分计划当成功',async()=>{
 const provider=createOpenAI({apiKey:'fixture-only',fetch:async()=>new Response(new ReadableStream({start(controller){
  const chunk={id:'fixture',created:1,object:'chat.completion.chunk',model:'fixture',choices:[{index:0,delta:{content:'{"pages":['},finish_reason:null}]};
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
  setTimeout(()=>controller.error(new Error('fixture stream disconnected')),10);
 }}),{headers:{'content-type':'text/event-stream'}})});
 const f=fixture('preview',base,false,{streamText,getModel:()=>provider.chat('fixture')});
 const result=await f.run();assert.equal(result.ok,false);assert.equal(f.writes(),0);
});

test('旧计划的错误验收不阻止默认验证续跑，full 保留严格检查',()=>{
 const pipeline=stripTypeScriptTypes(fs.readFileSync(new URL('./pipeline.ts',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,'');
 for(const mode of ['preview','full']){
  const plan={...base,acceptance:[{broken:true}]};
  const load=vm.runInNewContext(`${pipeline}\nloadPlanFromDisk`,{
   config:{generationVerificationMode:mode},runDiscussionStage(){},runSpecStage(){},runPlanStage(){},runBuildStage(){},runVerifyStage(){},
   resolveInsideProject:()=>'/unused',fs:{existsSync:()=>true,statSync:()=>({size:100}),readFileSync:()=>JSON.stringify(plan)},
   validatePlan,validateAcceptance,collectSource:()=>[],listTemplateFiles:()=>['app/page.tsx'],readFile:()=>'',requiredSpecRoutes:()=>[],
  });
  if(mode==='full')assert.throws(()=>load('p'),/验收/);
  else{const restored=load('p');assert.equal(restored.acceptance,undefined);assert.equal(restored.items[0].path,'app/page.tsx');}
 }
});

test('文本已结束但 SDK 元数据不返回时也有等待期限',async()=>{
 const f=fixture('preview',base,false,{streamText:()=>({textStream:(async function*(){yield JSON.stringify(base);})(),finishReason:new Promise(()=>{}),usage:new Promise(()=>{})})});
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const result=await Promise.race([f.run(),new Promise<{ok:boolean}>(resolve=>{timer=setTimeout(()=>resolve({ok:true}),400);})]);
  assert.equal(result.ok,false,'不能永久等待流结束后的元数据');assert.equal(f.writes(),0);
 }finally{clearTimeout(timer);}
});
