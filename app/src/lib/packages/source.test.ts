import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectSource, snapshotSource, sourceHash } from './source.ts';

test('source snapshot excludes secrets, runtime data, links and unknown files', () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-source-'));
 try {
  for(const name of ['app/page.tsx','app/api/health/route.ts','middleware.ts','proxy.ts','instrumentation.ts','package.json','pnpm-lock.yaml','public/logo.svg','.env.local','private.key','data/app.db-wal','.git/config','app/secret.pem','public/database.sqlite','public/customer.csv','public/env.json','.atoms/SPEC.md']) {
   fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});
   fs.writeFileSync(path.join(root,name),name==='package.json'?'{}':'hello');
  }
  fs.symlinkSync('/etc/passwd',path.join(root,'app','outside.ts'));
  const files=collectSource(root);
  assert.deepEqual(files.map(f=>f.path),['.atoms/SPEC.md','app/api/health/route.ts','app/page.tsx','instrumentation.ts','middleware.ts','package.json','pnpm-lock.yaml','proxy.ts','public/logo.svg']);
  const dest=path.join(root,'snapshot');
  const a=snapshotSource(root,dest);
  assert.equal(fs.readFileSync(path.join(dest,'app/page.tsx'),'utf8'),'hello');
  fs.writeFileSync(path.join(root,'app/page.tsx'),'changed');
  const b=snapshotSource(root,path.join(root,'snapshot2'));
  assert.notEqual(a.sourceHash,b.sourceHash);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('source rejects nonexistent project and empty snapshot',()=>{
 assert.throws(()=>collectSource('/tmp/atoms-source-does-not-exist'));
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-empty-'));
 try {assert.throws(()=>snapshotSource(root,path.join(root,'copy')),/package.json/);} finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('build-generated declarations cannot change the immutable release export hash',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-immutable-'));
 try {
  fs.writeFileSync(path.join(root,'package.json'),'{}');
  fs.writeFileSync(path.join(root,'next-env.d.ts'),'import "./.next/dev/types/routes.d.ts";');
  const release=path.join(root,'release');
  const snapshot=snapshotSource(root,path.join(release,'.source'));
  fs.writeFileSync(path.join(release,'next-env.d.ts'),'import "./.next/types/routes.d.ts";');
  assert.equal(fs.readFileSync(path.join(release,'.source','next-env.d.ts'),'utf8'),'import "./.next/dev/types/routes.d.ts";');
  assert.equal(snapshot.sourceHash,sourceHash(collectSource(path.join(release,'.source'))));
 }finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('验收证据变化不改变源码版本哈希，实际代码变化仍改变',()=>{
 const code={path:'app/page.tsx',content:Buffer.from('code')};
 const first=sourceHash([code,{path:'.atoms/ACCEPTANCE.json',content:Buffer.from('first')},{path:'.atoms/VERIFICATION.json',content:Buffer.from('report')}]);
 assert.equal(first,sourceHash([code]));
 assert.notEqual(first,sourceHash([{...code,content:Buffer.from('changed')} ]));
});

test('静态旧任务可创建预览候选，正式发布仍要求package.json',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-static-snapshot-'));const target=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-static-dest-'));fs.rmSync(target,{recursive:true});
 try{fs.writeFileSync(path.join(root,'index.html'),'<h1>static</h1>');fs.writeFileSync(path.join(root,'style.css'),'h1{color:navy}');assert.throws(()=>snapshotSource(root,target),/package.json/);snapshotSource(root,target,{allowStatic:true});assert.equal(fs.readFileSync(path.join(target,'index.html'),'utf8'),'<h1>static</h1>');assert.equal(fs.existsSync(path.join(target,'style.css')),true);}finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(target,{recursive:true,force:true});}
});
