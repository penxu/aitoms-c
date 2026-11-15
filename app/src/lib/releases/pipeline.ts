import { acquireProjectMutation } from "@/lib/workspace/mutations";
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { projectRoot } from '@/lib/workspace/paths';
import { withBuildSlot } from '@/lib/workspace/build-queue';
import { getActiveGenerationRun } from '@/lib/db/generation';
import { collectSource, snapshotSource, sourceHash } from '../packages/source';
import { releases } from './context';
import { releasePath, releaseEnv, deliveryRoot } from './runtime-env';
import { execute, packageCommands } from './commands';
import { startProduction, stopProduction, checkProduction, productionPort } from './process';
import { runReleaseWorkflow } from './workflow';
import { retentionCandidates } from './retention';
import { publicRelease, type Release } from './types';

declare global {var __atomsReleaseQueue:Promise<void>|undefined;var __atomsReleaseJobs:Set<string>|undefined;var __atomsReleaseRecovered:boolean|undefined}
const jobs=globalThis.__atomsReleaseJobs??=new Set<string>();
function verifyContract(root:string):void {
 const files=collectSource(root);
 const db=files.find(f=>f.path==='lib/db/index.ts'||f.path==='src/lib/db/index.ts');
 if(db && !/ATOMS_DATA_DIR/.test(db.content.toString()))throw new Error('该项目尚未使用独立数据目录，请在对话中让 AI 将数据库入口改为读取 ATOMS_DATA_DIR 后再发布');
 // First release does not run destructive database migrations automatically.
 const destructive=files.find(f=> /\.(?:[cm]?[jt]sx?|sql)$/i.test(f.path) && /\b(?:DROP\s+(?:TABLE|DATABASE|COLUMN)|TRUNCATE\s+TABLE|ALTER\s+TABLE[\s\S]{0,120}DROP)\b/i.test(f.content.toString()));
 if(destructive)throw new Error(`发布阻塞：${destructive.path} 含破坏性数据库迁移，请改为向后兼容的迁移`);
 packageCommands(root);
}
export function beginRelease(projectId:string,rollbackId?:string):Release {
 const releaseMutation=acquireProjectMutation(projectId,"release-snapshot");
 try { return captureRelease(projectId,rollbackId); } finally {releaseMutation();}
}
function captureRelease(projectId:string,rollbackId?:string):Release {
 const current=releases.pending(projectId);if(current)return current;
 if(getActiveGenerationRun(projectId))throw new Error('应用正在生成，请完成后发布');
 const old=rollbackId?releases.get(rollbackId):undefined;
 if(rollbackId && (!old||old.projectId!==projectId||old.status!=='published'))throw new Error('只能回滚该项目已成功发布的版本');
 if(old&&!fs.existsSync(path.join(old.artifactPath,'.source')))throw new Error('该历史版本的文件已按保留策略清理，无法回滚');
 const source=old?path.join(old.artifactPath,'.source'):projectRoot(projectId);
 verifyContract(source);
 const id=`rel_${randomUUID().replaceAll('-','')}`;
 const artifactPath=releasePath(projectId,id);
 // Capture synchronously before returning: future edits cannot alter the release input.
 const captured=collectSource(source);
 if(!captured.length)throw new Error('项目没有可发布的源码');
 const release=releases.create(projectId,id,artifactPath);
 if(release.id!==id)return release;
 const previous=releases.active(projectId);
 const buildData=path.join(artifactPath,'.build-data');
 const isolatedEnv=()=>({...releaseEnv(projectId,`/s/${projectId}`),ATOMS_DATA_DIR:buildData,DATABASE_PATH:path.join(buildData,'app.db')});
 jobs.add(id);
 const work=async()=>{
  let port:number|null=null;
  await runReleaseWorkflow(releases,release,{
   snapshot:async()=>{
    for(const file of captured)for(const folder of [artifactPath,path.join(artifactPath,'.source')]) {const abs=path.join(folder,file.path);fs.mkdirSync(path.dirname(abs),{recursive:true});fs.writeFileSync(abs,file.content,{flag:'wx'});}
    if(rollbackId)releases.log(id,`回滚来源：${rollbackId}`);
    return sourceHash(captured.filter(f=>f.path!=='.atoms/VERIFICATION.json'));
   },
   install:async()=>{
    const cmd=packageCommands(artifactPath);
    fs.mkdirSync(buildData,{recursive:true});
    await execute(artifactPath,cmd.command,cmd.install,{...isolatedEnv(),NODE_ENV:'development'},s=>releases.log(id,s));
   },
   build:async()=>{
    const cmd=packageCommands(artifactPath);
    try {await withBuildSlot(()=>execute(artifactPath,cmd.command,cmd.build,isolatedEnv(),s=>releases.log(id,s)));}
    finally {fs.rmSync(buildData,{recursive:true,force:true});}
   },
   start:async()=>{port=await startProduction(releases.get(id)!);},
   check:async()=>{if(!port)throw new Error('生产端口未分配');await checkProduction(projectId,port);},
   stop:()=>{stopProduction(id);fs.rmSync(buildData,{recursive:true,force:true});},
  });
  if(releases.get(id)?.status==='published') {
   if(previous)stopProduction(previous.id);
   prune(projectId);
  }
 };
 const task=(globalThis.__atomsReleaseQueue??Promise.resolve()).then(work);
 globalThis.__atomsReleaseQueue=task.catch(error=>{
  stopProduction(id);releases.update(id,{status:'failed',error:error instanceof Error?error.message:String(error)});
 }).finally(()=>jobs.delete(id));
 return releases.get(id)!;
}
function prune(projectId:string):void {
 const active=releases.active(projectId)?.id;
 const history=releases.list(projectId);
 for(const old of retentionCandidates(history,active,jobs)) {
  stopProduction(old.id);
  // Only remove the artifact path derived from a validated project/release ID.
  const target=releasePath(projectId,old.id);
  if(target===old.artifactPath)fs.rmSync(target,{recursive:true,force:true});
 }
}
export async function recoverReleases():Promise<void> {
 if(globalThis.__atomsReleaseRecovered)return;
 globalThis.__atomsReleaseRecovered=true;
 releases.interrupt();
 // Kill interrupted candidate processes; retain active production instances.
 const stale=releases.db.prepare("SELECT release_id AS id FROM release_processes WHERE release_id NOT IN (SELECT active_release_id FROM project_deployments)").all() as {id:string}[];
 for(const r of stale)stopProduction(r.id);
 const active=releases.db.prepare('SELECT project_id AS projectId FROM project_deployments').all() as {projectId:string}[];
 for(const item of active) {
  const release=releases.active(item.projectId);if(!release)continue;
  try {
   const port=productionPort(release.id)??await startProduction(release);
   await checkProduction(item.projectId,port,60000);
   releases.log(release.id,'平台启动：生产版本健康检查通过');
  }catch(error) {stopProduction(release.id);releases.log(release.id,`恢复失败：${error instanceof Error?error.message:String(error)}`);}
 }
}
export function publicOrigin():string|null {
 try {
  const url=new URL(process.env.PUBLIC_APP_ORIGIN??'');
  if(!['https:','http:'].includes(url.protocol)||url.hostname==='localhost'||url.hostname==='127.0.0.1'||url.hostname==='[::1]'||url.username||url.password)return null;
  return url.origin;
 }catch{return null;}
}
export function releaseOverview(projectId:string) {
 const active=releases.active(projectId);const origin=publicOrigin();
 return {releases:releases.list(projectId).map(r=>({...publicRelease(r),artifactAvailable:fs.existsSync(path.join(r.artifactPath,'.source'))})),activeReleaseId:active?.id??null,publicOrigin:origin,productionUrl:origin&&active?`${origin}/s/${projectId}`:null,localUrl:`/s/${projectId}`,busy:Boolean(releases.pending(projectId)),productionRunning:active?productionPort(active.id)!==null:false};
}
export { releases, deliveryRoot, snapshotSource };
