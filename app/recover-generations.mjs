/** 启动多个平台worker时保留存活所有者，只恢复失去工作进程的任务。 */
export function markInterruptedGenerationRows(db, isAlive = (pid) => {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== "ESRCH"; }
}, now = Date.now()) {
  const hasProgress = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='generation_progress'").get();
  const rows = db.prepare(hasProgress
    ? "SELECT r.id,r.project_id AS projectId,r.started_at AS startedAt,p.worker_pid AS workerPid FROM generation_runs r LEFT JOIN generation_progress p ON p.run_id=r.id WHERE r.status='running'"
    : "SELECT id,project_id AS projectId,started_at AS startedAt,NULL AS workerPid FROM generation_runs WHERE status='running'").all();
  let changed = 0;
  db.transaction(() => {
    for (const run of rows) {
      if (run.workerPid && isAlive(run.workerPid)) continue;
      if (!run.workerPid && now - run.startedAt < 60000) continue;
      changed += db.prepare("UPDATE generation_runs SET status='interrupted',finished_at=?,error='工作进程已中断，可从当前阶段继续；已完成文件已保留' WHERE id=? AND status='running'").run(now,run.id).changes;
      db.prepare("UPDATE projects SET status='error' WHERE id=? AND status='generating'").run(run.projectId);
    }
  })();
  return changed;
}
