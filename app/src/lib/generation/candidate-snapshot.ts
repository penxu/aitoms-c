import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {projectRoot,resolveInsideProject} from '@/lib/workspace/paths';
import {snapshotSource} from '@/lib/packages/source';
import {pruneCandidates} from './candidate-retention';
import {ensureProjectDependencies} from './scaffold';

/** 源码与依赖独立复制；安装、构建和验收不会改变现有预览。 */
export async function prepareCandidate(projectId:string,runId:string,signal?:AbortSignal,onProgress?:(message:string)=>void):Promise<{relativeRoot:string;absoluteRoot:string}> {
  signal?.throwIfAborted();
  const relativeRoot=`.atoms/candidates/${runId}-${Date.now()}`;
  const absoluteRoot=resolveInsideProject(projectId,relativeRoot,{allowMissing:true});
  const root=projectRoot(projectId);
  // 新建大副本前先回收未使用候选；运行/恢复/回滚源由保留器额外保护。
  await pruneCandidates(projectId,0);
  try {
  onProgress?.("正在复制候选源码");
  snapshotSource(root,absoluteRoot,{allowStatic:true});
  const modules=resolveInsideProject(projectId,'node_modules',{allowMissing:true});
  onProgress?.("正在复制候选依赖（优先写时复制，不共享可写硬链接）");
  if(fs.existsSync(modules)) await fs.promises.cp(modules,path.join(absoluteRoot,'node_modules'),{recursive:true,dereference:false,verbatimSymlinks:true,mode:fs.constants.COPYFILE_FICLONE});
  signal?.throwIfAborted();
  if(fs.existsSync(path.join(absoluteRoot,'package.json'))) {
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-candidate-install-'));
  try {
    const install=await ensureProjectDependencies(projectId,signal,{ATOMS_DATA_DIR:dataDir,DATABASE_PATH:path.join(dataDir,'app.db')},relativeRoot,[],onProgress);
    signal?.throwIfAborted();
    if(install.exitCode!==0||install.aborted||install.timedOut) throw Error(`候选依赖准备失败：${install.stderr||install.stdout}`);
  } finally {fs.rmSync(dataDir,{recursive:true,force:true});}
  }
  await pruneCandidates(projectId,1,[relativeRoot]);
  return {relativeRoot,absoluteRoot};
  }catch(error){
    try{
      if(resolveInsideProject(projectId,relativeRoot,{allowMissing:true})===absoluteRoot&&!fs.lstatSync(absoluteRoot).isSymbolicLink())await fs.promises.rm(absoluteRoot,{recursive:true,force:true});
    }catch{/* 不能确认归属时保留，绝不扩大删除范围。 */}
    throw error;
  }
}
