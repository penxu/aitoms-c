import test from 'node:test';import assert from 'node:assert/strict';import{createRequire}from'node:module';
import{FileCheckpoints,checkpointHash}from'./file-checkpoints.ts';
const Database=createRequire(import.meta.url)('better-sqlite3');
test('续跑重用完成文件，依赖变化失效，人工编辑不能被覆盖',()=>{const db=new Database(':memory:');try{const store=new FileCheckpoints(db);store.save('p','plan','app/page.tsx','input','code','run');assert.equal(store.inspect('p','plan','app/page.tsx','input','code'),'reuse');assert.equal(store.inspect('p','plan','app/page.tsx','changed','code'),'generate');assert.equal(store.inspect('p','plan','app/page.tsx','input','manual'),'conflict');assert.notEqual(checkpointHash('a'),checkpointHash('b'))}finally{db.close()}});

test('跨计划仍保护人工修改和删除，未修改旧生成文件可按新计划生成',()=>{
 const db=new Database(':memory:');try{
  const store=new FileCheckpoints(db);
  store.save('p','old','app/page.tsx','input','generated','run1');
  assert.equal(store.inspect('p','new','app/page.tsx','new-input','manual'),'conflict');
  assert.equal(store.inspect('p','new','app/page.tsx','new-input',null),'conflict');
  assert.equal(store.inspect('p','new','app/page.tsx','new-input','generated'),'generate');
  store.save('p','new','app/page.tsx','new-input','updated','run2');
  assert.equal(store.inspect('p','old','app/page.tsx','input','manual'),'conflict');
  assert.equal(store.inspect('p','old','app/page.tsx','input','updated'),'generate');
 }finally{db.close()}
});

test('自动修复更新生成版本基线，续跑可复用且仍保护后续人工修改',()=>{
 const db=new Database(':memory:');try{
  const store=new FileCheckpoints(db);store.save('p','plan','a.ts','input','broken','build');
  store.recordRepair('p','plan','a.ts','fixed','verify');
  assert.equal(store.inspect('p','plan','a.ts','input','fixed'),'reuse');
  assert.equal(store.inspect('p','next','a.ts','new','manual'),'conflict');
 }finally{db.close()}
});
