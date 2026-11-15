import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import * as nodeModule from 'node:module';
const {stripTypeScriptTypes}=nodeModule as unknown as {stripTypeScriptTypes:(source:string)=>string};
test('阶段提交忽略运行缓存和候选副本，已忽略目录不会让git add失败',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-git-regression-'));
 try {
  for(const dir of ['runtime','candidates','acceptance']){fs.mkdirSync(path.join(root,'.atoms',dir),{recursive:true});fs.writeFileSync(path.join(root,'.atoms',dir,'private'),'cache');}
  fs.writeFileSync(path.join(root,'.gitignore'),'.atoms/runtime/\n');fs.writeFileSync(path.join(root,'.atoms/SPEC.md'),'spec');fs.writeFileSync(path.join(root,'page.tsx'),'source');
  const runCommand=async(_id:string,command:string)=>{const r=spawnSync('/bin/bash',['-c',command],{cwd:root,encoding:'utf8'});return{exitCode:r.status,stdout:r.stdout,stderr:r.stderr};};
  const js=stripTypeScriptTypes(fs.readFileSync(new URL('./git.ts',import.meta.url),'utf8')).replace(/^import[^;]*;\n/gm,'').replace(/^export /gm,'');
  const commit=vm.runInNewContext(`${js}\ncommitAll`,{fs,path,runCommand,resolveInsideProject:(_id:string,p:string)=>path.join(root,p)});
  assert.equal(await commit('fixture','regression'),true);
  assert.equal(await commit('fixture','unchanged'),false);
  const tracked=(await runCommand('fixture','git ls-files')).stdout.trim().split('\n');
  assert.deepEqual(tracked,['.atoms/SPEC.md','.gitignore','page.tsx']);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
