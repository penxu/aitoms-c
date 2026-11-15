import assert from "node:assert/strict";
import test from "node:test";
import { extractJson, stripCodeFence } from "./model-output.ts";

test("stripCodeFence 去除整体包裹的代码块", () => {
  assert.equal(stripCodeFence("```tsx\nexport default function Page() {}\n```"), "export default function Page() {}");
});

test("stripCodeFence 丢弃代码块前的说明文字", () => {
  const text = '我需要先确认结构。\n\n```tsx\nimport Link from "next/link";\n```\n\n以上。';
  assert.equal(stripCodeFence(text), 'import Link from "next/link";');
});

test("stripCodeFence 多个代码块保持原样", () => {
  const text = "```bash\npnpm i\n```\n\n```ts\nexport const a = 1;\nexport const b = 2;\n```";
  assert.equal(stripCodeFence(text), text);
});

test("stripCodeFence 无围栏时裁掉代码前的解释", () => {
  const text = "好的，下面是文件内容：\n\nimport { getDb } from \"../db\";\nexport const x = 1;";
  assert.equal(stripCodeFence(text), 'import { getDb } from "../db";\nexport const x = 1;');
});

test("extractJson 容忍说明与围栏", () => {
  const text = '好的，计划如下：\n```json\n{ "pages": ["/"], "items": [] }\n```';
  assert.deepEqual(extractJson(text), { pages: ["/"], items: [] });
});

test("extractJson 在缺少 JSON 时抛错", () => {
  assert.throws(() => extractJson("没有 JSON"), /没有 JSON 对象/);
});

test("stripCodeFence 清除兼容模型尾随协议结束标记，保留代码字符串内相同文字", () => {
  const code = 'export const text = "</｜｜DSML｜｜>";';
  assert.equal(stripCodeFence(`${code}\n</｜｜DSML｜｜>`), code);
  assert.equal(stripCodeFence(code), code);
});

test("stripCodeFence 清除确切末尾的DSML多层结束标记", () => {
  const code = 'export const text = "</｜｜DSML｜｜ parameter>";';
  assert.equal(stripCodeFence(`${code}\n</｜｜DSML｜｜ parameter>\n</｜｜DSML｜｜ invoke>\n</｜｜DSML｜｜ calls>`), code);
  assert.equal(stripCodeFence(code), code);
});

test("合法源码内嵌Markdown围栏保持完整", () => {
 const source = 'export const help = `示例：\n```ts\nconst example = 1;\n```\n结束`;';
 assert.equal(stripCodeFence(source), source);
});

test("declare与async开头的合法源码不裁掉开头", () => {
 for (const source of ['declare const value: string;\nexport { value };', 'async function load() {}\nexport { load };']) assert.equal(stripCodeFence(source), source);
});
