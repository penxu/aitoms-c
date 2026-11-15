import { spawn,execFileSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { allocatePort, releasePortReservation } from '@/lib/runner';
import { releases } from './context';
import { packageInvocation, shellQuote } from '../workspace/toolchain';
import { createWorkspaceExecution, ensureWorkspaceRuntime, cleanupWorkspaceExecution, isWorkspaceExecutionRunning } from '../workspace/execution';
import { packageCommands } from './commands';
import { releaseEnv } from './runtime-env';
import type { Release } from './types';

declare global { var __atomsReleaseChildren:Map<string,ChildProcess>|undefined }
const children=globalThis.__atomsReleaseChildren??=new Map<string,ChildProcess>();
const cleanups=new Map<string,()=>void>();
function cleanupStoredExecution(root:string):void {
 const marker=path.join(root,'.atoms','runtime','production-execution.json');
 if(!fs.existsSync(marker))return;
 if(!fs.lstatSync(marker).isFile()||fs.realpathSync(marker)!==path.join(fs.realpathSync(root),'.atoms','runtime','production-execution.json'))throw new Error('非法生产容器标识文件');
 const stored=JSON.parse(fs.readFileSync(marker,'utf8')) as {cleanupId?:string};
 if(stored.cleanupId)cleanupWorkspaceExecution(root,stored.cleanupId);
 fs.rmSync(marker,{force:true});
}
function processIdentity(pid:number):string|null {
 try {return execFileSync('ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8',timeout:2000}).trim()||null;}catch{return null;}
}
function ownsProcess(id:string,pid:number,identity:string|null):boolean {
 if(children.get(id)?.pid===pid)return true;
 if(!identity||processIdentity(pid)!==identity)return false;
 const release=releases.get(id);if(!release)return false;
 try {
  const cwd=process.platform==='linux'?fs.readlinkSync(`/proc/${pid}/cwd`):execFileSync('lsof',['-a','-p',String(pid),'-d','cwd','-Fn'],{encoding:'utf8',timeout:2000}).split('\n').find(line=>line.startsWith('n'))?.slice(1);
  return cwd?fs.realpathSync(cwd)===fs.realpathSync(release.artifactPath):false;
 }catch{return false;}
}
export function productionPort(releaseId:string):number|null {
 const row=releases.db.prepare("SELECT port,pid,identity FROM release_processes WHERE release_id=? AND status='running'").get(releaseId) as {port:number;pid:number;identity:string|null}|undefined;
 if(!row)return null;
 const release=releases.get(releaseId);
 if(release)try {
  const marker=path.join(release.artifactPath,'.atoms','runtime','production-execution.json');
  if(fs.existsSync(marker)&&fs.lstatSync(marker).isFile()&&fs.realpathSync(marker)===path.join(fs.realpathSync(release.artifactPath),'.atoms','runtime','production-execution.json')) {
   const value=JSON.parse(fs.readFileSync(marker,'utf8')) as {cleanupId?:string};
   if(value.cleanupId&&isWorkspaceExecutionRunning(release.artifactPath,value.cleanupId,row.port))return row.port;
  }
 }catch{/* 无法确认容器时按原生进程身份核对。 */}
 if(!ownsProcess(releaseId,row.pid,row.identity))return null;
 try {process.kill(row.pid,0);return row.port;} catch {return null;}
}
export async function startProduction(release:Release):Promise<number> {
 const existing=productionPort(release.id);if(existing)return existing;
 cleanupStoredExecution(release.artifactPath);
 await ensureWorkspaceRuntime(release.artifactPath);
 const port=await allocatePort();
 try {
 const commands=packageCommands(release.artifactPath);
 const invocation=packageInvocation(commands.command,[...commands.start,...(commands.command==='npm'?['--']:[]),'-p',String(port),'-H','127.0.0.1']);
 const execution=createWorkspaceExecution(release.artifactPath,[invocation.command,...invocation.args].map(shellQuote).join(' '),{...releaseEnv(release.projectId,`/s/${release.projectId}`),PORT:String(port),HOSTNAME:'127.0.0.1'});
 if(execution.cleanupId)fs.writeFileSync(path.join(release.artifactPath,'.atoms','runtime','production-execution.json'),JSON.stringify({cleanupId:execution.cleanupId}));
 const child=spawn(execution.command,execution.args,{
  cwd:release.artifactPath,detached:true,
  env:execution.env,
  stdio:['ignore','pipe','pipe'],
 });
 children.set(release.id,child);
 if(execution.cleanup)cleanups.set(release.id,execution.cleanup);
 releases.db.prepare("INSERT INTO release_processes(release_id,project_id,pid,port,status,identity) VALUES(?,?,?,?,'running',?) ON CONFLICT(release_id) DO UPDATE SET pid=excluded.pid,port=excluded.port,status='running',identity=excluded.identity").run(release.id,release.projectId,child.pid??null,port,child.pid?processIdentity(child.pid):null);
 releasePortReservation(port);
 const log=(chunk:Buffer)=>releases.log(release.id,chunk.toString());
 child.stdout?.on('data',log);child.stderr?.on('data',log);
 const failed=()=>{
  execution.cleanup?.();
  cleanups.delete(release.id);
  children.delete(release.id);
  releases.db.prepare("UPDATE release_processes SET status='stopped',pid=NULL WHERE release_id=? AND pid=?").run(release.id,child.pid??null);
 };
 child.once('exit',failed);
 child.once('error',error=>{releases.log(release.id,error.message);failed();});
 child.unref();
 return port;
 } catch(error) {releasePortReservation(port);throw error;}
}
export function stopProduction(id:string):void {
 cleanups.get(id)?.();cleanups.delete(id);
 const release=releases.get(id);if(release)cleanupStoredExecution(release.artifactPath);
 const row=releases.db.prepare('SELECT pid,identity FROM release_processes WHERE release_id=?').get(id) as {pid:number|null;identity:string|null}|undefined;
 if(row?.pid && ownsProcess(id,row.pid,row.identity)) {
  try {process.kill(-row.pid,'SIGTERM');}catch{}
  const pid=row.pid;
  const birth=processIdentity(pid);
  const timer=setTimeout(()=>{if(birth && processIdentity(pid)===birth)try{process.kill(-pid,'SIGKILL');}catch{}},3000);timer.unref();
 }
 children.delete(id);
 releases.db.prepare("UPDATE release_processes SET status='stopped',pid=NULL WHERE release_id=?").run(id);
}
export async function checkProduction(projectId:string,port:number,timeout=60_000):Promise<void> {
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline) {
  try {
   const response=await fetch(`http://127.0.0.1:${port}/s/${projectId}/api/health`,{signal:AbortSignal.timeout(2500),cache:'no-store'});
   const body=await response.json().catch(()=>null);
   if(response.ok&&body?.ok===true)return;
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 throw new Error('生产服务未通过健康检查，原版本继续提供服务');
}
