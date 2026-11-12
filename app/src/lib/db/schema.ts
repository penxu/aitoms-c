import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import type { GenerationStage, GenerationStatus } from "../generation/types";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  workspacePath: text("workspace_path").notNull(),
  /** null = 未分配 */
  assignedPort: integer("assigned_port"),
  /** created | generating | running | stopped | error */
  status: text("status").notNull().default("created"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const threads = sqliteTable("threads", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull(),
  projectId: text("project_id").notNull(),
  /** user | assistant | system */
  role: text("role").notNull(),
  /** UIMessage parts 序列化 JSON */
  partsJson: text("parts_json").notNull().default("[]"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const processes = sqliteTable("processes", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().unique(),
  pid: integer("pid"),
  port: integer("port").notNull(),
  /** running | stopped | crashed */
  status: text("status").notNull().default("running"),
  command: text("command").notNull().default(""),
  lastHeartbeat: integer("last_heartbeat", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  startedAt: integer("started_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  stoppedAt: integer("stopped_at", { mode: "timestamp_ms" }),
});

export const generationRuns = sqliteTable("generation_runs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  /** running | ready | failed | cancelled | interrupted */
  status: text("status").$type<GenerationStatus>().notNull(),
  /** scaffold | spec | plan | build | verify */
  stage: text("stage").$type<GenerationStage>().notNull(),
  requirement: text("requirement").notNull().default(""),
  error: text("error"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  startedAt: integer("started_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
});

export const generationEvents = sqliteTable("generation_events", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  stage: text("stage").$type<GenerationStage>().notNull(),
  /** info | warn | error | file */
  level: text("level").$type<"info" | "warn" | "error" | "file">().notNull(),
  message: text("message").notNull(),
  /** 事件负载 JSON（GenerationEventPayload） */
  payloadJson: text("payload_json"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Project = typeof projects.$inferSelect;
export type Thread = typeof threads.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type ProcessRow = typeof processes.$inferSelect;
export type GenerationRun = typeof generationRuns.$inferSelect;
export type GenerationEvent = typeof generationEvents.$inferSelect;
