import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import * as nodeModule from 'node:module';
const {stripTypeScriptTypes}=nodeModule as unknown as {stripTypeScriptTypes:(s:string)=>string};
for(const fail of [false,true])test(fail?'候选安装失败时清除本轮大目录，保留工作区与数据':'候选依赖使用独立文件，修改候选不会污染工作区',async()=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'atoms-candidate-storage-')));
 fs.mkdirSync(path.join(root,'node_modules/pkg'),{recursive:true});fs.writeFileSync(path.join(root,'node_modules/pkg/index.js'),'original');fs.mkdirSync(path.join(root,'data'));fs.writeFileSync(path.join(root,'data/app.db'),'data');
 const js=stripTypeScriptTypes(fs.readFileSync(new URL('./candidate-snapshot.ts',import.meta.url),'utf8')).replace(/^import[^;]*;\n/gm,'').replace(/^export /gm,'');
 const prepare=vm.runInNewContext(`${js}\nprepareCandidate`,{fs,os,path,Date,projectRoot:()=>root,resolveInsideProject:(_id:string,relative:string)=>path.join(root,relative),snapshotSource:(_r:string,dest:string)=>{fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(dest,'package.json'),'{}');},pruneCandidates:async()=>[],ensureProjectDependencies:async()=>({exitCode:fail?1:0,stderr:'fixture failed'})});
 try{
  if(fail){await assert.rejects(prepare('p','run'),/fixture failed/);assert.equal(fs.readdirSync(path.join(root,'.atoms/candidates')).length,0);}
  else{const candidate=await prepare('p','run');const target=path.join(candidate.absoluteRoot,'node_modules/pkg/index.js');fs.writeFileSync(target,'changed');assert.equal(fs.readFileSync(path.join(root,'node_modules/pkg/index.js'),'utf8'),'original');}
  assert.equal(fs.readFileSync(path.join(root,'data/app.db'),'utf8'),'data');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
