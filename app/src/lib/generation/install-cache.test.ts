import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
test('安装下载仓库可回收，已安装依赖、源码、数据库和HOME保持完整',async()=>{
 const subject=await import('./install-cache.ts').catch(()=>null);assert.ok(subject);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-store-budget-'));
 try{
  for(const relative of ['.atoms/runtime/pnpm-store/files/archive','node_modules/pkg/index.js','data/app.db','.atoms/runtime/home/keep','app/page.tsx']){const f=path.join(root,relative);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,'keep');}
  assert.equal(await subject.pruneInstalledDownloadCache(root),true);
  assert.equal(fs.existsSync(path.join(root,'.atoms/runtime/pnpm-store')),false);
  for(const relative of ['node_modules/pkg/index.js','data/app.db','.atoms/runtime/home/keep','app/page.tsx'])assert.equal(fs.readFileSync(path.join(root,relative),'utf8'),'keep');
  assert.equal(await subject.pruneInstalledDownloadCache(root),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('下载仓库或祖先符号链接不能把清理重定向到业务数据',async()=>{
 const subject=await import('./install-cache.ts').catch(()=>null);assert.ok(subject);
 for(const linkAt of ['.atoms/runtime/pnpm-store','.atoms/runtime']){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-store-link-'));
  try{const data=path.join(root,'data');fs.mkdirSync(data);fs.writeFileSync(path.join(data,'keep'),'safe');const link=path.join(root,linkAt);fs.mkdirSync(path.dirname(link),{recursive:true});fs.symlinkSync(data,link);await assert.rejects(subject.pruneInstalledDownloadCache(root),/符号链接|普通目录/);assert.equal(fs.readFileSync(path.join(data,'keep'),'utf8'),'safe');}
  finally{fs.rmSync(root,{recursive:true,force:true});}
 }
});
