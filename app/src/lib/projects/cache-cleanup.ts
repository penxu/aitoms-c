import fs from 'node:fs';
import path from 'node:path';
import {config} from '@/lib/config';
import {getProtectedRuntimeSources} from '@/lib/runner';
import {acquireProjectMutation} from '@/lib/workspace/mutations';
import {resolveInsideProject} from '@/lib/workspace/paths';

export interface CachePruneResult{projects:number;candidateDirs:number;tmpEntries:number;storeEntries:number}

/** 仅使用普通缓存目录，拒绝内部或外部符号链接重定向。 */
async function cacheBase(projectId:string,projectDir:string,relative:string):Promise<string|null>{
 let expected=projectDir;
 for(const part of relative.split('/')){
  expected=path.join(expected,part);
  try{const stat=await fs.promises.lstat(expected);if(stat.isSymbolicLink()||!stat.isDirectory())return null;}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
 }
 return resolveInsideProject(projectId,relative)===expected?expected:null;
}
async function clearChildren(projectId:string,projectDir:string,relative:string,predicate:(absolute:string)=>boolean):Promise<number>{
 const base=await cacheBase(projectId,projectDir,relative);if(!base)return 0;
 let count=0;
 for(const entry of await fs.promises.readdir(base,{withFileTypes:true})){
  if(entry.isSymbolicLink()||(!entry.isDirectory()&&!entry.isFile()))continue;
  const absolute=path.join(base,entry.name);if(!predicate(absolute))continue;
  if(await cacheBase(projectId,projectDir,relative)!==base)break;
  if(resolveInsideProject(projectId,path.posix.join(relative,entry.name))!==absolute)continue;
  try{if((await fs.promises.lstat(absolute)).isSymbolicLink())continue;await fs.promises.rm(absolute,{recursive:true,force:true});count++;}
  catch{/* 保留无法安全清理的缓存，下次再试。 */}
 }
 return count;
}

/** 取得工程锁后回收闲置缓存；恢复存活服务不等于服务已停止。 */
export async function pruneStaleCaches(options:{maxCandidateAgeMs?:number;dropStores?:boolean}={}):Promise<CachePruneResult>{
 const maxAge=options.maxCandidateAgeMs??7*24*60*60*1000;
 if(!Number.isFinite(maxAge)||maxAge<0)throw Error('候选缓存期限无效');
 const result:CachePruneResult={projects:0,candidateDirs:0,tmpEntries:0,storeEntries:0};
 let projects:fs.Dirent[];
 try{projects=await fs.promises.readdir(config.workspaceRoot,{withFileTypes:true});}catch{return result;}
 const now=Date.now();
 for(const project of projects){
  if(project.isSymbolicLink()||!project.isDirectory()||!/^[A-Za-z0-9_-]{1,64}$/.test(project.name))continue;
  let release:()=>void;
  try{release=acquireProjectMutation(project.name,'cache-cleanup');}catch{continue;}
  try{
   const projectDir=await fs.promises.realpath(path.join(config.workspaceRoot,project.name));
   const protectedSources=getProtectedRuntimeSources(project.name);
   result.projects++;
   result.candidateDirs+=await clearChildren(project.name,projectDir,'.atoms/candidates',absolute=>{
    // 每次删除前重读运行/恢复/回滚源，不能只相信扫描开始时的状态。
    if(getProtectedRuntimeSources(project.name).some(relative=>path.resolve(projectDir,relative)===absolute))return false;
    try{return now-fs.statSync(absolute).mtimeMs>maxAge;}catch{return false;}
   });
   // 恢复中的服务或未知恢复源仍可能使用TMP/HOME；保守地全部保留。
   if(protectedSources.length===0&&getProtectedRuntimeSources(project.name).length===0){
    result.tmpEntries+=await clearChildren(project.name,projectDir,'.atoms/runtime/tmp',()=>getProtectedRuntimeSources(project.name).length===0);
    if(options.dropStores)result.storeEntries+=await clearChildren(project.name,projectDir,'.atoms/runtime/pnpm-store',()=>getProtectedRuntimeSources(project.name).length===0);
   }
  }catch{/* 不能确认归属或状态时跳过，不影响平台启动。 */}
  finally{release();}
 }
 return result;
}
