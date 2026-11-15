import test from "node:test";
import assert from "node:assert/strict";
import {
  excerptWithLineNumbers,
  findLineOf,
  formatDiagnostics,
  parseNextBuildDiagnostics,
  parseTscDiagnostics,
  resolveGeneratedDiagnostics,
} from "./diagnostics.ts";

const TSC_LOG = `> app@0.1.0 typecheck
> tsc --noEmit

app/levels/page.tsx(218,23): error TS2322: Type '"secondary"' is not assignable to type '"default" | "outline" | "ghost" | null | undefined'.
app/page.tsx(94,23): error TS2322: Type '"secondary"' is not assignable to type '"default" | "outline" | "ghost" | null | undefined'.
./app/page.tsx(94,23): error TS2322: Type '"secondary"' is not assignable to type '"default" | "outline" | "ghost" | null | undefined'.
`;

test("解析 tsc 诊断并去重、去除 ./ 前缀", () => {
  const diagnostics = parseTscDiagnostics(TSC_LOG);
  assert.equal(diagnostics.length, 2);
  assert.deepEqual(diagnostics[0], {
    file: "app/levels/page.tsx",
    line: 218,
    column: 23,
    code: "TS2322",
    message: `Type '"secondary"' is not assignable to type '"default" | "outline" | "ghost" | null | undefined'.`,
  });
  assert.equal(diagnostics[1].file, "app/page.tsx");
});

test("诊断数量受 limit 限制", () => {
  const log = Array.from({ length: 30 }, (_, index) => `app/f${index}.tsx(1,1): error TS1000: x`).join("\n");
  assert.equal(parseTscDiagnostics(log, 5).length, 5);
});

test("无法解析的日志返回空数组", () => {
  assert.deepEqual(parseTscDiagnostics("[pnpm install]\nERR_PNPM_FETCH_404"), []);
});

test("next build 预渲染错误换算成页面文件", () => {
  const log = `⨯ useSearchParams() should be wrapped in a suspense boundary at page "/play". Read more: https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout
Error occurred prerendering page "/play". Read more: https://nextjs.org/docs/messages/prerender-error`;
  const diagnostics = parseNextBuildDiagnostics(log);
  assert.equal(diagnostics[0].file, "app/play/page.tsx");
  assert.equal(diagnostics[0].code, "NEXT_BUILD");
  assert.match(diagnostics[0].message, /useSearchParams/);
  assert.equal(diagnostics.length, 1);
});

test("首页路由映射到 app/page.tsx", () => {
  assert.equal(
    parseNextBuildDiagnostics(`Error occurred prerendering page "/"`)[0].file,
    "app/page.tsx",
  );
});

test("findLineOf 定位调用所在行", () => {
  const content = `"use client";\nimport x from "y";\n\nexport default function P() {\n  const q = useSearchParams();\n}\n`;
  assert.equal(findLineOf(content, /useSearchParams\(/), 5);
  assert.equal(findLineOf(content, /not-there/), 1);
});

test("validator.ts 的错误回溯到真实路由文件", () => {
  const log = `.next/types/validator.ts(229,31): error TS2344: Type 'typeof import("/tmp/proj/app/api/defects/[id]/fix-records/route")' does not satisfy the constraint 'RouteHandlerConfig<"/api/defects/[id]/fix-records">'.`;
  const resolved = resolveGeneratedDiagnostics(parseTscDiagnostics(log), "/tmp/proj");
  assert.equal(resolved[0].file, "app/api/defects/[id]/fix-records/route");
  assert.equal(resolved[0].line, 1);
});

test("项目外的路径与普通文件不被改写", () => {
  const log = `.next/types/validator.ts(1,1): error TS2344: Type 'typeof import("/other/app/x/route")' is wrong.`;
  assert.equal(resolveGeneratedDiagnostics(parseTscDiagnostics(log), "/tmp/proj")[0].file, ".next/types/validator.ts");

  const plain = parseTscDiagnostics(`app/page.tsx(3,1): error TS2322: boom`);
  assert.equal(resolveGeneratedDiagnostics(plain, "/tmp/proj")[0].file, "app/page.tsx");
});

test("formatDiagnostics 给出一行一个位置", () => {
  const text = formatDiagnostics(parseTscDiagnostics(TSC_LOG));
  assert.match(text, /^- app\/levels\/page\.tsx:218 TS2322 /m);
  assert.equal(text.split("\n").length, 2);
});

test("excerptWithLineNumbers 带行号并裁剪到文件范围", () => {
  const content = Array.from({ length: 40 }, (_, index) => `line ${index + 1}`).join("\n");
  const excerpt = excerptWithLineNumbers(content, 10, 2);
  assert.equal(excerpt.split("\n").length, 5);
  assert.match(excerpt, /^ 8 \| line 8$/m);
  assert.match(excerpt, /^12 \| line 12$/m);

  const clamped = excerptWithLineNumbers(content, 1, 2);
  assert.match(clamped, /^1 \| line 1$/m);
  assert.equal(clamped.includes("line 0"), false);
});
