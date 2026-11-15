import test from 'node:test';
import assert from 'node:assert/strict';
import {stripInvalidProtocolTail,sourceSyntaxErrors} from './source-syntax.ts';
test('只移除导致语法错误的孤立协议尾标记，保留合法业务字符串',()=>{
 const code='export const value = "业务";';
 assert.equal(stripInvalidProtocolTail('lib/a.ts',code+'\n</parameter>').content,code);
 const valid='export const example = `demo\n</parameter>`;';
 assert.equal(stripInvalidProtocolTail('lib/a.ts',valid).content,valid);
 assert.equal(stripInvalidProtocolTail('components/x.tsx','export const X=()=> <parameter>业务</parameter>;').content,'export const X=()=> <parameter>业务</parameter>;');
});
test('剩余语法错误必须报告，不能盲删业务内容凑成成功',()=>{
 assert.ok(sourceSyntaxErrors('lib/a.ts','export const value = ;').length);
 const invalid='export const value = ;\n</parameter>';
 assert.equal(stripInvalidProtocolTail('lib/a.ts',invalid).content,invalid);
 assert.deepEqual(sourceSyntaxErrors('components/x.tsx','export const X=()=> <main>好</main>;'),[]);
});
