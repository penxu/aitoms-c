import { createHash } from "node:crypto";
import type Database from "better-sqlite3";

export function checkpointHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export class FileCheckpoints {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    db.exec("CREATE TABLE IF NOT EXISTS generation_file_checkpoints(project_id TEXT,plan_hash TEXT,path TEXT,input_hash TEXT,output_hash TEXT,run_id TEXT,PRIMARY KEY(project_id,plan_hash,path)); CREATE TABLE IF NOT EXISTS generation_file_baselines(project_id TEXT,path TEXT,output_hash TEXT NOT NULL,run_id TEXT NOT NULL,PRIMARY KEY(project_id,path))");
  }

  inspect(project: string, plan: string, path: string, input: string, current: string | null): "reuse" | "generate" | "conflict" {
    // 文件的最后生成版本独立于计划，需求/计划变化不能解除人工改动保护。
    const baseline = this.db.prepare("SELECT output_hash FROM generation_file_baselines WHERE project_id=? AND path=?").get(project, path) as { output_hash: string } | undefined;
    // 兼容加入baseline表之前的检查点；历史行无法确定最后一次upsert时间，宁可报告冲突。
    const previous = baseline ?? this.db.prepare("SELECT output_hash FROM generation_file_checkpoints WHERE project_id=? AND path=? ORDER BY rowid DESC LIMIT 1").get(project, path) as { output_hash: string } | undefined;
    const currentHash = current === null ? null : checkpointHash(current);
    if (previous && currentHash !== previous.output_hash) return "conflict";
    const row = this.db.prepare("SELECT input_hash,output_hash FROM generation_file_checkpoints WHERE project_id=? AND plan_hash=? AND path=?").get(project, plan, path) as { input_hash: string; output_hash: string } | undefined;
    return row && currentHash === row.output_hash && row.input_hash === input ? "reuse" : "generate";
  }

  recordRepair(project:string,plan:string,path:string,output:string,run:string):void {
    const hash=checkpointHash(output);
    this.db.transaction(()=>{
      this.db.prepare("UPDATE generation_file_checkpoints SET output_hash=?,run_id=? WHERE project_id=? AND plan_hash=? AND path=?").run(hash,run,project,plan,path);
      this.db.prepare("INSERT INTO generation_file_baselines VALUES(?,?,?,?) ON CONFLICT(project_id,path) DO UPDATE SET output_hash=excluded.output_hash,run_id=excluded.run_id").run(project,path,hash,run);
    })();
  }

  save(project: string, plan: string, path: string, input: string, output: string, run: string): void {
    const outputHash = checkpointHash(output);
    this.db.transaction(() => {
      this.db.prepare("INSERT INTO generation_file_checkpoints VALUES(?,?,?,?,?,?) ON CONFLICT(project_id,plan_hash,path) DO UPDATE SET input_hash=excluded.input_hash,output_hash=excluded.output_hash,run_id=excluded.run_id").run(project, plan, path, input, outputHash, run);
      this.db.prepare("INSERT INTO generation_file_baselines VALUES(?,?,?,?) ON CONFLICT(project_id,path) DO UPDATE SET output_hash=excluded.output_hash,run_id=excluded.run_id").run(project, path, outputHash, run);
    })();
  }
}
