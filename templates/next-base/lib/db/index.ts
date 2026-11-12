import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * 模板内置的数据访问入口：better-sqlite3 单例（WAL 模式）。
 * 建表语句统一放在下方 DDL 数组中，使用幂等 DDL，应用启动或首次请求时自动执行。
 */

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");

const DDL: string[] = [
  // BUILD 阶段新增表时，把对应 CREATE TABLE IF NOT EXISTS 追加到这里
];

declare global {
  var __appDb: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (globalThis.__appDb) return globalThis.__appDb;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  for (const stmt of DDL) db.exec(stmt);
  globalThis.__appDb = db;
  return db;
}

export { DDL };
