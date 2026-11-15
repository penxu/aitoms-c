import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectExports, extractExportNames } from "./source-index.ts";

test("提取函数、常量、类型与导出列表", () => {
  const names = extractExportNames(`
export function getDb() {}
export async function listFailures() {}
export const TABLES = [];
export type Failure = {};
export interface Row {}
const local = 1;
export { local as alias };
`);
  assert.deepEqual(names, ["Failure", "Row", "TABLES", "alias", "getDb", "listFailures"]);
});

test("没有导出的文件返回空", () => {
  assert.deepEqual(extractExportNames("const a = 1;\n"), []);
});

test("collectExports 扫描 lib 与 app/api 并跳过隐藏目录", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atoms-exports-"));
  fs.mkdirSync(path.join(root, "lib"), { recursive: true });
  fs.mkdirSync(path.join(root, "app/api/x"), { recursive: true });
  fs.mkdirSync(path.join(root, "node_modules"), { recursive: true });

  fs.writeFileSync(path.join(root, "lib/repo.ts"), "export function getFeedback() {}\n");
  fs.writeFileSync(path.join(root, "app/api/x/route.ts"), "export async function GET() {}\n");
  fs.writeFileSync(path.join(root, "node_modules/skip.ts"), "export function nope() {}\n");

  const result = collectExports(root);
  assert.deepEqual(result, [
    { path: "app/api/x/route.ts", names: ["GET"] },
    { path: "lib/repo.ts", names: ["getFeedback"] },
  ]);

  fs.rmSync(root, { recursive: true, force: true });
});
