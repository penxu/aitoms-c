import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareCandidate} from '@/lib/generation/candidate-snapshot';
import {restartService} from '@/lib/runner';
import {runCommand} from './command';
import {pnpmShellCommand} from './toolchain';
import {withBuildSlot} from './build-queue';

/** 先构建当前源码的独立快照再切换；Next预览与验收使用同一生产产物。 */
export async function refreshProjectPreview(projectId:string,signal?:AbortSignal) {
  signal?.throwIfAborted();
  const candidate=await prepareCandidate(projectId,`preview-${Date.now()}`,signal);
  signal?.throwIfAborted();
  const pkg=path.join(candidate.absoluteRoot,'package.json');
  if(fs.existsSync(pkg)&&JSON.parse(fs.readFileSync(pkg,'utf8')).dependencies?.next) {
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
  return restartService(projectId,{
    sourceDir:candidate.relativeRoot,
    validate:async(_result,serviceSignal)=>{signal?.throwIfAborted();serviceSignal.throwIfAborted();},
  });
}
