import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSuspenseBounds } from "./next16-suspense.ts";

const CLIENT_PAGE = `"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

export default function PlayPage() {
  const [level, setLevel] = useState(1);
  const query = useSearchParams();
  return <div onClick={() => setLevel(2)}>{query.get("id")}</div>;
}
`;

test("客户端页面补 Suspense 边界并保留原组件", () => {
  const { content, notes } = normalizeSuspenseBounds(CLIENT_PAGE);
  assert.match(content, /import \{ useState, Suspense \} from "react";/);
  assert.match(content, /^function PlayPage\(/m);
  assert.equal(content.includes("export default function PlayPage"), false);
  assert.match(content, /export default function SuspenseRoot\(\)/);
  assert.match(content, /<PlayPage \/>/);
  assert.equal(notes.length, 1);
});

test("没有 react 导入时补一条", () => {
  const source = `"use client";\nimport { useSearchParams } from "next/navigation";\nexport default function P() { const q = useSearchParams(); return <div>{q.get("a")}</div>; }\n`;
  const { content } = normalizeSuspenseBounds(source);
  assert.match(content, /import \{ Suspense \} from "react";/);
  assert.match(content, /export default function SuspenseRoot/);
});

test("默认导出为变量时同样处理", () => {
  const source = `"use client";\nimport { useSearchParams } from "next/navigation";\nconst Board = () => { const q = useSearchParams(); return <div />; };\nexport default Board;\n`;
  const { content } = normalizeSuspenseBounds(source);
  assert.equal(content.includes("export default Board;"), false);
  assert.match(content, /<Board \/>/);
});

test("已有 Suspense、服务端页面、未使用 useSearchParams 均不改动", () => {
  const withSuspense = CLIENT_PAGE.replace("{ useState }", "{ useState, Suspense }").replace("return <div", "return <Suspense><div").replace("</div>;", "</div></Suspense>;");
  assert.equal(normalizeSuspenseBounds(withSuspense).content, withSuspense);

  const serverPage = CLIENT_PAGE.replace('"use client";', "");
  assert.equal(normalizeSuspenseBounds(serverPage).content, serverPage);

  const plain = `"use client";\nexport default function P() { return <div />; }\n`;
  assert.equal(normalizeSuspenseBounds(plain).content, plain);
});

test("字符串注释里的hook不触发改码", () => {
 const source = `"use client";
// useSearchParams()
const help = "export default function Page() {}";
export default function Page() { return <div />; }`;
 assert.equal(normalizeSuspenseBounds(source).content, source);
});
