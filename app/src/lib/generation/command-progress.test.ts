import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import * as nodeModule from 'node:module';
const {stripTypeScriptTypes}=nodeModule as unknown as {stripTypeScriptTypes:(s:string)=>string};
test('命令结束前实时交付输出，长日志保留最后失败原因',async()=>{
 let child:EventEmitter&{stdout:EventEmitter;stderr:EventEmitter};const observed:string[]=[];
 const js=stripTypeScriptTypes(fs.readFileSync(new URL('../workspace/command.ts',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,'');
 const run=vm.runInNewContext(`${js}\nrunCommand`,{setTimeout,clearTimeout,config:{maxToolOutputChars:64,commandTimeoutMs:1000},resolveInsideProject:()=>'/tmp/fixture',ensureWorkspaceRuntime:async()=>{},createWorkspaceExecution:()=>({command:'fixture',args:[],env:{}}),spawn:()=>{child=Object.assign(new EventEmitter(),{stdout:new EventEmitter(),stderr:new EventEmitter()});return child;}});
 const pending=run('p','pnpm install',{onOutput:(chunk:string)=>observed.push(chunk)});
 await new Promise(r=>setImmediate(r));
 child!.stdout.emit('data',Buffer.from('Packages downloading\n'));
 assert.ok(observed.join('').includes('Packages downloading'),'进程未结束也必须收到进度');
 child!.stderr.emit('data',Buffer.from('x'.repeat(400)));child!.stderr.emit('data',Buffer.from('\nERR_NETWORK_TIMEOUT final reason'));
 child!.emit('close',1);const result=await pending;
 assert.match(result.stderr,/ERR_NETWORK_TIMEOUT final reason/);assert.ok(result.stderr.length<100);
});

for(const cancelled of [false,true])test(cancelled?'取消预览后即使子进程不发送close也必须返回':'超时后即使子进程不发送close也必须返回，不能永久卡在预览清理',async()=>{
 const js=stripTypeScriptTypes(fs.readFileSync(new URL('../workspace/command.ts',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,'');
 const signals:string[]=[];const controller=new AbortController();
 const child=Object.assign(new EventEmitter(),{stdout:Object.assign(new EventEmitter(),{destroy(){}}),stderr:Object.assign(new EventEmitter(),{destroy(){}}),kill:(signal:string)=>{signals.push(signal);return true;},unref(){}});
 const run=vm.runInNewContext(`${js}\nrunCommand`,{setTimeout:(fn:()=>void,ms:number)=>setTimeout(fn,ms>=1000?10:ms),clearTimeout,config:{maxToolOutputChars:1000,commandTimeoutMs:cancelled?999:20},resolveInsideProject:()=>'/tmp/fixture',ensureWorkspaceRuntime:async()=>{},createWorkspaceExecution:()=>({command:'fixture',args:[],env:{}}),spawn:()=>child});
 let guard:ReturnType<typeof setTimeout>|undefined;
 try{
  const running=run('p','dev',{signal:controller.signal});
  if(cancelled){await new Promise(resolve=>setImmediate(resolve));controller.abort();}
  const result=await Promise.race([running,new Promise<'hung'>(resolve=>{guard=setTimeout(()=>resolve('hung'),200);})]);
  assert.notEqual(result,'hung','SIGKILL 后没有close事件仍须有有限等待');
  assert.equal(result.timedOut,!cancelled);assert.equal(result.aborted,cancelled);assert.ok(signals.includes('SIGKILL'));assert.equal(result.terminationUnconfirmed,true);
 }finally{clearTimeout(guard);}
});
