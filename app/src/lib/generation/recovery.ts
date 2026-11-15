import { sqlite } from '@/lib/db';
import { updateProjectStatus } from '@/lib/db/queries';
import { getProgress } from './progress';

/** 启动恢复只终结已失去工作进程的任务，不误取消其他活跃 worker。 */
export function recoverInterruptedGenerations(): string[] {
  const rows = sqlite.prepare("SELECT id, project_id AS projectId, started_at AS startedAt FROM generation_runs WHERE status='running'").all() as {id:string;projectId:string;startedAt:number}[];
  const recovered:string[]=[];
  for (const run of rows) {
    const progress = getProgress(run.id);
    if (progress) {
      try { process.kill(progress.workerPid, 0); continue; } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') continue;
      }
    } else if (Date.now() - run.startedAt < 60_000) continue;
    const result = sqlite.prepare("UPDATE generation_runs SET status='failed',error='工作进程已中断，可从当前阶段继续；已完成的文件会保留',finished_at=? WHERE id=? AND status='running'").run(Date.now(),run.id);
    if (result.changes) {updateProjectStatus(run.projectId,'error');recovered.push(run.id);}
  }
  return recovered;
}
