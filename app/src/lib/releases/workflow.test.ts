import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {ReleaseStore} from './store.ts';
import {runReleaseWorkflow} from './workflow.ts';
for(const stage of ['install','build','start','check'] as const) {
 test(`${stage} failure retains healthy version and cleans candidate`,async()=>{
  const db=new Database(':memory:');const store=new ReleaseStore(db);
  store.create('p','old','/tmp/old');store.update('old',{status:'published'});store.activate('p','old');
  const candidate=store.create('p','new','/tmp/new');let stopped=false;
  const hooks={snapshot:async()=> 'hash',install:async()=>{},build:async()=>{},start:async()=>{},check:async()=>{},stop:()=>{stopped=true;}};
  hooks[stage]=async()=>{throw new Error('injected failure');};
  await runReleaseWorkflow(store,candidate,hooks);
  assert.equal(store.active('p')?.id,'old');assert.equal(store.get('new')?.status,'failed');assert.ok(stopped);db.close();
 });
}
test('candidate switches only after health succeeds',async()=>{
 const db=new Database(':memory:');const store=new ReleaseStore(db);const r=store.create('p','new','/tmp/new');
 await runReleaseWorkflow(store,r,{snapshot:async()=> 'hash',install:async()=>{},build:async()=>{},start:async()=>{},check:async()=>{assert.equal(store.active('p'),undefined);},stop:()=>{}});
 assert.equal(store.active('p')?.id,'new');assert.equal(store.get('new')?.sourceHash,'hash');db.close();
});
