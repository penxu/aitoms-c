import test from 'node:test';
import assert from 'node:assert/strict';
import {findAvailablePort} from '../workspace/ports.ts';
test('allocation excludes both development and production ports and reports exhaustion',async()=>{
 const used=new Set([4000,4001]);
 assert.equal(await findAvailablePort(4000,4003,used,async port=>port===4003),4003);
 await assert.rejects(()=>findAvailablePort(4000,4001,used,async()=>true),/端口池已耗尽/);
 await assert.rejects(()=>findAvailablePort(4000,4001,new Set(),async()=>false),/端口池已耗尽/);
});
