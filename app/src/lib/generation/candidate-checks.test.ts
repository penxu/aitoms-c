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
  const check=vm.runInNewContext(`${js}\ncheckCandidate`,{fs,path,AbortController,AbortSignal,setTimeout,clearTimeout,config:{acceptanceTimeoutMs:1000},allocatePort:async()=>4000,releasePortReservation(){},pnpmShellCommand:()=> 'pnpm',runCommand:async(_id:string,_command:string,options:{signal:AbortSignal;env:{DATABASE_PATH:string}})=>{databases.push(options.env.DATABASE_PATH);return new Promise(resolve=>options.signal.addEventListener('abort',()=>resolve({stdout:'',stderr:'',exitCode:null}),{once:true}));},waitForHealth:async()=>true,runAcceptance:async(_url:string,checks:{id:string}[])=>checks.map(item=>({id:item.id,status:'passed',durationMs:1})),writeFile(){},resolveInsideProject:(_id:string,rel:string)=>path.join(root,rel)});
  const ctx={projectId:'fixture',runId:'run',signal:new AbortController().signal,plan:{pages:['/'],acceptance:[{id:'AC-1',route:'/',steps:[{action:'expectText',text:'ok'}]}]},log(){}};
  await check(ctx,'candidate',root);await check(ctx,'candidate',root);
  assert.equal(databases.length,4);assert.equal(new Set(databases).size,4);
  assert.equal(databases.every(filename=>!fs.existsSync(path.dirname(filename))),true);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
