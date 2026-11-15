import test from 'node:test';
import assert from 'node:assert/strict';
import { infrastructureFailure } from './infrastructure-errors.ts';
test('外部删除保护需要明确指引，不能当成业务代码修复',()=>{
 assert.match(infrastructureFailure('Error [safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED]') ?? '',/CodeBuddy.*确认/);
 assert.equal(infrastructureFailure('page.tsx(2,4): error TS2322'),null);
});

test('首页检查超时不能当成已证实的代码错误触发模型改写',()=>{
 const log='[acceptance] 预览首页检查失败：PREVIEW-HOME: 首页访问检查超时 页面上下文：';
 const message=infrastructureFailure(log);
 assert.match(message??'',/首页.*超时/);
 assert.match(message??'',/停止自动.*修改|不自动.*修改/);
 assert.equal(infrastructureFailure('[acceptance] 预览首页检查失败：PREVIEW-HOME: 首页返回 HTTP 500'),null);
 assert.equal(infrastructureFailure('page.tsx(2,4): error TS2322'),null);
});
