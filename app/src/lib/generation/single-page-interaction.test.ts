import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {SPEC_SYSTEM_PROMPT,PLAN_SYSTEM_PROMPT,PREVIEW_PLAN_SYSTEM_PROMPT,BUILD_SYSTEM_PROMPT} from './prompts.ts';
import {getApplicationProfile} from './application-profile.ts';

test('各生成阶段遵守同页操作与轻量首屏规则，预览计划不丢失规则',()=>{
 for(const prompt of [SPEC_SYSTEM_PROMPT,PLAN_SYSTEM_PROMPT,PREVIEW_PLAN_SYSTEM_PROMPT,BUILD_SYSTEM_PROMPT]){
  assert.match(prompt,/单页/);assert.match(prompt,/按需加载/);
 }
 assert.ok(getApplicationProfile('房间布置应用').stateRules.some(rule=>rule.includes('同页')));
});
test('模板提供原生导航pending和路由加载边界',()=>{
 const root=path.resolve('..','templates/next-base');
 assert.match(fs.readFileSync(path.join(root,'components/app/navigation-link.tsx'),'utf8'),/useLinkStatus/);
 assert.match(fs.readFileSync(path.join(root,'app/loading.tsx'),'utf8'),/role="status"/);
});
