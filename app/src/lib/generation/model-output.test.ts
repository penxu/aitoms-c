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

test("stripCodeFence 有多个代码块时取最长的一段", () => {
  const text = "```bash\npnpm i\n```\n\n```ts\nexport const a = 1;\nexport const b = 2;\n```";
  assert.equal(stripCodeFence(text), "export const a = 1;\nexport const b = 2;");
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
