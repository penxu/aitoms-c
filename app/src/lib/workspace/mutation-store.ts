import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
export interface MutationLease {token:string;kind:string;pid:number;expiresAt:number}
/** SQLite 事务保护跨请求/进程的工程变更；存活所有者不会被租期过期抢占。 */
export class MutationStore {
 private db:Database.Database;
 private alive:(pid:number)=>boolean;
 constructor(db:Database.Database,alive:(pid:number)=>boolean=pid=>{try{process.kill(pid,0);return true}catch{return false}}){
  this.db=db;this.alive=alive;
  db.exec('CREATE TABLE IF NOT EXISTS project_mutations(project_id TEXT PRIMARY KEY,token TEXT NOT NULL,kind TEXT NOT NULL,pid INTEGER NOT NULL,expires_at INTEGER NOT NULL)');
 }
 acquire(id:string,kind:string,now=Date.now(),ttl=45000):MutationLease|null {
  return this.db.transaction(()=>{
   const old=this.db.prepare('SELECT token,kind,pid,expires_at AS expiresAt FROM project_mutations WHERE project_id=?').get(id) as MutationLease|undefined;
   if(old&&(old.expiresAt>now||this.alive(old.pid)))return null;
   const lease={token:randomUUID(),kind,pid:process.pid,expiresAt:now+ttl};
   this.db.prepare('INSERT INTO project_mutations VALUES(?,?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET token=excluded.token,kind=excluded.kind,pid=excluded.pid,expires_at=excluded.expires_at').run(id,lease.token,kind,lease.pid,lease.expiresAt);
   return lease;
  }).immediate();
 }
 heartbeat(id:string,token:string){this.db.prepare('UPDATE project_mutations SET expires_at=? WHERE project_id=? AND token=?').run(Date.now()+45000,id,token)}
 release(id:string,token:string){this.db.prepare('DELETE FROM project_mutations WHERE project_id=? AND token=?').run(id,token)}
}
