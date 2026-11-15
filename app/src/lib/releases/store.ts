import type Database from 'better-sqlite3';
import type { Release, ReleaseEvent, ReleaseStatus } from './types.ts';
const SELECT = 'SELECT id, project_id AS projectId, source_hash AS sourceHash, status, artifact_path AS artifactPath, created_at AS createdAt, finished_at AS finishedAt, error FROM releases';
const PENDING = "status NOT IN ('published','failed','interrupted')";

export class ReleaseStore {
 readonly db:Database.Database;
 constructor(db:Database.Database) {
  this.db=db;
  db.exec(`
   CREATE TABLE IF NOT EXISTS releases(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,source_hash TEXT NOT NULL DEFAULT '',status TEXT NOT NULL,artifact_path TEXT NOT NULL,created_at INTEGER NOT NULL,finished_at INTEGER,error TEXT);
   CREATE UNIQUE INDEX IF NOT EXISTS idx_release_pending ON releases(project_id) WHERE ${PENDING};
   CREATE INDEX IF NOT EXISTS idx_release_project ON releases(project_id,created_at);
   CREATE TABLE IF NOT EXISTS release_events(id INTEGER PRIMARY KEY AUTOINCREMENT,release_id TEXT NOT NULL,message TEXT NOT NULL,created_at INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS idx_release_event ON release_events(release_id,id);
   CREATE TABLE IF NOT EXISTS release_processes(release_id TEXT PRIMARY KEY,project_id TEXT NOT NULL,pid INTEGER,port INTEGER,status TEXT NOT NULL,identity TEXT);
   CREATE TABLE IF NOT EXISTS project_deployments(project_id TEXT PRIMARY KEY,active_release_id TEXT NOT NULL,previous_release_id TEXT,updated_at INTEGER NOT NULL);
  `);
  const columns=db.prepare("PRAGMA table_info(release_processes)").all() as {name:string}[];
  if(!columns.some(c=>c.name==='identity'))db.exec("ALTER TABLE release_processes ADD COLUMN identity TEXT");
 }
 get(id:string):Release|undefined {return this.db.prepare(`${SELECT} WHERE id=?`).get(id) as Release|undefined;}
 list(projectId:string):Release[] {return this.db.prepare(`${SELECT} WHERE project_id=? ORDER BY created_at DESC, rowid DESC LIMIT 50`).all(projectId) as Release[];}
 pending(projectId:string):Release|undefined {return this.db.prepare(`${SELECT} WHERE project_id=? AND ${PENDING}`).get(projectId) as Release|undefined;}
 create(projectId:string,id:string,artifactPath:string):Release {
  return this.db.transaction(()=>{
   const current=this.pending(projectId);if(current)return current;
   this.db.prepare('INSERT INTO releases(id,project_id,status,artifact_path,created_at) VALUES(?,?,?,?,?)').run(id,projectId,'queued',artifactPath,Date.now());
   return this.get(id)!;
  })();
 }
 update(id:string,input:{status?:ReleaseStatus;sourceHash?:string;error?:string|null}):void {
  const current=this.get(id);if(!current)throw new Error('发布版本不存在');
  const status=input.status??current.status;
  const finished=['published','failed','interrupted'].includes(status)?Date.now():null;
  this.db.prepare('UPDATE releases SET status=?,source_hash=?,error=?,finished_at=? WHERE id=?').run(status,input.sourceHash??current.sourceHash,input.error??null,finished,id);
 }
 active(projectId:string):Release|undefined {
  return this.db.prepare(`${SELECT} WHERE id=(SELECT active_release_id FROM project_deployments WHERE project_id=?)`).get(projectId) as Release|undefined;
 }
 activate(projectId:string,releaseId:string):void {
  this.db.transaction(()=>{
   const release=this.get(releaseId);
   if(!release || release.projectId!==projectId)throw new Error('版本不属于该项目');
   if(release.status!=='published')throw new Error('版本尚未通过验证');
   const old=this.active(projectId);
   this.db.prepare('INSERT INTO project_deployments(project_id,active_release_id,previous_release_id,updated_at) VALUES(?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET previous_release_id=active_release_id,active_release_id=excluded.active_release_id,updated_at=excluded.updated_at').run(projectId,releaseId,old?.id??null,Date.now());
  })();
 }
 log(releaseId:string,message:string):void {
  this.db.prepare('INSERT INTO release_events(release_id,message,created_at) VALUES(?,?,?)').run(releaseId,message.slice(-8000),Date.now());
  this.db.prepare('DELETE FROM release_events WHERE release_id=? AND id NOT IN (SELECT id FROM release_events WHERE release_id=? ORDER BY id DESC LIMIT 500)').run(releaseId,releaseId);
 }
 events(releaseId:string,after=0):ReleaseEvent[] {
  return this.db.prepare('SELECT id,release_id AS releaseId,message,created_at AS createdAt FROM release_events WHERE release_id=? AND id>? ORDER BY id LIMIT 500').all(releaseId,after) as ReleaseEvent[];
 }
 interrupt():void {
  this.db.prepare(`UPDATE releases SET status='interrupted',error='平台重启，发布已中断，请重新发布',finished_at=? WHERE ${PENDING}`).run(Date.now());
 }
}
