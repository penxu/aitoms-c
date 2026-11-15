import test from 'node:test';
import assert from 'node:assert/strict';
import { withDeadline } from './deadline.ts';
import { MutationStore } from '../workspace/mutation-store.ts';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const Database=require('better-sqlite3');
test('同项目不同调用不能同时修改，不同项目可以，过期且失去所有者的锁可恢复',()=>{
 const db=new Database(':memory:');const store=new MutationStore(db,()=>false);
 try {const a=store.acquire('p','build',1,100);assert.ok(a);assert.equal(store.acquire('p','chat',2,100),null);assert.ok(store.acquire('q','chat',2,100));store.release('p','wrong');assert.equal(store.acquire('p','chat',3,100),null);assert.ok(store.acquire('p','chat',102,100));store.release('p',a!.token);assert.equal(store.acquire('p','chat',103,100),null);}finally{db.close()}
});
test('超时能结束不响应取消的模型 Promise',async()=>{
 await assert.rejects(withDeadline(new AbortController().signal,15,()=>new Promise(()=>{})),/超时/);
});
