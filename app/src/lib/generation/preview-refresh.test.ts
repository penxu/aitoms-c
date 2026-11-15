import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as nodeModule from 'node:module';
const {stripTypeScriptTypes}=nodeModule as unknown as {stripTypeScriptTypes:(source:string)=>string};
const js=stripTypeScriptTypes(fs.readFileSync(new URL('../workspace/preview.ts',import.meta.url),'utf8')).replace(/^import[^;]*;\n/gm,'').replace(/^export /gm,'');
function fixture({mode='preview',changed=false,fail=false,cancel=false}={}) {
 const controller=new AbortController(),calls:string[]=[],messages:string[]=[];
 const context={Date,config:{generationVerificationMode:mode},
  fs:{existsSync:()=>true,readFileSync:()=>'{"dependencies":{"next":"16"}}',mkdtempSync:()=>'/tmp/test',rmSync(){}},path:{join:()=> 'package.json'},os:{tmpdir:()=>'/tmp'},
  ensureProjectDependencies:async(_id:string,_signal:unknown,_env:unknown,cwd:string,_packages:unknown,notify?:(message:string)=>void)=>{calls.push('dependencies:'+cwd);notify?.('依赖检查进度');if(cancel)controller.abort();return{exitCode:fail?1:0,stderr:fail?'registry unavailable':'',dependenciesChanged:changed};},
  prepareCandidate:async()=>{calls.push('snapshot');return{relativeRoot:'.atoms/candidates/full',absoluteRoot:'/tmp/full'};},
  startService:async(_id:string,options:{sourceDir:string})=>{calls.push('start:'+options.sourceDir);return{port:4001};},
  restartService:async(_id:string,options:{sourceDir:string})=>{calls.push('restart:'+options.sourceDir);return{port:4001};},
  withBuildSlot:async(fn:()=>unknown)=>fn(),pnpmShellCommand:()=> 'pnpm',runCommand:async()=>{calls.push('build');return{exitCode:0};},pruneCandidates:async()=>{calls.push('prune');},
 };
 return{refresh:vm.runInNewContext(`${js}\nrefreshProjectPreview`,context),controller,calls,messages};
}
test('普通运行复用项目根目录dev，不复制候选或执行构建',async()=>{
 const f=fixture();assert.equal((await f.refresh('p',f.controller.signal,(m:string)=>f.messages.push(m))).port,4001);
 assert.deepEqual(f.calls,['dependencies:.','start:.','prune']);assert.match(f.messages.join('\n'),/依赖检查进度/);
});
test('显式重启与依赖变化重启根目录dev',async()=>{
 for(const changed of [false,true]){const f=fixture({changed});await f.refresh('p',f.controller.signal,undefined,{restart:!changed});assert.deepEqual(f.calls,['dependencies:.','restart:.','prune']);}
});
test('依赖失败或取消时不切换当前服务',async()=>{
 for(const flag of ['fail','cancel'] as const){const f=fixture({[flag]:true});await assert.rejects(f.refresh('p',f.controller.signal));assert.deepEqual(f.calls,['dependencies:.']);}
});
test('full验证仍使用独立候选与生产构建',async()=>{
 const f=fixture({mode:'full'});await f.refresh('p',f.controller.signal);assert.deepEqual(f.calls,['snapshot','build','build','restart:.atoms/candidates/full','prune']);
});
