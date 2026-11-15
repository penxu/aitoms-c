import test from 'node:test';
import assert from 'node:assert/strict';
import {withBuildSlot} from '../workspace/build-queue.ts';
test('heavy builds serialize across callers and a failed build releases the slot',async()=>{
 let running=0,peak=0;
 const action=async(fail=false)=>{running++;peak=Math.max(peak,running);await new Promise(r=>setTimeout(r,5));running--;if(fail)throw new Error('build failed');return 'ok';};
 const results=await Promise.allSettled([withBuildSlot(()=>action(true)),withBuildSlot(()=>action()),withBuildSlot(()=>action())]);
 assert.equal(peak,1);assert.deepEqual(results.map(x=>x.status),['rejected','fulfilled','fulfilled']);
});
