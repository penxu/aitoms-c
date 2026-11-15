import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForPreviewStart } from '../workspace/runtime-start.ts';
test('启动进程已退出时返回真实错误，不能报告运行成功',async()=>{
 await assert.rejects(waitForPreviewStart('http://unused',()=> 'SyntaxError: missing ) after argument list',100),/SyntaxError/);
});
test('只有 HTTP 就绪后才报告启动完成',async()=>{
 const original=globalThis.fetch;let called=false;
 globalThis.fetch=async()=>{called=true;return new Response('ready')};
 try {await waitForPreviewStart('http://unused',()=>null,100);assert.equal(called,true)}finally{globalThis.fetch=original}
});
