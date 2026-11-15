import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as nodeModule from 'node:module';
const {stripTypeScriptTypes}=nodeModule as unknown as {stripTypeScriptTypes:(source:string)=>string};
const js=stripTypeScriptTypes(fs.readFileSync(new URL('../workspace/preview.ts',import.meta.url),'utf8')).replace(/^import[^;]*;\n/gm,'').replace(/^export /gm,'');
test('显式运行应用最新工作区快照，而不是重新启动历史候选',async()=>{
 let selected='';
 const refresh=vm.runInNewContext(`${js}\nrefreshProjectPreview`,{Date,config:{generationVerificationMode:'preview'},fs:{existsSync:()=>false},path:{join:()=>"package.json"},prepareCandidate:async()=>({relativeRoot:'.atoms/candidates/new-source'}),restartService:async(_id:string,options:{sourceDir:string})=>{selected=options.sourceDir;return{port:4001};}});
 assert.equal((await refresh('p',new AbortController().signal)).port,4001);
 assert.equal(selected,'.atoms/candidates/new-source');
});
test('等待快照期间取消后禁止切换预览',async()=>{
 const controller=new AbortController();let switched=false;
 const refresh=vm.runInNewContext(`${js}\nrefreshProjectPreview`,{Date,fs:{existsSync:()=>false},path:{join:()=>"package.json"},prepareCandidate:async()=>{controller.abort();return{relativeRoot:'.atoms/candidates/new'};},restartService:async()=>{switched=true;}});
 await assert.rejects(refresh('p',controller.signal));assert.equal(switched,false);
});

test('聊天启动和刷新默认不执行Next生产构建',async()=>{
 let commands=0,switched=false;
 const refresh=vm.runInNewContext(`${js}\nrefreshProjectPreview`,{Date,config:{generationVerificationMode:'preview'},fs:{existsSync:()=>true,readFileSync:()=>'{"dependencies":{"next":"16"}}',mkdtempSync:()=>'/tmp/test',rmSync(){}},path:{join:()=> 'package.json'},os:{tmpdir:()=>'/tmp'},prepareCandidate:async()=>({relativeRoot:'.atoms/candidates/dev',absoluteRoot:'/tmp/dev'}),withBuildSlot:async(fn:()=>unknown)=>fn(),pnpmShellCommand:()=> 'pnpm',runCommand:async()=>{commands++;throw Error('不允许生产构建');},restartService:async()=>{switched=true;return{port:4001};}});
 assert.equal((await refresh('p',new AbortController().signal)).port,4001);assert.equal(commands,0);assert.equal(switched,true);
});
