import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./index";
import { generationEvents, generationRuns } from "./schema";
import type { GenerationEvent, GenerationRun } from "./schema";
import type { GenerationStage, GenerationStatus } from "../generation/types";

/**
 * 生成流水线数据访问层：run（一次生成任务）与 event（时间线事件）。
 */

export interface GenerationRunRow {
  id: string;
  projectId: string;
  status: GenerationStatus;
  stage: GenerationStage;
  requirement: string;
  error: string | null;
  inputTokens: number;
  outputTokens: number;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface GenerationEventRow {
  id: string;
  runId: string;
  stage: GenerationStage;
  level: "info" | "warn" | "error" | "file";
  message: string;
  payload: unknown;
  createdAt: Date;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8).padEnd(6, "0");
}

function toRunRow(row: GenerationRun): GenerationRunRow {
  return {
    id: row.id,
    projectId: row.projectId,
    status: row.status,
    stage: row.stage,
    requirement: row.requirement,
    error: row.error,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

function toEventRow(row: GenerationEvent): GenerationEventRow {
  let payload: unknown = null;
  if (row.payloadJson) {
    try {
      payload = JSON.parse(row.payloadJson);
    } catch {
      payload = null;
    }
  }
  return {
    id: row.id,
    runId: row.runId,
    stage: row.stage,
    level: row.level,
    message: row.message,
    payload,
    createdAt: row.createdAt,
  };
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT") return true;
  const message = error instanceof Error ? error.message : "";
  return message.includes("UNIQUE constraint failed");
}

export function createGenerationRun(input: {
  projectId: string;
  requirement: string;
  stage?: GenerationStage;
}): GenerationRunRow {
  const id = `run_${Date.now().toString(36)}${randomSuffix()}`;
  try {
    db.insert(generationRuns)
      .values({
        id,
        projectId: input.projectId,
        status: "running",
        stage: input.stage ?? "scaffold",
        requirement: input.requirement,
        error: null,
        inputTokens: 0,
        outputTokens: 0,
        startedAt: new Date(),
        finishedAt: null,
      })
      .run();
  } catch (error) {
    // 部分唯一索引 idx_runs_active 保证同一项目只有一条 running run
    if (isUniqueViolation(error)) {
      const active = getActiveGenerationRun(input.projectId);
      if (active) return active;
    }
    throw error;
  }
  const row = getGenerationRun(id);
  if (!row) throw new Error("生成任务创建失败");
  return row;
}

export function getGenerationRun(runId: string): GenerationRunRow | undefined {
  const row = db.select().from(generationRuns).where(eq(generationRuns.id, runId)).get();
  return row ? toRunRow(row) : undefined;
}

export function getActiveGenerationRun(projectId: string): GenerationRunRow | undefined {
  const row = db
    .select()
    .from(generationRuns)
    .where(and(eq(generationRuns.projectId, projectId), inArray(generationRuns.status, ["running", "waiting"])))
    .get();
  return row ? toRunRow(row) : undefined;
}

export function getLatestGenerationRun(projectId: string): GenerationRunRow | undefined {
  const row = db
    .select()
    .from(generationRuns)
    .where(eq(generationRuns.projectId, projectId))
    .orderBy(sql`started_at desc, rowid desc`)
    .limit(1)
    .get();
  return row ? toRunRow(row) : undefined;
}

export function updateGenerationRun(
  runId: string,
  patch: {
    status?: GenerationStatus;
    stage?: GenerationStage;
    error?: string | null;
    finishedAt?: Date | null;
  },
): void {
  db.update(generationRuns)
    .set({
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.stage !== undefined ? { stage: patch.stage } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
      ...(patch.finishedAt !== undefined ? { finishedAt: patch.finishedAt } : {}),
    })
    .where(eq(generationRuns.id, runId))
    .run();
}

export function addRunTokens(runId: string, usage: { input?: number; output?: number }): void {
  const input = Math.max(0, Math.round(usage.input ?? 0));
  const output = Math.max(0, Math.round(usage.output ?? 0));
  if (input === 0 && output === 0) return;
  db.update(generationRuns)
    .set({
      inputTokens: sql`${generationRuns.inputTokens} + ${input}`,
      outputTokens: sql`${generationRuns.outputTokens} + ${output}`,
    })
    .where(eq(generationRuns.id, runId))
    .run();
}

export function appendGenerationEvent(input: {
  runId: string;
  stage: GenerationStage;
  level: GenerationEventRow["level"];
  message: string;
  payload?: unknown;
}): GenerationEventRow {
  const id = `evt_${Date.now().toString(36)}${randomSuffix()}`;
  db.insert(generationEvents)
    .values({
      id,
      runId: input.runId,
      stage: input.stage,
      level: input.level,
      message: input.message,
      payloadJson: input.payload === undefined ? null : JSON.stringify(input.payload),
      createdAt: new Date(),
    })
    .run();
  const row = db.select().from(generationEvents).where(eq(generationEvents.id, id)).get();
  if (!row) throw new Error("生成事件写入失败");
  return toEventRow(row);
}

export function listGenerationEvents(runId: string): GenerationEventRow[] {
  return db
    .select()
    .from(generationEvents)
    .where(eq(generationEvents.runId, runId))
    .orderBy(sql`created_at asc, rowid asc`)
    .all()
    .map(toEventRow);
}
