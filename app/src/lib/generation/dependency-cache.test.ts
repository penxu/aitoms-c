import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { copyDependencyTree, isReusableDependencyTree } from './dependency-cache.ts';

test('拒绝 npm 命令符号链接和被 shell 覆写的编译器', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atoms-deps-'));
  try {
    fs.mkdirSync(path.join(root, '.bin'), {recursive:true});
    fs.mkdirSync(path.join(root, 'typescript/bin'), {recursive:true});
    fs.mkdirSync(path.join(root, 'next/dist/bin'), {recursive:true});
    fs.writeFileSync(path.join(root, 'typescript/bin/tsc'), '#!/usr/bin/env node\nrequire("../lib/tsc.js")');
    fs.writeFileSync(path.join(root, 'next/dist/bin/next'), '#!/usr/bin/env node\nconsole.log("next")');
    fs.symlinkSync('../typescript/bin/tsc', path.join(root, '.bin/tsc'));
    assert.equal(isReusableDependencyTree(root), false);
    fs.unlinkSync(path.join(root, '.bin/tsc'));
    fs.writeFileSync(path.join(root, '.bin/tsc'), '#!/bin/sh\nexec node tsc');
    fs.writeFileSync(path.join(root, '.bin/next'), '#!/bin/sh\nexec node next');
    assert.equal(isReusableDependencyTree(root), true);
    fs.writeFileSync(path.join(root, 'typescript/bin/tsc'), '#!/bin/sh\nbasedir=$(dirname "$0")');
    assert.equal(isReusableDependencyTree(root), false);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('项目修改不能污染缓存，复制保留内部相对符号链接', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-deps-copy-'));
  try {
    const cache=path.join(root,'cache');const project=path.join(root,'project');
    fs.mkdirSync(cache);fs.writeFileSync(path.join(cache,'compiler.js'),'original');
    fs.symlinkSync('compiler.js',path.join(cache,'compiler-link'));
    copyDependencyTree(cache,project);
    assert.equal(fs.lstatSync(path.join(project,'compiler-link')).isSymbolicLink(),true);
    fs.writeFileSync(path.join(project,'compiler.js'),'changed');
    assert.equal(fs.readFileSync(path.join(cache,'compiler.js'),'utf8'),'original');
    assert.equal(fs.readlinkSync(path.join(project,'compiler-link')),'compiler.js');
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('缓存标识覆盖实际清单、锁文件、Node 和平台架构，缺锁文件不复用', async () => {
  const { dependencyFingerprint: fingerprint } = await import('./dependency-cache.ts');
  const dependencyFingerprint=(root:string,runtime={node:process.version,platform:process.platform as string,arch:process.arch as string})=>fingerprint(root,runtime);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-deps-key-'));
  try {
    fs.writeFileSync(path.join(root,'package.json'),'{"dependencies":{"next":"16.4.6"}}');
    assert.equal(dependencyFingerprint(root),null);
    fs.writeFileSync(path.join(root,'pnpm-lock.yaml'),'lockfileVersion: 9');
    const first=dependencyFingerprint(root); assert.ok(first);
    fs.appendFileSync(path.join(root,'package.json'),' '); assert.notEqual(dependencyFingerprint(root),first);
    const second=dependencyFingerprint(root); fs.appendFileSync(path.join(root,'pnpm-lock.yaml'),'\nimporters: {}');
    assert.notEqual(dependencyFingerprint(root),second);
    assert.notEqual(dependencyFingerprint(root,{node:'v100',platform:'linux',arch:'x64'}),dependencyFingerprint(root));
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('缓存拒绝指向树外的符号链接，发布前失败不留下可读半成品', async () => {
  const {publishDependencyCache}=await import('./dependency-cache.ts');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-deps-atomic-'));
  try {
    const source=path.join(root,'source'),target=path.join(root,'cache');
    fs.mkdirSync(source);fs.symlinkSync('../secret',path.join(source,'escape'));
    assert.throws(()=>publishDependencyCache(source,target,'key'));
    assert.equal(fs.existsSync(target),false);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('缓存仅恢复匹配清单，发布后复制独立且完整', async () => {
  const {publishDependencyCache,restoreDependencyCache}=await import('./dependency-cache.ts');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-deps-publish-'));
  try {
    const source=path.join(root,'source'),cache=path.join(root,'cache'),target=path.join(root,'target');
    fs.mkdirSync(path.join(source,'.bin'),{recursive:true});
    for(const [bin,entry] of [['tsc','typescript/bin/tsc'],['next','next/dist/bin/next']]) {
      fs.mkdirSync(path.dirname(path.join(source,entry)),{recursive:true});
      fs.writeFileSync(path.join(source,entry),'#!/usr/bin/env node\n');
      fs.writeFileSync(path.join(source,'.bin',bin),'#!/bin/sh\n');
    }
    publishDependencyCache(source,cache,'one');
    assert.equal(restoreDependencyCache(cache,target,'two'),false);
    assert.equal(fs.existsSync(target),false);
    assert.equal(restoreDependencyCache(cache,target,'one'),true);
    fs.writeFileSync(path.join(target,'next/dist/bin/next'),'changed');
    assert.equal(fs.readFileSync(path.join(cache,'node_modules/next/dist/bin/next'),'utf8'),'#!/usr/bin/env node\n');
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});


test('缓存不能混用宿主机与容器的 Node、平台和镜像', async () => {
  const {dependencyFingerprint}=await import('./dependency-cache.ts');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-backend-key-'));
  try {
    fs.writeFileSync(path.join(root,'package.json'),'{}');fs.writeFileSync(path.join(root,'pnpm-lock.yaml'),'lockfileVersion: 9');
    const native={node:'v22.23.5',platform:'darwin',arch:'arm64',backend:'native',image:''};
    const docker={...native,platform:'linux',backend:'docker',image:'node:22@sha256:one'};
    assert.notEqual(dependencyFingerprint(root,native),dependencyFingerprint(root,docker));
    assert.notEqual(dependencyFingerprint(root,docker),dependencyFingerprint(root,{...docker,image:'node:22@sha256:two'}));
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('候选旧依赖运行环境迁移仅清理候选，保留原预览依赖', async () => {
  const {prepareDependencyRuntime}=await import('./dependency-cache.ts');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-runtime-migrate-'));
  try {
    const original=path.join(root,'original'),candidate=path.join(root,'candidate');
    fs.mkdirSync(path.join(original,'node_modules'),{recursive:true});
    fs.writeFileSync(path.join(original,'node_modules/compiler'),'mac-native');
    fs.writeFileSync(path.join(original,'node_modules/.atoms-runtime.json'),JSON.stringify({runtime:'mac'}));
    fs.cpSync(original,candidate,{recursive:true});
    assert.equal(prepareDependencyRuntime(candidate,'linux-docker'),false);
    assert.equal(fs.existsSync(path.join(candidate,'node_modules')),false);
    assert.equal(fs.readFileSync(path.join(original,'node_modules/compiler'),'utf8'),'mac-native');
    assert.equal(prepareDependencyRuntime(original,'mac'),true);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
