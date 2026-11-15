import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { installDependenciesCommand } from '../workspace/toolchain.ts';
import {streamInstall} from '../generation/install-progress.ts';
import { createRequire } from 'node:module';
import * as nodeModule from 'node:module';
const { stripTypeScriptTypes } = nodeModule as unknown as { stripTypeScriptTypes: (source: string) => string };
const require = createRequire(import.meta.url);
const {z} = require('zod');
const source=fs.readFileSync(new URL('./tools.ts',import.meta.url),'utf8');
const js=stripTypeScriptTypes(source).replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,'');
for(const name of ['run_command','install_deps']) test(`${name} 必须传递停止信号给子进程`,async()=>{
 const controller=new AbortController();controller.abort();let signal:AbortSignal|undefined;
 const factory=vm.runInNewContext(`${js}\ncreateHarnessTools`,{z,streamInstall,AbortSignal,installDependenciesCommand,ensureProjectDependencies:async(_id:string,abortSignal?:AbortSignal)=>{signal=abortSignal;return{exitCode:null,aborted:Boolean(signal?.aborted)}},tool:(v:unknown)=>v,runCommand:async(_id:string,_cmd:string,options:{signal?:AbortSignal})=>{signal=options.signal;return{exitCode:null,aborted:Boolean(signal?.aborted)}}});
 const tools=factory('diagnostic');
 if(name==='install_deps'){
   const stream=tools[name].execute({},{abortSignal:controller.signal});
   await stream.next();
   await assert.rejects(stream.next(),/aborted/i);
   assert.equal(signal,undefined,'已取消的安装不能再启动子进程');
 }else{
   const result=await tools[name].execute({command:'test'},{abortSignal:controller.signal});
   assert.equal(signal,controller.signal);assert.equal(result.aborted,true);
 }
});

for(const name of ['init_project','write_file','edit_file','delete_file','stop_service'])test(`${name} 在对话超时释放锁后禁止继续写入`,async()=>{
 const controller=new AbortController();controller.abort();
 const factory=vm.runInNewContext(`${js}\ncreateHarnessTools`,{z,tool:(v:unknown)=>v});
 const tools=factory('fixture',controller.signal);
 await assert.rejects(tools[name].execute({template:'static',path:'page.tsx',content:'late',oldString:'a',newString:'b'},{abortSignal:undefined}));
});
