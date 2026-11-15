import fs from "node:fs";
import path from "node:path";
import { config } from "@/lib/config";
import { sqlite } from "@/lib/db";
import { getProject } from "@/lib/db/queries";
import { projectRoot } from "@/lib/workspace/paths";
import { deliveryRoot } from "@/lib/releases/runtime-env";
import { stopService } from "@/lib/runner";
import { stopProduction } from "@/lib/releases/process";
import { cancelGeneration } from "@/lib/generation/pipeline";

export type DeleteProjectOutcome =
  | { ok: true; releases: number; runs: number; warnings: string[] }
  | { ok: false; reason: "not-found" | "generating" | "releasing" };

/**
 * 彻底删除一个项目：先停掉子进程与发布进程，再清数据库记录，最后删磁盘目录。
 * 与生成/发布有竞争时直接拒绝，避免删完又被流水线写回目录。
 */
export function deleteProject(projectId: string): DeleteProjectOutcome {
  let workspaceDir: string;
  try {
    workspaceDir = projectRoot(projectId);
  } catch {
    return { ok: false, reason: "not-found" };
  }

  if (!getProject(projectId)) return { ok: false, reason: "not-found" };

  // 生成任务在跑：先请求停止，让调用方稍后重试
  if (cancelGeneration(projectId)) return { ok: false, reason: "generating" };

  const pendingRelease = sqlite
    .prepare("SELECT id FROM releases WHERE project_id=? AND status NOT IN ('published','failed','interrupted') LIMIT 1")
    .get(projectId);
  if (pendingRelease) return { ok: false, reason: "releasing" };

  const ids = (sql: string) =>
    (sqlite.prepare(sql).all(projectId) as { id: string }[]).map((row) => row.id);
  const runIds = ids("SELECT id FROM generation_runs WHERE project_id=?");
  const threadIds = ids("SELECT id FROM threads WHERE project_id=?");
  const releaseIds = ids("SELECT release_id AS id FROM release_processes WHERE project_id=?");

  // 先杀进程，再删记录
  stopService(projectId);
  for (const releaseId of releaseIds) stopProduction(releaseId);

  const removeRows = sqlite.transaction(() => {
    const run = (sql: string, ...values: string[]) => sqlite.prepare(sql).run(...values);
    // 检查点、文件基线、进度表都是首次生成时才懒创建的，早期项目可能还没有这些表。
    const tryRun = (sql: string, ...values: string[]) => {
      try { run(sql, ...values); } catch { /* 表不存在，跳过 */ }
    };
    for (const threadId of threadIds) run("DELETE FROM messages WHERE thread_id=?", threadId);
    run("DELETE FROM messages WHERE project_id=?", projectId);
    run("DELETE FROM threads WHERE project_id=?", projectId);
    for (const runId of runIds) {
      run("DELETE FROM generation_events WHERE run_id=?", runId);
      tryRun("DELETE FROM generation_progress WHERE run_id=?", runId);
    }
    tryRun("DELETE FROM generation_file_checkpoints WHERE project_id=?", projectId);
    tryRun("DELETE FROM generation_file_baselines WHERE project_id=?", projectId);
    run("DELETE FROM generation_runs WHERE project_id=?", projectId);
    run("DELETE FROM release_events WHERE release_id IN (SELECT id FROM releases WHERE project_id=?)", projectId);
    run("DELETE FROM release_processes WHERE project_id=?", projectId);
    run("DELETE FROM releases WHERE project_id=?", projectId);
    run("DELETE FROM project_deployments WHERE project_id=?", projectId);
    run("DELETE FROM processes WHERE project_id=?", projectId);
    run("DELETE FROM projects WHERE id=?", projectId);
  });
  removeRows();

  // 磁盘残留必须能被调用方看到，否则用户会以为已经删干净。
  const warnings: string[] = [];
  const removeDir = (target: string, root: string) => {
    if (!safeRemove(target, root)) warnings.push(path.resolve(target));
  };
  removeDir(workspaceDir, config.workspaceRoot);
  removeDir(path.join(deliveryRoot, "releases", projectId), path.join(deliveryRoot, "releases"));
  removeDir(path.join(deliveryRoot, "runtime", projectId), path.join(deliveryRoot, "runtime"));

  return { ok: true, releases: releaseIds.length, runs: runIds.length, warnings };
}

/** 只允许删除 root 下的直接子目录，避免配错路径时误删父级 */
function safeRemove(target: string, root: string): boolean {
  const resolvedTarget = path.resolve(target);
  const resolvedRoot = path.resolve(root);
  if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    console.error("[projects] 拒绝删除越界路径", resolvedTarget);
    return false;
  }
  try {
    fs.rmSync(resolvedTarget, { recursive: true, force: true });
    return true;
  } catch (error) {
    console.error("[projects] 删除目录失败", resolvedTarget, error);
    return false;
  }
}
