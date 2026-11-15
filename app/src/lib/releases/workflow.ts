import type { ReleaseStore } from './store.ts';
import type { Release, ReleaseStatus } from './types.ts';
export interface ReleaseHooks {
 snapshot:()=>Promise<string>;install:()=>Promise<void>;build:()=>Promise<void>;
 start:()=>Promise<void>;check:()=>Promise<void>;stop:()=>void;
}
/** Candidate work is isolated. The only visible pointer change is a final transaction. */
export async function runReleaseWorkflow(store:ReleaseStore,release:Release,hooks:ReleaseHooks):Promise<void> {
 const step=async(status:ReleaseStatus,action:()=>Promise<unknown>)=>{store.update(release.id,{status});store.log(release.id,status);return action();};
 try {
  const hash=await step('snapshotting',hooks.snapshot) as string;
  store.update(release.id,{sourceHash:hash});
  await step('installing',hooks.install);
  await step('building',hooks.build);
  await step('starting',hooks.start);
  await step('checking',hooks.check);
  store.db.transaction(()=>{store.update(release.id,{status:'published'});store.activate(release.projectId,release.id);})();
  store.log(release.id,'生产构建和健康检查通过，已切换版本。业务流程请按验收清单确认。');
 }catch(error) {
  hooks.stop();
  const message=error instanceof Error?error.message:String(error);
  store.update(release.id,{status:'failed',error:message.slice(-12000)});store.log(release.id,message);
 }
}
