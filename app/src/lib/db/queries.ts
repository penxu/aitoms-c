import { eq, sql } from "drizzle-orm";
import { db } from "./index";
import { projects, threads, messages, processes } from "./schema";
import type { Project, ProcessRow } from "./schema";

/**
 * 数据访问层：项目 / 线程 / 消息 / 进程注册表。
 */

// ============ Projects ============

export function createProject(input: {
  id: string;
  name: string;
  description: string;
  workspacePath: string;
}): Project {
  const now = new Date();
  db.insert(projects)
    .values({
      id: input.id,
      name: input.name,
      description: input.description,
      workspacePath: input.workspacePath,
      status: "created",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const row = getProject(input.id);
  if (!row) throw new Error("项目创建失败");
  return row;
}

export function getProject(id: string): Project | undefined {
  return db.select().from(projects).where(eq(projects.id, id)).get();
}

export function listProjects(): Project[] {
  return db.select().from(projects).all();
}

export function updateProjectStatus(
  id: string,
  status: Project["status"],
  extra?: { assignedPort?: number | null },
): void {
  db.update(projects)
    .set({ status, updatedAt: new Date(), ...(extra ?? {}) })
    .where(eq(projects.id, id))
    .run();
}

// ============ Threads ============

/** 每个项目一条主线程；不存在则创建 */
export function getOrCreateMainThread(projectId: string): string {
  const existing = db
    .select()
    .from(threads)
    .where(eq(threads.projectId, projectId))
    .get();
  if (existing) return existing.id;
  const threadId = `thread_${projectId}`;
  db.insert(threads)
    .values({ id: threadId, projectId, createdAt: new Date() })
    .run();
  return threadId;
}

// ============ Messages ============

export interface StoredMessage {
  id: string;
  role: string;
  parts: unknown[];
}

export function appendMessage(input: {
  id: string;
  threadId: string;
  projectId: string;
  role: string;
  parts: unknown[];
}): void {
  db.insert(messages)
    .values({
      id: input.id,
      threadId: input.threadId,
      projectId: input.projectId,
      role: input.role,
      partsJson: JSON.stringify(input.parts),
      createdAt: new Date(),
    })
    .onConflictDoNothing()
    .run();
}

export function listThreadMessages(threadId: string): StoredMessage[] {
  const rows = db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(sql`created_at asc, rowid asc`)
    .all();
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    parts: JSON.parse(r.partsJson),
  }));
}

// ============ Processes ============

export function upsertProcess(input: {
  id: string;
  projectId: string;
  pid: number;
  port: number;
  command: string;
}): ProcessRow {
  const now = new Date();
  db.insert(processes)
    .values({
      id: input.id,
      projectId: input.projectId,
      pid: input.pid,
      port: input.port,
      status: "running",
      command: input.command,
      lastHeartbeat: now,
      startedAt: now,
      stoppedAt: null,
    })
    .onConflictDoUpdate({
      target: processes.projectId,
      set: {
        pid: input.pid,
        port: input.port,
        status: "running",
        command: input.command,
        lastHeartbeat: now,
        startedAt: now,
        stoppedAt: null,
      },
    })
    .run();
  const row = getProcessByProject(input.projectId);
  if (!row) throw new Error("进程记录写入失败");
  return row;
}

export function getProcessByProject(projectId: string): ProcessRow | undefined {
  return db
    .select()
    .from(processes)
    .where(eq(processes.projectId, projectId))
    .get();
}

export function listRunningProcesses(): ProcessRow[] {
  return db
    .select()
    .from(processes)
    .where(eq(processes.status, "running"))
    .all();
}

export function updateProcessStatus(
  projectId: string,
  status: ProcessRow["status"],
  opts?: { clearPid?: boolean },
): void {
  db.update(processes)
    .set({
      status,
      lastHeartbeat: new Date(),
      stoppedAt: status === "running" ? null : new Date(),
      ...(opts?.clearPid ? { pid: null } : {}),
    })
    .where(eq(processes.projectId, projectId))
    .run();
}

/** 平台启动时清理孤儿进程记录（数据库有记录但 pid 已不存在） */
export function cleanupOrphanProcesses(): string[] {
  const cleaned: string[] = [];
  for (const p of listRunningProcesses()) {
    let alive = false;
    if (p.pid) {
      try {
        process.kill(p.pid, 0);
        alive = true;
      } catch {
        alive = false;
      }
    }
    if (!alive) {
      updateProcessStatus(p.projectId, "stopped", { clearPid: true });
      updateProjectStatus(p.projectId, "stopped", { assignedPort: null });
      cleaned.push(p.projectId);
    }
  }
  return cleaned;
}
