import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ReleaseStore } from './store.ts';

test('release store is idempotent, permits one task and never switches on failure',()=>{
 const db=new Database(':memory:');
 const store=new ReleaseStore(db);
 new ReleaseStore(db);
 const a=store.create('project_a','rel_a','/tmp/a');
 assert.equal(a.status,'queued');
 assert.equal(store.create('project_a','rel_duplicate','/tmp/b').id,'rel_a');
 store.update('rel_a',{status:'published',sourceHash:'abc'});
 store.activate('project_a','rel_a');
 store.create('project_a','rel_b','/tmp/b');
 store.update('rel_b',{status:'failed',error:'build failed'});
 assert.equal(store.active('project_a')?.id,'rel_a');
 assert.throws(()=>store.activate('project_other','rel_a'),/项目/);
 assert.throws(()=>store.activate('project_a','rel_b'),/验证/);
 assert.equal(store.events('rel_a').length,0);
 store.log('rel_a','ready');
 assert.equal(store.events('rel_a')[0].message,'ready');
 db.close();
});
test('restart marks unfinished releases interrupted and retains deployment',()=>{
 const db=new Database(':memory:'); const store=new ReleaseStore(db);
 store.create('p','good','/tmp/good'); store.update('good',{status:'published'});store.activate('p','good');
 store.create('p','pending','/tmp/pending');store.update('pending',{status:'building'});
 store.interrupt();
 assert.equal(store.get('pending')?.status,'interrupted');assert.equal(store.active('p')?.id,'good');
 db.close();
});
