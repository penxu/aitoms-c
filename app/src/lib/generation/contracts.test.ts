import assert from "node:assert/strict";
import test from "node:test";
import { checkTemplateContract } from "./contracts.ts";

const dbOk = `import Database from "better-sqlite3";
const DDL = ["CREATE TABLE a (id INTEGER)"];
let db: Database.Database | null = null;
export function getDb() { return db; }
`;

test("模板文件未改动时通过契约校验", () => {
  assert.equal(checkTemplateContract("lib/db/index.ts", dbOk), null);
});

test("丢失 getDb 导出时拒绝", () => {
  const bad = dbOk.replace("export function getDb", "function getDb");
  assert.match(checkTemplateContract("lib/db/index.ts", bad) ?? "", /丢失了模板约定内容/);
});

test("引入 drizzle 时拒绝", () => {
  const bad = `${dbOk}\nimport { drizzle } from "drizzle-orm/better-sqlite3";`;
  assert.match(checkTemplateContract("lib/db/index.ts", bad) ?? "", /未安装的依赖/);
});

test("健康检查接口必须保留探活返回", () => {
  const bad = "export function GET() { return new Response('ok'); }";
  assert.match(checkTemplateContract("app/api/health/route.ts", bad) ?? "", /健康|丢失/);
});

test("非契约文件不校验", () => {
  assert.equal(checkTemplateContract("app/page.tsx", "export default function Page() { return null; }"), null);
});
