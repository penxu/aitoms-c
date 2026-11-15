import {pruneCandidates} from "@/lib/generation/candidate-retention";
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareCandidate} from '@/lib/generation/candidate-snapshot';
import {restartService, startService} from '@/lib/runner';
import {ensureProjectDependencies} from '@/lib/generation/scaffold';
import {runCommand} from './command';
import {pnpmShellCommand} from './toolchain';
import {withBuildSlot} from './build-queue';
import {config} from '@/lib/config';

/** 普通预览直接使用源码与已安装依赖；full模式保留独立候选验证。 */
export async function refreshProjectPreview(projectId:string,signal?:AbortSignal,onProgress?:(message:string)=>void,options:{restart?:boolean}={}) {
  signal?.throwIfAborted();
  if(config.generationVerificationMode !== 'full') {
    onProgress?.("正在检查项目已有依赖");
    const dependencies=await ensureProjectDependencies(projectId,signal,undefined,".",[],onProgress);
    signal?.throwIfAborted();
    if(dependencies.exitCode!==0||dependencies.aborted||dependencies.timedOut)throw Error(`预览依赖准备失败：${dependencies.stderr||dependencies.stdout||"安装未完成"}`);
    onProgress?.("依赖已就绪，正在启动或复用项目开发服务");
    const result=options.restart||dependencies.dependenciesChanged
      ?await restartService(projectId,{sourceDir:".",signal})
      :await startService(projectId,{sourceDir:".",signal});
    signal?.throwIfAborted();
    try{await pruneCandidates(projectId,0);}catch(error){onProgress?.(`历史预览缓存暂未回收：${String(error)}`);}
    return result;
  }
  const candidate=await prepareCandidate(projectId,`preview-${Date.now()}`,signal,onProgress);
  signal?.throwIfAborted();
  const pkg=path.join(candidate.absoluteRoot,'package.json');
  if(config.generationVerificationMode === 'full' && fs.existsSync(pkg)&&JSON.parse(fs.readFileSync(pkg,'utf8')).dependencies?.next) {
    const data=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-preview-build-'));
    try {
      await withBuildSlot(async()=>{
        for(const command of [`${pnpmShellCommand()} exec tsc --noEmit`,`${pnpmShellCommand()} build --webpack`]) {
          signal?.throwIfAborted();
          const result=await runCommand(projectId,command,{cwd:candidate.relativeRoot,signal,timeoutMs:600000,env:{NODE_ENV:'production',ATOMS_BASE_PATH:`/p/${projectId}`,NEXT_PUBLIC_ATOMS_BASE_PATH:`/p/${projectId}`,ATOMS_DATA_DIR:data,DATABASE_PATH:path.join(data,'app.db')}});
          if(result.exitCode!==0||result.aborted||result.timedOut)throw Error(`预览构建失败，原预览已保留：${result.stderr||result.stdout}`);
        }
      });
    }finally {fs.rmSync(data,{recursive:true,force:true});}
  }
  signal?.throwIfAborted();
  onProgress?.("候选依赖已就绪，正在启动并检查预览");
  const result=await restartService(projectId,{
    sourceDir:candidate.relativeRoot,
    signal,
    validate:async(_result,serviceSignal)=>{signal?.throwIfAborted();serviceSignal.throwIfAborted();},
  });
  try{await pruneCandidates(projectId,0);}catch(error){onProgress?.(`历史预览缓存暂未回收：${String(error)}`);}
  return result;
}
