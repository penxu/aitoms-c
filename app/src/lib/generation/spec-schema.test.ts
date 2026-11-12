import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSpec } from "./spec-schema.ts";

const GOOD = `# 需求规格
## 目标
做一个宠物美容预约网站，用户可以查看服务并提交预约。
## 页面
- / 首页：服务介绍
- /booking 预约表单
## 数据模型
- appointments(id, name, phone, service, created_at)
## 非目标
- 不做在线支付
`;

test("完整 SPEC 通过校验", () => {
  assert.deepEqual(validateSpec(GOOD), { ok: true, errors: [] });
});

test("缺少页面段落时失败", () => {
  const r = validateSpec(GOOD.replace("## 页面", "## 页面清单"));
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /页面/);
});

test("缺少数据模型段落时失败", () => {
  const r = validateSpec(GOOD.replace("## 数据模型", "## 表"));
  assert.equal(r.ok, false);
});

test("过短内容失败", () => {
  assert.equal(validateSpec("## 页面\n## 数据模型").ok, false);
});
