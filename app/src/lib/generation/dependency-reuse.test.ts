import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import * as nodeModule from 'node:module';
import * as cache from './dependency-cache.ts';
const {stripTypeScriptTypes}=nodeModule as unknown as {stripTypeScriptTypes:(s:string)=>string};
const runtime={node:'v24',platform:'linux',arch:'x64',backend:'native',image:''};
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-deps-ready-'));
 const modules=path.join(root,'node_modules');fs.mkdirSync(path.join(modules,'.bin'),{recursive:true});
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({dependencies:{next:'16'},devDependencies:{typescript:'5'}}));
 fs.writeFileSync(path.join(root,'pnpm-lock.yaml'),'lockfileVersion: 9');
 for(const [name,entry] of [['next','dist/bin/next'],['typescript','bin/tsc']]){
  fs.mkdirSync(path.dirname(path.join(modules,name,entry)),{recursive:true});fs.writeFileSync(path.join(modules,name,entry),'#!/usr/bin/env node\n');
  fs.writeFileSync(path.join(modules,name,'package.json'),JSON.stringify({name}));
 }
 for(const bin of ['next','tsc'])fs.writeFileSync(path.join(modules,'.bin',bin),'#!/bin/sh\n');
 fs.writeFileSync(path.join(modules,'.atoms-runtime.json'),JSON.stringify({runtime:JSON.stringify(runtime),fingerprint:cache.dependencyFingerprint(root,runtime)}));
 return root;
}
test('已验证安装只在清单、锁、环境与直接依赖完整时复用',async()=>{
 const root=fixture();
 try{
  const subject=await import('./dependency-cache.ts');
  assert.equal(typeof subject.hasInstalledDependencies,'function');
  assert.equal(subject.hasInstalledDependencies(root,runtime),true);
  assert.equal(subject.hasInstalledDependencies(root,{...runtime,node:'v22'}),false);
  fs.appendFileSync(path.join(root,'pnpm-lock.yaml'),'\nchanged: true');
  assert.equal(subject.hasInstalledDependencies(root,runtime),false);
  fs.writeFileSync(path.join(root,'pnpm-lock.yaml'),'lockfileVersion: 9');
  const manifest=fs.readFileSync(path.join(root,'package.json'),'utf8');
  fs.writeFileSync(path.join(root,'package.json'),manifest+' ');
  assert.equal(subject.hasInstalledDependencies(root,runtime),false);
  fs.writeFileSync(path.join(root,'package.json'),manifest);
  assert.equal(subject.hasInstalledDependencies(root,runtime),true);
  fs.rmSync(path.join(root,'node_modules','next','package.json'));
  assert.equal(subject.hasInstalledDependencies(root,runtime),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('复制到候选目录的匹配依赖不再调用pnpm重建',async()=>{
 const root=fixture(),candidate=path.join(root,'candidate');
 try{
  for(const name of ['package.json','pnpm-lock.yaml','node_modules'])fs.cpSync(path.join(root,name),path.join(candidate,name),{recursive:true});
  let runs=0;
  const js=stripTypeScriptTypes(fs.readFileSync(new URL('./scaffold.ts',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,'');
  const ensure=vm.runInNewContext(`${js}\nensureProjectDependencies`,{fs,path,config:{},resolveInsideProject:(_id:string,rel:string)=>rel==='.'?candidate:path.join(candidate,rel),ensureWorkspaceRuntime:async()=>runtime,workspaceExecutionRuntime:()=>runtime,...cache,installDependenciesCommand:()=> 'pnpm install',restoreNodeModulesCache:async()=>false,runCommand:async()=>{runs++;return{exitCode:0};}});
  const result=await ensure('p');assert.equal(runs,0,'不能再次运行pnpm导致复制依赖被重建');assert.equal(result.exitCode,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
