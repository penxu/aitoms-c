import test from "node:test";
import assert from "node:assert/strict";
import { applyRepairFix, parseRepairOutput } from "./repair-output.ts";

test("标准 fixes 输出可解析", () => {
  const output = parseRepairOutput(
    `{"fixes":[{"path":"app/page.tsx","find":"variant=\\"secondary\\"","replace":"variant=\\"outline\\""}]}`,
  );
  assert.equal(output.truncated, false);
  assert.equal(output.fixes.length, 1);
  assert.equal(output.fixes[0].path, "app/page.tsx");
  assert.equal(output.fixes[0].find, 'variant="secondary"');
});

test("被截断的输出只保留完整片段", () => {
  const output = parseRepairOutput(
    '{"fixes":[{"path":"app/page.tsx","find":"a","replace":"b"},{"path":"app/levels/page.tsx","find":"未结束的片段',
  );
  assert.equal(output.truncated, true);
  assert.equal(output.fixes.length, 1);
  assert.equal(output.fixes[0].path, "app/page.tsx");
});

test("容忍 Markdown 围栏与前后说明", () => {
  const output = parseRepairOutput(
    '好的，修复如下：\n```json\n{"fixes":[{"path":"lib/db/index.ts","find":"x","replace":"y"}]}\n```',
  );
  assert.equal(output.fixes.length, 1);
  assert.equal(output.fixes[0].replace, "y");
});

test("find 中含有花括号与转义引号也能解析", () => {
  const output = parseRepairOutput(
    `{"fixes":[{"path":"a.ts","find":"const o = { a: \\"b\\" };","replace":"const o = { a: \\"c\\" };"}]}`,
  );
  assert.equal(output.fixes.length, 1);
  assert.equal(output.fixes[0].find, 'const o = { a: "b" };');
});

test("缺少 path 或改动内容的条目被丢弃", () => {
  const output = parseRepairOutput('{"fixes":[{"find":"a"},{"path":"a.ts"},{"path":"b.ts","content":"x"}]}');
  assert.deepEqual(output.fixes.map((fix) => fix.path), ["b.ts"]);
});

test("applyRepairFix 精确匹配并替换全部出现", () => {
  const file = `export function A(){ return <Button variant="secondary" /> }\nexport function B(){ return <Button variant="secondary" /> }\n`;
  const applied = applyRepairFix(file, {
    path: "a.tsx",
    find: 'variant="secondary"',
    replace: 'variant="outline"',
  });
  assert.equal(applied.matched, "exact");
  assert.equal(applied.applied, 2);
  assert.equal(applied.content.includes("secondary"), false);
});

test("applyRepairFix 缩进不一致时用去空白兜底", () => {
  const file = `    <Button\n      variant="secondary"\n    />\n`;
  const applied = applyRepairFix(file, {
    path: "a.tsx",
    find: `  <Button\n      variant="secondary"\n    />  `,
    replace: `<Button variant="outline" />`,
  });
  assert.equal(applied.applied, 1);
  assert.equal(applied.matched, "trimmed");
  assert.match(applied.content, /Button variant="outline"/);
});

test("applyRepairFix 在缩进与换行被压平时仍能定位", () => {
  const file = `export function A() {\n  return (\n    <Button\n      variant="secondary"\n      size="md"\n    />\n  );\n}\n`;
  const applied = applyRepairFix(file, {
    path: "a.tsx",
    find: '<Button variant="secondary" size="md" />',
    replace: '<Button variant="outline" size="md" />',
  });
  assert.equal(applied.matched, "normalized");
  assert.equal(applied.applied, 1);
  assert.ok(applied.content.includes('<Button variant="outline" size="md" />'));
  assert.equal(applied.content.includes("secondary"), false);
});

test("find 带行号前缀时自动剥除", () => {
  const file = `export function A() {\n  return 1;\n}\n`;
  const applied = applyRepairFix(file, {
    path: "a.ts",
    find: "  2 |   return 1;",
    replace: "  2 |   return 2;",
  });
  assert.equal(applied.applied, 1);
  assert.ok(applied.content.includes("  return 2;"));
  assert.equal(applied.content.includes("|"), false);
});

test("applyRepairFix 匹配失败时不改动文件", () => {
  const file = "const a = 1;\n";
  const applied = applyRepairFix(file, { path: "a.ts", find: "不存在的片段", replace: "x" });
  assert.equal(applied.applied, 0);
  assert.equal(applied.matched, "none");
  assert.equal(applied.content, file);
});

test("applyRepairFix 兼容整文件内容", () => {
  const applied = applyRepairFix("old", { path: "a.ts", content: "```ts\nnew content\n```" });
  assert.equal(applied.matched, "whole-file");
  assert.equal(applied.content, "new content");
});
