import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import * as nodeModule from 'node:module';
const {stripTypeScriptTypes}=nodeModule as unknown as {stripTypeScriptTypes:(source:string)=>string};
test('自动修复后的再次验收使用全新测试数据库，不能带入上轮残留记录',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-browser-attempt-'));const databases:string[]=[];
 try {
  const js=stripTypeScriptTypes(fs.readFileSync(new URL('./candidate-checks.ts',import.meta.url),'utf8')).replace(/^import[^;]*;\n/gm,'').replace(/^export /gm,'');
  const check=vm.runInNewContext(`${js}\ncheckCandidate`,{fs,path,AbortController,AbortSignal,setTimeout,clearTimeout,config:{generationVerificationMode:'full',acceptanceTimeoutMs:1000},allocatePort:async()=>4000,releasePortReservation(){},pnpmShellCommand:()=> 'pnpm',runCommand:async(_id:string,_command:string,options:{signal:AbortSignal;env:{DATABASE_PATH:string}})=>{databases.push(options.env.DATABASE_PATH);return new Promise(resolve=>options.signal.addEventListener('abort',()=>resolve({stdout:'',stderr:'',exitCode:null}),{once:true}));},waitForHealth:async()=>true,runAcceptance:async(_url:string,checks:{id:string}[])=>checks.map(item=>({id:item.id,status:'passed',durationMs:1})),writeFile(){},resolveInsideProject:(_id:string,rel:string)=>path.join(root,rel)});
  const ctx={projectId:'fixture',runId:'run',signal:new AbortController().signal,plan:{pages:['/'],acceptance:[{id:'AC-1',route:'/',steps:[{action:'expectText',text:'ok'}]}]},log(){}};
  await check(ctx,'candidate',root);await check(ctx,'candidate',root);
  assert.equal(databases.length,4);assert.equal(new Set(databases).size,4);
  assert.equal(databases.every(filename=>!fs.existsSync(path.dirname(filename))),true);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('默认预览只检查实际首页，不执行坏业务验收或启动Chromium',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-preview-home-'));
 let browserCalls=0,httpCalls=0;const reports:string[]=[];
 const commands:{command:string;env:{NODE_ENV:string}}[]=[];
 try {
  const js=stripTypeScriptTypes(fs.readFileSync(new URL('./candidate-checks.ts',import.meta.url),'utf8')).replace(/^import[^;]*;\n/gm,'').replace(/^export /gm,'');
  const check=vm.runInNewContext(`${js}\ncheckCandidate`,{fs,path,AbortController,AbortSignal,setTimeout,clearTimeout,config:{generationVerificationMode:'preview',acceptanceTimeoutMs:1000},allocatePort:async()=>4000,releasePortReservation(){},pnpmShellCommand:()=> 'pnpm',runCommand:async(_id:string,command:string,options:{signal:AbortSignal;env:{NODE_ENV:string}})=>{commands.push({command,env:options.env});return new Promise(resolve=>options.signal.addEventListener('abort',()=>resolve({stdout:'',stderr:'',exitCode:null}),{once:true}));},waitForHealth:async()=>true,
   checkPreviewHome:async()=>{httpCalls++;return [{id:'PREVIEW-HOME',status:'passed',durationMs:1}];},
   runAcceptance:async()=>{browserCalls++;throw Error('Chromium not installed');},writeFile:(_id:string,_p:string,content:string)=>reports.push(content),resolveInsideProject:(_id:string,rel:string)=>path.join(root,rel)});
  const result=await check({projectId:'p',runId:'r',signal:new AbortController().signal,plan:{pages:['/'],acceptance:[{broken:true}]},log(){}},'candidate',root);
  assert.equal(browserCalls,0);assert.equal(httpCalls,1);assert.equal(result[0].status,'passed');assert.equal(JSON.parse(reports[0]).results[0].id,'PREVIEW-HOME');
  assert.match(commands[0].command,/run dev --webpack/);assert.equal(commands[0].env.NODE_ENV,'development');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
