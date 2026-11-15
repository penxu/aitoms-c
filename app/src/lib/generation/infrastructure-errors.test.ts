import test from 'node:test';
import assert from 'node:assert/strict';
import { infrastructureFailure } from './infrastructure-errors.ts';
test('外部删除保护需要明确指引，不能当成业务代码修复',()=>{
 assert.match(infrastructureFailure('Error [safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED]') ?? '',/CodeBuddy.*确认/);
 assert.equal(infrastructureFailure('page.tsx(2,4): error TS2322'),null);
});
