import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import * as nodeModule from 'node:module';
import * as cache from './dependency-cache.ts';
import {TemplateDependencyInstallError} from './template-dependencies.ts';
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
  const ensure=vm.runInNewContext(`${js}\nensureProjectDependencies`,{fs,path,pruneInstalledDownloadCache:async()=>false,config:{},resolveInsideProject:(_id:string,rel:string)=>rel==='.'?candidate:path.join(candidate,rel),ensureWorkspaceRuntime:async()=>runtime,workspaceExecutionRuntime:()=>runtime,...cache,installDependenciesCommand:()=> 'pnpm install',restoreNodeModulesCache:async()=>false,runCommand:async()=>{runs++;return{exitCode:0};}});
  const result=await ensure('p');assert.equal(runs,0,'不能再次运行pnpm导致复制依赖被重建');assert.equal(result.exitCode,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('安装入口命中模板缓存后写成功指纹；定制依赖及缓存失败仍走独立安装',async()=>{
 const f=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-template-install-'));
 try{
  const template=path.join(f,'templates/next-base');fs.mkdirSync(template,{recursive:true});fs.writeFileSync(path.join(template,'package.json'),'{}');
  const cli=path.join(f,'pnpm/bin/pnpm.cjs');fs.mkdirSync(path.dirname(cli),{recursive:true});fs.writeFileSync(path.resolve(cli,'../../package.json'),'{"version":"10"}');
  const source=stripTypeScriptTypes(fs.readFileSync(new URL('./scaffold.ts',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,'');
  for(const mode of ['reuse','extra','failure','installFailure']){
   const root=path.join(f,mode);fs.mkdirSync(root);fs.writeFileSync(path.join(root,'package.json'),'{}');
   let installs=0,reuses=0;
   const api=vm.runInNewContext(`${source}\nensureProjectDependencies`,{
    fs,path,process,TemplateDependencyInstallError,config:{templateRoot:path.dirname(template),templateCacheRoot:path.join(f,'cache'),packageRegistry:'https://registry.npmjs.org'},
    resolveInsideProject:(_id:string,rel:string)=>path.join(root,rel),ensureProjectRoot:()=>root,
    ensureWorkspaceRuntime:async()=>runtime,workspaceExecutionRuntime:()=>runtime,
    hasInstalledDependencies:()=>false,prepareDependencyRuntime:()=>false,
    dependencyFingerprint:()=> 'fingerprint',pnpmCliPath:()=>cli,installDependenciesCommand:()=> 'pnpm install',
    isReusableDependencyTree:()=>false,pruneInstalledDownloadCache:async()=>false,
    restoreDependencyCache:async()=>false,runCommand:async()=>{installs++;return{exitCode:0};},
    reuseTemplateDependencies:async()=>{
     reuses++;
     if(mode==='failure')throw Error('cache unavailable');
     if(mode==='installFailure')throw new TemplateDependencyInstallError({exitCode:1,stdout:'',stderr:'compile failed',timedOut:false,aborted:false});
     fs.mkdirSync(path.join(root,'node_modules'));fs.writeFileSync(path.join(root,'pnpm-lock.yaml'),'lock');
     return {exitCode:0};
    },
   });
   assert.equal((await api('p',undefined,undefined,'.',mode==='extra'?['clsx']:[])).exitCode,mode==='installFailure'?1:0);
   assert.equal(installs,mode==='reuse'||mode==='installFailure'?0:1);
   assert.equal(reuses,mode==='extra'?0:1);
   if(mode==='reuse')assert.equal(JSON.parse(fs.readFileSync(path.join(root,'node_modules/.atoms-runtime.json'),'utf8')).fingerprint,'fingerprint');
  }
 }finally{fs.rmSync(f,{recursive:true,force:true});}
});

test('模板复用后显式加包先切换独立依赖，避免 pnpm add 指向已回收 store',async()=>{
 const root=fixture();try{
  const marker=path.join(root,'node_modules/.atoms-runtime.json');
  fs.writeFileSync(marker,JSON.stringify({templateCache:true,runtime:JSON.stringify(runtime)}));
  let called=0;
  const source=stripTypeScriptTypes(fs.readFileSync(new URL('./scaffold.ts',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,'');
  const ensure=vm.runInNewContext(`${source}\nensureProjectDependencies`,{
   fs,path,config:{},resolveInsideProject:(_id:string,rel:string)=>path.join(root,rel),
   ensureWorkspaceRuntime:async()=>runtime,workspaceExecutionRuntime:()=>runtime,
   ...cache,installDependenciesCommand:()=> 'pnpm add clsx',pruneInstalledDownloadCache:async()=>false,
   runCommand:async()=>{called++;assert.equal(fs.existsSync(path.join(root,'node_modules')),false);return{exitCode:1,stderr:'fixture installation failed'};},
  });
  assert.equal((await ensure('p',undefined,undefined,'.',['clsx'])).exitCode,1);
  assert.equal(called,1);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('添加或修改项目安装配置会使成功安装指纹失效',()=>{
 const root=fixture();try{
  assert.equal(cache.hasInstalledDependencies(root,runtime),true);
  fs.writeFileSync(path.join(root,'.npmrc'),'registry=https://registry.example.invalid\n');
  assert.equal(cache.hasInstalledDependencies(root,runtime),false);
  fs.unlinkSync(path.join(root,'.npmrc'));
  assert.equal(cache.hasInstalledDependencies(root,runtime),true);
  fs.writeFileSync(path.join(root,'pnpm-workspace.yaml'),'packages: []\n');
  assert.equal(cache.hasInstalledDependencies(root,runtime),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
