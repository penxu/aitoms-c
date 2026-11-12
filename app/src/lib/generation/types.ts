/**
 * 生成流水线的共享类型：阶段、状态、角色、事件与阶段上下文。
 * 该文件只含类型与常量，不引入任何运行时依赖，前后端均可引用。
 */

const STAGES = ["scaffold", "spec", "plan", "build", "verify"] as const;

export type GenerationStage = (typeof STAGES)[number];

/** 阶段推进顺序，编排器按此顺序执行 */
export const STAGE_ORDER: GenerationStage[] = [...STAGES];

export type StageRoleId = "leader" | "pm" | "architect" | "engineer";

export interface StageRole {
  id: StageRoleId;
  name: string;
  title: string;
  duty: string;
}

/**
 * 角色化呈现（仅 UI 层映射，不入库）：
 * scaffold→leader/Mike、spec→pm/Emma、plan→architect/Bob、
 * build→engineer/Alex、verify→leader/Mike（验收）
 */
export const STAGE_ROLES: Record<GenerationStage, StageRole> = {
  scaffold: {
    id: "leader",
    name: "Mike",
    title: "Team Leader / 团队负责人",
    duty: "搭建工程骨架 / 最终验收",
  },
  spec: {
    id: "pm",
    name: "Emma",
    title: "Product Manager / 产品经理",
    duty: "把需求拆成 SPEC",
  },
  plan: {
    id: "architect",
    name: "Bob",
    title: "Architect / 架构师",
    duty: "产出文件级计划",
  },
  build: {
    id: "engineer",
    name: "Alex",
    title: "Engineer / 工程师",
    duty: "逐文件实现",
  },
  verify: {
    id: "leader",
    name: "Mike",
    title: "Team Leader / 团队负责人",
    duty: "搭建工程骨架 / 最终验收",
  },
};

export type GenerationStatus = "running" | "ready" | "failed" | "cancelled" | "interrupted";

export type GenerationEventPayload =
  | {
      type: "stage";
      stage: GenerationStage;
      status: "running" | "done" | "failed";
      durationMs?: number;
      error?: string;
    }
  | { type: "file"; path: string; status: "writing" | "done" | "failed"; error?: string }
  | { type: "log"; level: "info" | "warn" | "error"; message: string }
  | { type: "run"; status: GenerationStatus; previewUrl?: string | null };

export interface PlanItem {
  path: string;
  action: "create" | "modify";
  purpose: string;
  dependsOn: string[];
}

export interface GenerationPlan {
  pages: string[];
  items: PlanItem[];
  dataModel: { table: string; columns: string[] }[];
}

export interface StageContext {
  projectId: string;
  runId: string;
  requirement: string;
  signal: AbortSignal;
  emit: (event: GenerationEventPayload) => void;
  log: (level: "info" | "warn" | "error", message: string) => void;
  /** plan 阶段之后由 pipeline 注入；之前为 null */
  plan: GenerationPlan | null;
}

export interface StageResult {
  ok: boolean;
  error?: string;
}
