import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import ts from 'typescript';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
function fixture(live=false,busy=false){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'atoms-safe-prune-'))),project=path.join(root,'p');fs.mkdirSync(project);
 const source=ts.transpileModule(fs.readFileSync(new URL('./cache-cleanup.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(source,{exports,require:(name:string)=>{
  if(name==='@/lib/config')return{config:{workspaceRoot:root}};
  if(name==='@/lib/runner')return{getProtectedRuntimeSources:()=>live?['.']:[]};
  if(name==='@/lib/workspace/mutations')return{acquireProjectMutation:()=>{if(busy)throw Error('busy');return()=>{};}};
  if(name==='@/lib/workspace/paths')return{resolveInsideProject:(_id:string,rel:string)=>{const target=path.join(project,rel);return fs.existsSync(target)?fs.realpathSync(target):target;}};
  return require(name);
 }});return{root,project,prune:(exports as {pruneStaleCaches:(o?:unknown)=>Promise<unknown>}).pruneStaleCaches};
}
for(const live of [true,false])test(live?'平台恢复后仍在运行的服务，其TMP和下载仓库不能被启动清理删除':'忙碌项目不能在生成安装时被后台清缓存',async()=>{
 const f=fixture(live,!live);
 try{for(const rel of ['.atoms/runtime/tmp/keep','.atoms/runtime/pnpm-store/keep']){const file=path.join(f.project,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'keep');}await f.prune({maxCandidateAgeMs:0,dropStores:true});for(const rel of ['.atoms/runtime/tmp/keep','.atoms/runtime/pnpm-store/keep'])assert.equal(fs.readFileSync(path.join(f.project,rel),'utf8'),'keep');}
 finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('后台缓存清理不跟随缓存根符号链接',async()=>{
 const f=fixture(),outside=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-safe-prune-outside-'));
 try{fs.mkdirSync(path.join(outside,'tmp'));fs.writeFileSync(path.join(outside,'tmp/keep'),'safe');fs.mkdirSync(path.join(f.project,'.atoms'));fs.symlinkSync(outside,path.join(f.project,'.atoms/runtime'));await f.prune({dropStores:true});assert.equal(fs.readFileSync(path.join(outside,'tmp/keep'),'utf8'),'safe');}
 finally{fs.rmSync(f.root,{recursive:true,force:true});fs.rmSync(outside,{recursive:true,force:true});}
});
