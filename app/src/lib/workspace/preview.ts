import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareCandidate} from '@/lib/generation/candidate-snapshot';
import {restartService} from '@/lib/runner';
import {runCommand} from './command';
import {pnpmShellCommand} from './toolchain';
import {withBuildSlot} from './build-queue';
import {config} from '@/lib/config';

/** 默认以源码快照启动dev；full模式才先生产构建。切换失败保留原预览。 */
export async function refreshProjectPreview(projectId:string,signal?:AbortSignal,onProgress?:(message:string)=>void) {
  signal?.throwIfAborted();
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
  return restartService(projectId,{
    sourceDir:candidate.relativeRoot,
    validate:async(_result,serviceSignal)=>{signal?.throwIfAborted();serviceSignal.throwIfAborted();},
  });
}
