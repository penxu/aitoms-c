import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as nodeModule from 'node:module';
const {stripTypeScriptTypes}=nodeModule as unknown as {stripTypeScriptTypes:(source:string)=>string};
const js=stripTypeScriptTypes(fs.readFileSync(new URL('../workspace/preview.ts',import.meta.url),'utf8')).replace(/^import[^;]*;\n/gm,'').replace(/^export /gm,'');
test('显式运行应用最新工作区快照，而不是重新启动历史候选',async()=>{
 let selected='';
 const refresh=vm.runInNewContext(`${js}\nrefreshProjectPreview`,{Date,fs:{existsSync:()=>false},path:{join:()=>"package.json"},prepareCandidate:async()=>({relativeRoot:'.atoms/candidates/new-source'}),restartService:async(_id:string,options:{sourceDir:string})=>{selected=options.sourceDir;return{port:4001};}});
 assert.equal((await refresh('p',new AbortController().signal)).port,4001);
 assert.equal(selected,'.atoms/candidates/new-source');
});
test('等待快照期间取消后禁止切换预览',async()=>{
 const controller=new AbortController();let switched=false;
 const refresh=vm.runInNewContext(`${js}\nrefreshProjectPreview`,{Date,fs:{existsSync:()=>false},path:{join:()=>"package.json"},prepareCandidate:async()=>{controller.abort();return{relativeRoot:'.atoms/candidates/new'};},restartService:async()=>{switched=true;}});
 await assert.rejects(refresh('p',controller.signal));assert.equal(switched,false);
});
