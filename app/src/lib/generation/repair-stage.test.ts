import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as nodeModule from 'node:module';
import {parseRepairOutput,applyRepairFix} from './repair-output.ts';
const {stripTypeScriptTypes}=nodeModule as unknown as {stripTypeScriptTypes:(s:string)=>string};
const js=stripTypeScriptTypes(fs.readFileSync(new URL('./stages/verify.ts',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\n/gm,'').replace(/^export \{[^\n]*\n/gm,'').replace(/^export /gm,'');
for(const cancelled of [false,true])test(`缺失导入文件修复${cancelled?'取消后禁止落盘':'允许安全创建完整文件'}`,async()=>{
 const controller=new AbortController();const writes:string[]=[];
 const repair=vm.runInNewContext(`${js}\nrepair`,{
  fs:{existsSync:()=>false},resolveInsideProject:()=>"/test/missing", parseTscDiagnostics:()=>[],parseNextBuildDiagnostics:()=>[],resolveGeneratedDiagnostics:()=>[],projectRoot:()=>'/test',
  computeProjectHash:()=>"source", collectExports:()=>[],isSafePlanPath:()=>true,isProtectedPath:()=>false,readFile:()=>{throw Error('missing');},
  getModel:()=>null,REPAIR_SYSTEM_PROMPT:'repair',repairUserPrompt:()=>'',config:{},addRunTokens(){},
  generateText:async()=>{if(cancelled)controller.abort();return{text:JSON.stringify({fixes:[{path:'components/layout/site-nav.tsx',content:'export const Nav=()=>null;'}]}),usage:{}};},
  parseRepairOutput,applyRepairFix,normalizeSource:(_p:string,content:string)=>({content,notes:[]}),checkTemplateContract:()=>null,
  checkpointHash:()=>'',fileCheckpoints:()=>({recordRepair(){}}),writeFileAtomic:(_id:string,path:string)=>writes.push(path),
 });
 const result=await repair({projectId:'p',runId:'run',requirement:'test',plan:null,signal:controller.signal,log(){},emit(){}},"app/page.tsx: 找不到模块 @/components/layout/site-nav");
 assert.equal(result.status,cancelled?'aborted':'ok');assert.deepEqual(writes,cancelled?[]:['components/layout/site-nav.tsx']);
});
