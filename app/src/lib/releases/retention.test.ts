import test from 'node:test';
import assert from 'node:assert/strict';
import {retentionCandidates} from './retention.ts';
import type {Release} from './types.ts';
test('retention keeps latest five, active and in-flight artifacts',()=>{
 const items=Array.from({length:8},(_,i)=>({id:String(i),status:'published'} as Release));
 assert.deepEqual(retentionCandidates(items,'7',new Set(['6'])).map(r=>r.id),['5']);
 assert.deepEqual(retentionCandidates(items,'0',new Set()).map(r=>r.id),['5','6','7']);
});
