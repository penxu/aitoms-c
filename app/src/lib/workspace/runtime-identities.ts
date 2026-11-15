import type Database from "better-sqlite3";
import { type ProcessIdentity, readProcessIdentity, sameProcess } from "./process-identity.ts";

/** 独立增量表，不改变旧版 processes 结构。 */
export class RuntimeIdentities {
  private db: Database.Database;
  constructor(db: Database.Database) {
    this.db = db;
    db.exec(`CREATE TABLE IF NOT EXISTS runtime_identities (
      project_id TEXT PRIMARY KEY, pid INTEGER NOT NULL, start_token TEXT NOT NULL,
      cwd TEXT NOT NULL, started_at REAL NOT NULL
    )`);
    const columns = db.pragma("table_info(runtime_identities)") as { name: string }[];
    if (!columns.some(column => column.name === "cleanup_id")) db.exec("ALTER TABLE runtime_identities ADD COLUMN cleanup_id TEXT");
    if (!columns.some(column => column.name === "dependency_key")) db.exec("ALTER TABLE runtime_identities ADD COLUMN dependency_key TEXT");
  }
  save(id: string, identity: ProcessIdentity, cleanupId?: string, dependencyKey?: string | null): void {
    this.db.prepare(`INSERT INTO runtime_identities (project_id, pid, start_token, cwd, started_at, cleanup_id, dependency_key) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET pid=excluded.pid, start_token=excluded.start_token,
      cwd=excluded.cwd, started_at=excluded.started_at, cleanup_id=excluded.cleanup_id, dependency_key=excluded.dependency_key`).run(id, identity.pid, identity.startToken, identity.cwd, identity.startedAt, cleanupId ?? null,dependencyKey??null);
  }
  get(id: string): (ProcessIdentity & { cleanupId?: string; dependencyKey?:string }) | null {
    const row = this.db.prepare('SELECT pid, start_token AS startToken, cwd, started_at AS startedAt, cleanup_id AS cleanupId, dependency_key AS dependencyKey FROM runtime_identities WHERE project_id=?').get(id);
    if (!row) return null;
    const result = row as ProcessIdentity & { cleanupId?: string | null;dependencyKey?:string|null };
    if (result.cleanupId === null) delete result.cleanupId;
    if (result.dependencyKey === null) delete result.dependencyKey;
    return result as ProcessIdentity & { cleanupId?: string;dependencyKey?:string };
  }
  clearCleanup(id: string): void { this.db.prepare("UPDATE runtime_identities SET cleanup_id=NULL WHERE project_id=?").run(id); }
  remove(id: string): void { this.db.prepare('DELETE FROM runtime_identities WHERE project_id=?').run(id); }
  recover(id: string, pid: number, cwd: string, startedAt: number, read = readProcessIdentity): ProcessIdentity | null {
    const actual = read(pid);
    const expected = this.get(id);
    if (expected) return sameProcess(expected, actual) && actual?.cwd === cwd ? actual : null;
    // 旧记录无启动标识：只采纳原目录且启动时间紧邻记录的进程。
    if (!actual || actual.cwd !== cwd || Math.abs(actual.startedAt - startedAt) > 2000) return null;
    this.save(id, actual);
    return actual;
  }
}
