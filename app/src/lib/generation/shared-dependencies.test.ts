import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {createHash} from 'node:crypto';
import {dependencyTreeDigest} from './dependency-copy.ts';
import {SharedDependencyRegistry} from '../workspace/shared-dependencies.ts';
const runtime={node:'v22',platform:'linux',arch:'x64',backend:'docker',image:'fixture'};
async function fixture(){
 const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'atoms-shared-'))),workspaces=path.join(base,'projects'),cache=path.join(base,'cache'),key='a'.repeat(64);
 fs.mkdirSync(workspaces);fs.mkdirSync(cache);const source=path.join(cache,'template-shared-v1-'+key);fs.mkdirSync(path.join(source,'node_modules/next'),{recursive:true});
 fs.writeFileSync(path.join(source,'node_modules/next/index.js'),'module.exports=42');fs.writeFileSync(path.join(source,'manifest.json'),JSON.stringify({key,lockHash:createHash('sha256').update('lock').digest('hex'),treeHash:await dependencyTreeDigest(path.join(source,'node_modules'))}));fs.writeFileSync(path.join(source,'pnpm-lock.yaml'),'lock');
 const db=new Database(':memory:'),registry=new SharedDependencyRegistry(db,cache,workspaces);
 const project=(name:string)=>{const root=path.join(workspaces,name);fs.mkdirSync(root);fs.writeFileSync(path.join(root,'package.json'),'{}');fs.writeFileSync(path.join(root,'pnpm-lock.yaml'),'lock');return root;};
 return{base,cache,key,source,db,registry,project,cleanup(){db.close();fs.rmSync(base,{recursive:true,force:true});}};
}
test('两个项目可信绑定同一只读源，项目目录不复制依赖',async()=>{
 const f=await fixture();try{const a=f.project('a'),b=f.project('b');f.registry.bind(a,f.key,runtime);f.registry.bind(b,f.key,runtime);assert.equal(f.registry.mount(a,runtime)?.source,f.registry.mount(b,runtime)?.source);assert.deepEqual(fs.readdirSync(path.join(a,'node_modules')),[]);assert.equal(f.registry.inUse(f.key),true);assert.equal(f.registry.mount(a,{...runtime,arch:'arm64'}),null);}finally{f.cleanup();}
});
test('项目伪造json不能授权外部挂载；变更依赖立即失效，独立化解除绑定',async()=>{
 const f=await fixture();try{const a=f.project('a');fs.mkdirSync(path.join(a,'.atoms'));fs.writeFileSync(path.join(a,'.atoms/shared-dependencies.json'),JSON.stringify({cache:f.source,key:f.key}));assert.equal(f.registry.mount(a,runtime),null);f.registry.bind(a,f.key,runtime);fs.writeFileSync(path.join(a,'package.json'),'{"dependencies":{"other":"1"}}');assert.equal(f.registry.mount(a,runtime),null);f.registry.detach(a);assert.equal(f.registry.inUse(f.key),false);}finally{f.cleanup();}
});
test('拒绝缓存符号链接、manifest篡改与工作区外绑定',async()=>{
 const f=await fixture();try{const a=f.project('a');assert.throws(()=>f.registry.bind(a,'../bad',runtime));assert.throws(()=>f.registry.bind(f.base,f.key,runtime));f.registry.bind(a,f.key,runtime);fs.writeFileSync(path.join(f.source,'manifest.json'),'{"changed":true}');assert.throws(()=>f.registry.mount(a,runtime),/缓存/);}finally{f.cleanup();}
});
test('成功切换后的清理只删除项目依赖内容，不触及共享源或数据',async()=>{
 const f=await fixture();try{const a=f.project('a');fs.mkdirSync(path.join(a,'node_modules/old'),{recursive:true});fs.writeFileSync(path.join(a,'node_modules/old/file'),'old');fs.mkdirSync(path.join(a,'data'));fs.writeFileSync(path.join(a,'data/app.db'),'keep');f.registry.bind(a,f.key,runtime);await f.registry.reclaim(a);assert.deepEqual(fs.readdirSync(path.join(a,'node_modules')),[]);assert.equal(fs.readFileSync(path.join(f.source,'node_modules/next/index.js'),'utf8'),'module.exports=42');assert.equal(fs.readFileSync(path.join(a,'data/app.db'),'utf8'),'keep');}finally{f.cleanup();}
});

test('本进程首次认证检查完整树，损坏或缺失会解除绑定并允许独立安装',async()=>{
 for(const broken of ['content','missing','metadata']){
  const f=await fixture();try{const a=f.project('integrity');f.registry.bind(a,f.key,runtime);
   if(broken==='content')fs.writeFileSync(path.join(f.source,'node_modules/next/index.js'),'tampered');
   else if(broken==='missing')fs.rmSync(f.source,{recursive:true,force:true});
   else fs.writeFileSync(path.join(f.source,'manifest.json'),'{}');
   assert.equal(await f.registry.verify(a,runtime),false);assert.equal(f.registry.mount(a,runtime),null);assert.equal(f.registry.inUse(f.key),false);
  }finally{f.cleanup();}
 }
});
test('认证后可只读挂载，其他后端探测保留已有 Docker 绑定',async()=>{
 const f=await fixture();try{const a=f.project('valid');f.registry.bind(a,f.key,runtime);assert.equal(f.registry.mount(a,runtime,true),null);assert.equal(await f.registry.verify(a,runtime),true);assert.ok(f.registry.mount(a,runtime,true));assert.equal(await f.registry.verify(a,{...runtime,node:'v24',backend:'native',image:undefined}),true);assert.ok(f.registry.mount(a,runtime,true),'native 探测不得删除已认证的 Docker 绑定');}finally{f.cleanup();}
});
