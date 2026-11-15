import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as nodeModule from 'node:module';
const {stripTypeScriptTypes}=nodeModule as unknown as {stripTypeScriptTypes:(s:string)=>string};
const source=stripTypeScriptTypes(fs.readFileSync(new URL('../../app/api/projects/[id]/generate/route.ts',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,'');
function fixture(status:string){
 let starts=0;
 const context={Request,Response,ReadableStream,TextEncoder,
  NextResponse:{json:(value:unknown,init?:ResponseInit)=>Response.json(value,init)},
  getProject:()=>({id:'p'}),getGenerationRun:(id:string)=>id==='r'?{id:'r',projectId:'p',status}:undefined,
  getEventBus:()=>({history:()=>[{type:'run',status}],subscribe(){throw new Error('终态不订阅新事件');}}),
  getModelConfigurationError(){throw new Error('订阅已有任务不需要再次校验模型配置');},
  startGeneration(){starts++;throw new Error('不应创建新任务');},
 };
 const post=vm.runInNewContext(`${source}\nPOST`,context);
 return {get starts(){return starts;},post:(body:unknown)=>post(new Request('http://localhost/api/projects/p/generate',{method:'POST',body:JSON.stringify(body)}),{params:Promise.resolve({id:'p'})})};
}
test('订阅刚结束的任务回放真实状态，不启动空白生成',async()=>{
 for(const status of ['ready','failed','cancelled','waiting']){
  const f=fixture(status),response=await f.post({action:'subscribe',runId:'r'});
  assert.equal(response.status,200);assert.match(await response.text(),new RegExp(status));assert.equal(f.starts,0);
 }
});
test('订阅不存在的任务不会退回启动生成',async()=>{const f=fixture('failed');const response=await f.post({action:'subscribe',runId:'missing'});assert.equal(response.status,404);assert.equal(f.starts,0);});
