import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createProjectArchive} from './archive.ts';

test('deployment archive has portable instructions, no secrets and truthful version metadata',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-package-'));
 try {
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({scripts:{build:'next build',start:'next start'},dependencies:{next:'16.4.6'}}));
  fs.writeFileSync(path.join(root,'package-lock.json'),'{}');fs.writeFileSync(path.join(root,'.env.example'),'SECRET=real-secret');
  const buffer=await createProjectArchive(root,{projectId:'p_test',kind:'deploy',releaseId:'rel_test',verified:true});
  const zip=path.join(root,'app.zip');fs.writeFileSync(zip,buffer);
  execFileSync('unzip',['-t',zip]);
  const manifest=JSON.parse(execFileSync('unzip',['-p',zip,'atoms-manifest.json']).toString());
  assert.equal(manifest.releaseId,'rel_test');assert.equal(manifest.verification.productionBuild,true);
  assert.equal(manifest.verification.standaloneBuild,false);
  const env=execFileSync('unzip',['-p',zip,'.env.example']).toString();assert.ok(!env.includes('real-secret'));
  const docker=execFileSync('unzip',['-p',zip,'Dockerfile']).toString();assert.ok(docker.includes('npm ci'));assert.ok(docker.includes('npm run build'));
  const compose=execFileSync('unzip',['-p',zip,'compose.yaml']).toString();assert.ok(compose.includes('app-data:/app/data'));
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('draft never inherits release verification',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-draft-'));
 try {
  fs.writeFileSync(path.join(root,'package.json'),'{}');
  await assert.rejects(()=>createProjectArchive(root,{projectId:'p',kind:'deploy',verified:true}),/版本/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('deployment pins a pnpm version compatible with the exported lockfile',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-pnpm-lock-'));
 try {
  fs.writeFileSync(path.join(root,'package.json'),'{}');fs.writeFileSync(path.join(root,'pnpm-lock.yaml'),'lockfileVersion: 5.4\n');
  const zip=path.join(root,'out.zip');fs.writeFileSync(zip,await createProjectArchive(root,{projectId:'p',kind:'deploy',releaseId:'rel_a',verified:true}));
  const docker=execFileSync('unzip',['-p',zip,'Dockerfile']).toString();assert.ok(docker.includes('pnpm@7.33.7'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
