import test from 'node:test';
import assert from 'node:assert/strict';
import {scriptArguments} from '../workspace/package-manager.ts';
test('pnpm passes Next flags directly while npm uses a script separator',()=>{
 assert.deepEqual(scriptArguments('pnpm','dev',['-p','4001']),['run','dev','-p','4001']);
 assert.deepEqual(scriptArguments('npm','start',['-p','4001']),['run','start','--','-p','4001']);
});
