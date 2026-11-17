import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {templateManifestMatches, templateDependencyKey, reuseTemplateDependencies} from './template-dependencies.ts';

const template=JSON.stringify({name:'base',private:true,version:'1',scripts:{dev:'next dev'},dependencies:{next:'16.4.6'},devDependencies:{typescript:'5.9.3'}});
function fixture(){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-template-deps-'));
 const cacheRoot=path.join(base,'cache');let installs=0;
 const install=async(root:string)=>{
  installs++;
  assert.equal(fs.readFileSync(path.join(root,'package.json'),'utf8'),template);
  fs.writeFileSync(path.join(root,'pnpm-lock.yaml'),'lockfileVersion: 9\n');
  for(const [bin,entry] of [['next','next/dist/bin/next'],['tsc','typescript/bin/tsc']]){
   fs.mkdirSync(path.dirname(path.join(root,'node_modules',entry)),{recursive:true});
   fs.mkdirSync(path.join(root,'node_modules/.bin'),{recursive:true});
   fs.writeFileSync(path.join(root,'node_modules',entry),'#!/usr/bin/env node\n');
   fs.writeFileSync(path.join(root,'node_modules/.bin',bin),'#!/bin/sh\n');
  }
  fs.writeFileSync(path.join(root,'node_modules/next/package.json'),'{"main":"index.js"}');
  fs.writeFileSync(path.join(root,'node_modules/next/index.js'),'module.exports = "baseline";');
  fs.symlinkSync('index.js',path.join(root,'node_modules/next/relative.js'));
  return {stdout:'installed',stderr:'',exitCode:0,timedOut:false,aborted:false};
 };
 const project=(name:string)=>{const root=path.join(base,name);fs.mkdirSync(root);fs.writeFileSync(path.join(root,'package.json'),template.replace('"base"',JSON.stringify(name)));return root;};
 const options={createStage:()=>fs.promises.mkdtemp(path.join(base,'isolated-stage-')),cacheRoot,template,runtime:'node-linux-x64',toolchain:'pnpm10',registry:'https://registry.npmjs.org',install};
 return {base,project,options,installs:()=>installs,cleanup:()=>fs.rmSync(base,{recursive:true,force:true})};
}

test('模板匹配忽略名称与字段顺序，但拒绝额外包、脚本和 pnpm 配置',()=>{
 assert.equal(templateManifestMatches(template,template.replace('"base"','"child"')),true);
 const original=JSON.parse(template);
 assert.equal(templateManifestMatches(template,JSON.stringify({...original,dependencies:{next:'16.4.6',bad:'1'}})),false);
 assert.equal(templateManifestMatches(template,JSON.stringify({...original,scripts:{...original.scripts,postinstall:'bad'}})),false);
 assert.equal(templateManifestMatches(template,JSON.stringify({...original,pnpm:{overrides:{next:'1'}}})),false);
 assert.equal(templateManifestMatches(template,'[]'),false);
 assert.equal(templateManifestMatches(template,'bad-json'),false);
 const key={template,runtime:'native-v22-linux-x64',toolchain:'pnpm10',registry:'https://registry.npmjs.org'};
 const first=templateDependencyKey(key);
 for(const field of ['runtime','toolchain','registry'] as const)assert.notEqual(templateDependencyKey({...key,[field]:'different'}),first);
});

test('两个新项目仅安装一次，真实模块加载、独立修改及删除缓存均保持可用',async()=>{
 const f=fixture();try{
  const a=f.project('a'),b=f.project('b');
  assert.equal((await reuseTemplateDependencies({...f.options,root:a}))?.exitCode,0);
  assert.equal((await reuseTemplateDependencies({...f.options,root:b}))?.exitCode,0);
  assert.equal(f.installs(),1);
  assert.equal(fs.readFileSync(path.join(b,'pnpm-lock.yaml'),'utf8'),'lockfileVersion: 9\n');
  const fileA=path.join(a,'node_modules/next/index.js'),fileB=path.join(b,'node_modules/next/index.js');
  assert.notEqual(fs.statSync(fileA).ino,fs.statSync(fileB).ino);
  fs.writeFileSync(fileA,'module.exports = "changed";');
  fs.rmSync(f.options.cacheRoot,{recursive:true,force:true});
  assert.equal(createRequire(path.join(a,'package.json'))('next'),'changed');
  assert.equal(createRequire(path.join(b,'package.json'))('next'),'baseline');
  assert.equal(fs.readlinkSync(path.join(b,'node_modules/next/relative.js')),'index.js');
 }finally{f.cleanup();}
});

test('并发冷启动共享预热；锁文件冲突及额外依赖回退，保留原文件',async()=>{
 const f=fixture();try{
  const a=f.project('a'),b=f.project('b');
  await Promise.all([reuseTemplateDependencies({...f.options,root:a}),reuseTemplateDependencies({...f.options,root:b})]);
  assert.equal(f.installs(),1);
  const c=f.project('c');fs.writeFileSync(path.join(c,'pnpm-lock.yaml'),'custom lock');
  assert.equal(await reuseTemplateDependencies({...f.options,root:c}),null);
  assert.equal(fs.readFileSync(path.join(c,'pnpm-lock.yaml'),'utf8'),'custom lock');
  assert.equal(fs.existsSync(path.join(c,'node_modules')),false);
  const d=f.project('d');fs.writeFileSync(path.join(d,'package.json'),template.replace('"next":"16.4.6"','"next":"99"'));
  assert.equal(await reuseTemplateDependencies({...f.options,root:d}),null);
  assert.equal(f.installs(),1);
 }finally{f.cleanup();}
});

test('失败、取消或越界符号链接不发布缓存，不留下安装临时目录',async()=>{
 for(const mode of ['fail','abort','escape']){
  const f=fixture();try{
   const root=f.project('a');const controller=new AbortController();
   const result=await reuseTemplateDependencies({...f.options,root,signal:controller.signal,install:async(stage:string)=>{
    if(mode==='fail')return {stdout:'',stderr:'compile failed',exitCode:1,timedOut:false,aborted:false};
    const result=await f.options.install(stage);
    if(mode==='abort')controller.abort();
    if(mode==='escape')fs.symlinkSync('/etc/passwd',path.join(stage,'node_modules/escape'));
    return result;
   }}).catch(()=>null);
   assert.equal(result,null);
   assert.equal(fs.existsSync(path.join(root,'node_modules')),false);
   const runtime=path.join(root,'.atoms/runtime');
   assert.deepEqual(fs.existsSync(runtime)?fs.readdirSync(runtime):[],[]);
   assert.deepEqual(fs.existsSync(f.options.cacheRoot)?fs.readdirSync(f.options.cacheRoot):[],[]);
  }finally{f.cleanup();}
 }
});

test('拒绝项目运行目录、模块目录或锁文件符号链接，外部内容保持不变',async()=>{
 const f=fixture();try{
  const a=f.project('a');await reuseTemplateDependencies({...f.options,root:a});
  for(const entry of ['.atoms','node_modules','pnpm-lock.yaml']){
   const root=f.project('b'+entry.replaceAll('/',''));
   const outside=path.join(f.base,'outside'+entry.replaceAll('/',''));fs.mkdirSync(outside);
   fs.writeFileSync(path.join(outside,'keep'),'safe');fs.symlinkSync(outside,path.join(root,entry));
   await assert.rejects(()=>reuseTemplateDependencies({...f.options,root}));
   assert.equal(fs.readFileSync(path.join(outside,'keep'),'utf8'),'safe');
  }
 }finally{f.cleanup();}
});

test('项目级安装配置不被模板复用绕过，额外依赖环境与其他架构不混用',async()=>{
 const f=fixture();try{
  const a=f.project('a');await reuseTemplateDependencies({...f.options,root:a});
  for(const file of ['.npmrc','.pnpmfile.cjs','pnpm-workspace.yaml']){
   const root=f.project('p'+file.replaceAll('.',''));
   fs.writeFileSync(path.join(root,file),'custom configuration');
   assert.equal(await reuseTemplateDependencies({...f.options,root}),null);
   assert.equal(fs.existsSync(path.join(root,'node_modules')),false);
  }
  const b=f.project('b');await reuseTemplateDependencies({...f.options,root:b,runtime:'node-linux-arm64'});
  assert.equal(f.installs(),2);
 }finally{f.cleanup();}
});

test('缓存缺少普通模块或内容被篡改时重建一次，不返回虚假安装成功',async()=>{
 const f=fixture();try{
  const a=f.project('a');await reuseTemplateDependencies({...f.options,root:a});
  const cache=path.join(f.options.cacheRoot,fs.readdirSync(f.options.cacheRoot)[0],'node_modules/next/index.js');
  fs.unlinkSync(cache);
  const b=f.project('b');assert.equal((await reuseTemplateDependencies({...f.options,root:b}))?.exitCode,0);
  assert.equal(f.installs(),2);
  assert.equal(createRequire(path.join(b,'package.json'))('next'),'baseline');
  fs.writeFileSync(cache,'module.exports = "modified";');
  const c=f.project('c');await reuseTemplateDependencies({...f.options,root:c});
  assert.equal(f.installs(),3);
  assert.equal(createRequire(path.join(c,'package.json'))('next'),'baseline');
 }finally{f.cleanup();}
});

test('执行权限损坏会触发重建；预热与恢复 staging 均在用户项目目录之外',async()=>{
 const f=fixture();try{
  const a=f.project('a');const stages:string[]=[];
  const createStage=async()=>{const root=await f.options.createStage();stages.push(root);assert.equal(root.startsWith(a+path.sep),false);return root;};
  await reuseTemplateDependencies({...f.options,createStage,root:a});
  assert.equal(stages.length,2,'预热和恢复都应使用独立 staging');
  const cache=path.join(f.options.cacheRoot,fs.readdirSync(f.options.cacheRoot)[0],'node_modules/.bin/next');
  fs.chmodSync(cache,0o700);
  await reuseTemplateDependencies({...f.options,root:f.project('b')});
  assert.equal(f.installs(),2);
  for(const root of stages)assert.equal(fs.existsSync(root),false);
 }finally{f.cleanup();}
});

test('等待共享预热的项目可以单独取消，不停止其他项目的预热',async()=>{
 const f=fixture();let release!:()=>void;let entered!:()=>void;
 const gate=new Promise<void>(resolve=>release=resolve),started=new Promise<void>(resolve=>entered=resolve);
 try{
  const owner=reuseTemplateDependencies({...f.options,root:f.project('owner'),install:async(stage:string)=>{entered();await gate;return f.options.install(stage);}});
  await started;
  const controller=new AbortController();
  const waiting=reuseTemplateDependencies({...f.options,root:f.project('waiter'),signal:controller.signal});
  setTimeout(()=>controller.abort(),20);
  await assert.rejects(waiting);
  release();assert.equal((await owner)?.exitCode,0);
  assert.equal(f.installs(),1);
 }finally{release();f.cleanup();}
});

test('缓存恢复取消不发布项目半成品，并保留完整缓存供下一次复用',async()=>{
 const f=fixture();try{
  await reuseTemplateDependencies({...f.options,root:f.project('a')});
  const controller=new AbortController(),root=f.project('b');
  await assert.rejects(()=>reuseTemplateDependencies({...f.options,root,signal:controller.signal,onProgress:message=>{if(message.includes('命中统一'))controller.abort();}}));
  assert.equal(fs.existsSync(path.join(root,'node_modules')),false);
  assert.equal(fs.existsSync(path.join(root,'pnpm-lock.yaml')),false);
  assert.equal((await reuseTemplateDependencies({...f.options,root:f.project('c')}))?.exitCode,0);
  assert.equal(f.installs(),1);
 }finally{f.cleanup();}
});

test('只读共享模式两个项目只准备一次缓存，零项目依赖复制，保留已有锁',async()=>{
 const f=fixture();try{const a=f.project('shared-a'),b=f.project('shared-b'),bound:string[]=[];fs.writeFileSync(path.join(a,'pnpm-lock.yaml'),'lockfileVersion: 9\n');
 const share=async(cache:string,key:string)=>{assert.ok(cache.endsWith('template-shared-v1-'+key));bound.push(cache);};
 for(const root of [a,b]){assert.equal((await reuseTemplateDependencies({...f.options,root,share}))?.exitCode,0);assert.equal(fs.existsSync(path.join(root,'node_modules')),false);}
 assert.equal(f.installs(),1);assert.equal(bound[0],bound[1]);assert.equal(fs.readFileSync(path.join(b,'pnpm-lock.yaml'),'utf8'),'lockfileVersion: 9\n');
 }finally{f.cleanup();}
});
test('共享绑定失败回收本次新增锁文件，已有依赖不移动或删除',async()=>{
 const f=fixture();try{const root=f.project('binding-fails');fs.mkdirSync(path.join(root,'node_modules'));fs.writeFileSync(path.join(root,'node_modules/keep'),'keep');await assert.rejects(reuseTemplateDependencies({...f.options,root,share:async()=>{throw Error('binding failed');}}),/binding failed/);assert.equal(fs.readFileSync(path.join(root,'node_modules/keep'),'utf8'),'keep');assert.equal(fs.existsSync(path.join(root,'pnpm-lock.yaml')),false);}finally{f.cleanup();}
});

test('升级共享模式可提升已有模板缓存，不重新下载或安装',async()=>{
 const f=fixture();try{await reuseTemplateDependencies({...f.options,root:f.project('old-mode')});assert.equal(f.installs(),1);let shared=false;await reuseTemplateDependencies({...f.options,root:f.project('new-mode'),share:async()=>{shared=true;}});assert.equal(shared,true);assert.equal(f.installs(),1,'已有可信缓存应直接提升为共享缓存');}finally{f.cleanup();}
});
