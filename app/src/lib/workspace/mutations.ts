import { sqlite } from '@/lib/db';
import { MutationStore } from './mutation-store';
let store:MutationStore|undefined;
export class ProjectBusyError extends Error {constructor(){super('该工程正在执行其他修改，请等待完成或停止当前任务后重试');this.name='ProjectBusyError'}}
export function acquireProjectMutation(id:string,kind:string):()=>void {
 if(kind!=="generation-resume"&&sqlite.prepare("SELECT 1 FROM generation_runs WHERE project_id=? AND status='waiting'").get(id))throw new ProjectBusyError();
 store??=new MutationStore(sqlite);
 const lease=store.acquire(id,kind);if(!lease)throw new ProjectBusyError();
 const timer=setInterval(()=>store!.heartbeat(id,lease.token),5000);timer.unref();
 let released=false;
 return()=>{if(released)return;released=true;clearInterval(timer);store!.release(id,lease.token)};
}
