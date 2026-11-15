import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";
import { ReleaseStore } from "../releases/store";

/**
 * 平台数据持久化：SQLite（WAL 模式）。
 * Next.js 后端启动即自带数据库服务，无需外部数据库。
 */

function resolveDatabasePath(): string {
  const configured = process.env.DATABASE_PATH;
  if (configured) return path.resolve(configured);
  // 默认：<repo>/data/atoms.db
  return path.resolve(process.cwd(), "..", "data", "atoms.db");
}

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  workspace_path TEXT NOT NULL,
  assigned_port INTEGER,
  status TEXT NOT NULL DEFAULT 'created',
  favorited INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  role TEXT NOT NULL,
  parts_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE TABLE IF NOT EXISTS processes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  pid INTEGER,
  port INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  command TEXT NOT NULL DEFAULT '',
  last_heartbeat INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  started_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  stopped_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE TABLE IF NOT EXISTS generation_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  requirement TEXT NOT NULL DEFAULT '',
  error TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_active ON generation_runs(project_id) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_runs_project ON generation_runs(project_id, started_at);
CREATE TABLE IF NOT EXISTS generation_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  payload_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_run ON generation_events(run_id, created_at);
`;

/** 已有库的增量列：CREATE TABLE IF NOT EXISTS 不会补列，这里按需 ALTER。 */
function migrate(sqlite: Database.Database) {
  const columns = sqlite.pragma("table_info(projects)") as { name: string }[];
  if (!columns.some((column) => column.name === "favorited")) {
    sqlite.exec("ALTER TABLE projects ADD COLUMN favorited INTEGER NOT NULL DEFAULT 0");
  }
}

declare global {
  var __atomsSqlite: {
    sqlite: Database.Database;
    db: ReturnType<typeof drizzle<typeof schema>>;
  } | undefined;
}

function init() {
  const dbPath = resolveDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(DDL);
  migrate(sqlite);
  new ReleaseStore(sqlite);
  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

// 开发模式下防止热重载反复打开连接
const globalForDb = globalThis as typeof globalThis & {
  __atomsSqlite?: ReturnType<typeof init>;
};

export const { sqlite, db } = globalForDb.__atomsSqlite ?? init();
if (!globalForDb.__atomsSqlite) globalForDb.__atomsSqlite = { sqlite, db };

export * as tables from "./schema";
