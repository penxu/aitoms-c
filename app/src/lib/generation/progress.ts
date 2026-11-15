import {sqlite} from '@/lib/db';
export interface GenerationProgress {phase:string;heartbeatAt:number;lastProgressAt:number;workerPid:number}
function ready() {
  sqlite.exec('CREATE TABLE IF NOT EXISTS generation_progress(run_id TEXT PRIMARY KEY,phase TEXT,heartbeat_at INTEGER,last_progress_at INTEGER,worker_pid INTEGER)');
}
export function recordProgress(run:string,phase:string,meaningful=true):void {
  ready();const now=Date.now();
  sqlite.prepare('INSERT INTO generation_progress VALUES(?,?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET phase=excluded.phase,heartbeat_at=excluded.heartbeat_at,last_progress_at=CASE WHEN ? THEN excluded.last_progress_at ELSE generation_progress.last_progress_at END').run(run,phase,now,now,process.pid,meaningful?1:0);
}
export function getProgress(run:string):GenerationProgress|null {
  ready();
  return (sqlite.prepare('SELECT phase,heartbeat_at AS heartbeatAt,last_progress_at AS lastProgressAt,worker_pid AS workerPid FROM generation_progress WHERE run_id=?').get(run) as GenerationProgress|undefined)??null;
}
