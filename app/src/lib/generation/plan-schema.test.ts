import { test } from "node:test";
import assert from "node:assert/strict";
import { MINIMAL_PLAN, validatePlan } from "./plan-schema.ts";

const FILES = ["app/page.tsx", "lib/db/index.ts", "components/ui/button.tsx"];
const BASE = {
  pages: ["/"],
  items: [
    { path: "app/page.tsx", action: "modify", purpose: "首页", dependsOn: [] },
    { path: "components/site/hero.tsx", action: "create", purpose: "首屏", dependsOn: ["components/ui/button.tsx"] },
  ],
  dataModel: [],
};

test("合法计划通过", () => {
  assert.deepEqual(validatePlan(BASE, FILES), { ok: true, errors: [] });
});

test("路径逃逸被拒绝", () => {
  for (const bad of ["/etc/passwd", "../../secret.ts", "app/../x.ts"]) {
    const plan = { ...BASE, items: [{ ...BASE.items[0], path: bad }] };
    assert.equal(validatePlan(plan, FILES).ok, false, bad);
  }
});

test("缺少 app/page.tsx 被拒绝", () => {
  assert.equal(validatePlan({ ...BASE, items: [BASE.items[1]] }, FILES).ok, false);
});

test("条目超过 40 被拒绝", () => {
  const items = Array.from({ length: 41 }, (_, i) => ({ path: `components/x${i}.tsx`, action: "create", purpose: "x", dependsOn: [] }));
  assert.equal(validatePlan({ ...BASE, items }, FILES).ok, false);
});

test("有数据模型但未声明 lib/db/index.ts 被拒绝", () => {
  const plan = { ...BASE, dataModel: [{ table: "leads", columns: ["id", "email"] }] };
  assert.equal(validatePlan(plan, FILES).ok, false);
});

test("非对象或空页面被拒绝后可用最小计划", () => {
  assert.equal(validatePlan("nope", FILES).ok, false);
  assert.equal(validatePlan({ pages: [], items: [] }, FILES).ok, false);
  assert.equal(validatePlan(MINIMAL_PLAN, FILES).ok, true);
});
