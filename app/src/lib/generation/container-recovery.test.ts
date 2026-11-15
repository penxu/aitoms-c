import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {createWorkspaceExecution,ensureWorkspaceRuntime,isWorkspaceExecutionRunning} from '../workspace/execution.ts';

test('真实Docker容器在CLI死亡后可恢复，按归属停止后不再报告存活',async(t)=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-container-recovery-'));
 let execution:ReturnType<typeof createWorkspaceExecution>|undefined;
 let child:ReturnType<typeof spawn>|undefined;
 try {
  let runtime;try{runtime=await ensureWorkspaceRuntime(root);}catch(error){if(/Docker 隔离不可用|安全隔离/.test(String(error))){t.skip(String(error));return;}throw error;}
  if(runtime.backend!=='docker'){t.skip('本测试验证Docker独立生命周期');return;}
  const socket=net.createServer();await new Promise<void>(resolve=>socket.listen(0,'127.0.0.1',resolve));
  const port=(socket.address() as net.AddressInfo).port;await new Promise<void>(resolve=>socket.close(()=>resolve()));
  const code="require('http').createServer((_,r)=>r.end('ok')).listen(Number(process.env.PORT),'0.0.0.0')";
  fs.writeFileSync(path.join(root,'server.cjs'),code);
  execution=createWorkspaceExecution(root,'node server.cjs',{PORT:String(port)});
  assert.ok(execution.cleanupId);
  child=spawn(execution.command,execution.args,{cwd:root,env:execution.env,stdio:'pipe'});
  let output='';child.stderr?.on('data',chunk=>{output+=chunk.toString();});
  let healthy=false;
  for(let i=0;i<100;i++){try{const response=await fetch(`http://127.0.0.1:${port}`,{signal:AbortSignal.timeout(500)});if(await response.text()==='ok'){healthy=true;break;}}catch{}await delay(100);}
  assert.equal(healthy,true,output);
  child.kill('SIGKILL');await delay(100);
  assert.equal(isWorkspaceExecutionRunning(root,execution.cleanupId!,port),true);
  execution.cleanup?.();
  assert.equal(isWorkspaceExecutionRunning(root,execution.cleanupId!,port),false);
 }finally{execution?.cleanup?.();child?.kill('SIGKILL');fs.rmSync(root,{recursive:true,force:true});}
});
