import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

test('开发服务端口监听后立即返回，不发送HTTP请求触发页面编译',async()=>{
 const subject=await import('../workspace/runtime-start.ts');
 assert.equal(typeof subject.waitForPreviewSocket,'function');
 let requests=0;const server=http.createServer(()=>{requests++;});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const address=server.address();assert.ok(address&&typeof address!=='string');
  await subject.waitForPreviewSocket(address.port,()=>null,new AbortController().signal,1000);
  assert.equal(requests,0);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('监听准备仍会报告真实进程错误和响应取消',async()=>{
 const subject=await import('../workspace/runtime-start.ts');
 assert.equal(typeof subject.waitForPreviewSocket,'function');
 await assert.rejects(subject.waitForPreviewSocket(9,()=> 'missing module',new AbortController().signal,100),/missing module/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(subject.waitForPreviewSocket(9,()=>null,controller.signal,100),/abort/i);
 await assert.rejects(subject.waitForPreviewSocket(9,()=>null,new AbortController().signal,20),/监听.*超时/);
});
