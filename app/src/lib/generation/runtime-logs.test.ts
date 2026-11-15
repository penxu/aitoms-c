import test from 'node:test';import assert from 'node:assert/strict';
test('预览日志有容量上限，旧进程迟到输出不能覆盖新进程',async()=>{
 const subject=await import('../workspace/runtime-logs.ts').catch(()=>null);assert.ok(subject);
 const logs=new subject.RuntimeLogs(2,20);
 const old=logs.begin('p');logs.append('p',old,'old');const current=logs.begin('p');logs.append('p',old,'late old');assert.equal(logs.read('p'),'');
 logs.append('p',current,'x'.repeat(40)+'latest');assert.equal(logs.read('p').length,20);assert.match(logs.read('p'),/latest$/);
 logs.begin('q');logs.begin('r');assert.equal(logs.read('p'),'');
});
