import test from 'node:test';
import assert from 'node:assert/strict';

test('预览首页用 HTTP HTML 响应确认，不需要浏览器',async()=>{
 const subject=await import('./preview-home.ts').catch(()=>null);assert.ok(subject,'需要独立 HTTP 首页检查');
 const results=await subject.checkPreviewHome('http://127.0.0.1:4000/p/project',new AbortController().signal,async()=>new Response('<html>ready</html>',{headers:{'content-type':'text/html'}}));
 assert.equal(results[0].status,'passed');assert.equal(results[0].id,'PREVIEW-HOME');
});
test('首页错误、非HTML及外部跳转不能伪报可预览',async()=>{
 const subject=await import('./preview-home.ts').catch(()=>null);assert.ok(subject);
 for(const response of [new Response('error',{status:500}),new Response('{}',{headers:{'content-type':'application/json'}}),new Response(null,{status:302,headers:{location:'https://outside.invalid/'}})]){
  const results=await subject.checkPreviewHome('http://127.0.0.1:4000/p/project',new AbortController().signal,async()=>response);
  assert.equal(results[0].status,'failed');
 }
});
test('允许项目内登录跳转但拒绝无限重定向',async()=>{
 const subject=await import('./preview-home.ts').catch(()=>null);assert.ok(subject);
 let calls=0;
 const results=await subject.checkPreviewHome('http://127.0.0.1:4000/p/project',new AbortController().signal,async()=>++calls===1?new Response(null,{status:307,headers:{location:'/p/project/login'}}):new Response('<html>login</html>',{headers:{'content-type':'text/html'}}));
 assert.equal(results[0].status,'passed');assert.equal(calls,2);
 const loop=await subject.checkPreviewHome('http://127.0.0.1:4000/p/project',new AbortController().signal,async()=>new Response(null,{status:302,headers:{location:'/p/project/'}}));
 assert.equal(loop[0].status,'failed');
});
test('取消首页检查必须中断，不生成通过结果',async()=>{
 const subject=await import('./preview-home.ts').catch(()=>null);assert.ok(subject);
 const c=new AbortController();c.abort();
 await assert.rejects(subject.checkPreviewHome('http://127.0.0.1:4000/p/project',c.signal,async()=>{throw Error('不能请求');}),/abort/i);
});

test('首页响应头成功但正文断流、空白或超大时仍判失败',async()=>{
 const subject=await import('./preview-home.ts');
 for(const body of [new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('<html>partial'));c.error(Error('render disconnected'));}}),'   ','x'.repeat(2*1024*1024+1)]){
  const result=await subject.checkPreviewHome('http://127.0.0.1:4000/p/project',new AbortController().signal,async()=>new Response(body,{headers:{'content-type':'text/html'}}));
  assert.equal(result[0].status,'failed');
 }
});
test('正文一直不结束时在期限内停止检查，即使请求实现忽略中止信号',async()=>{
 const subject=await import('./preview-home.ts');
 const result=await subject.checkPreviewHome('http://127.0.0.1:4000/p/project',new AbortController().signal,async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('<html>partial'));}}),{headers:{'content-type':'text/html'}}),20);
 assert.equal(result[0].status,'failed');assert.match(result[0].error??'',/超时/);
});

test('首页响应头一直不返回且忽略取消时也有硬截止时间',async()=>{
 const subject=await import('./preview-home.ts');
 let guard:ReturnType<typeof setTimeout>|undefined;
 try{
  const result=await Promise.race([subject.checkPreviewHome('http://127.0.0.1:4000/p/project',new AbortController().signal,async()=>new Promise<Response>(()=>{}),20),new Promise<'hung'>(resolve=>{guard=setTimeout(()=>resolve('hung'),150);})]);
  assert.notEqual(result,'hung','响应头等待必须受硬截止时间保护');
  if(result!=='hung'){assert.equal(result[0].status,'failed');assert.match(result[0].error??'',/超时/);}
 }finally{clearTimeout(guard);}
});
