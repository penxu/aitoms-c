# 需求 → 可导出工程（阶段化流水线）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 atoms-c 平台实现「输入一句需求 → 产出通过 install/build/探活、可导出、可继续开发的 Next.js 工程」。

**Architecture:** 模板（`templates/next-base/`）解决骨架确定性，后台 job 串起 SCAFFOLD → SPEC → PLAN → BUILD → VERIFY 五个阶段；阶段产物落在项目内 `.atoms/`，每个阶段结束打一次 git commit；HTTP 只负责触发与订阅 NDJSON 事件流，客户端断开不中断 job。

**Tech Stack:** Next.js 16.4.6 / React 19 / TypeScript / Tailwind 4 / better-sqlite3 + drizzle（平台侧）/ AI SDK v7 / pnpm / archiver（导出 zip）。

**Spec:** `docs/superpowers/specs/2026-11-12-requirement-to-project-pipeline-design.md`（执行者必须同时读该文档，本计划的每条决策都来自它的第 5、6、9 节）

## Global Constraints

- 模板 `next.config.ts` 必须读 `process.env.ATOMS_BASE_PATH`（默认空）设置 `basePath`/`assetPrefix`；`runner` 启动项目时注入 `/p/{id}`。生成的应用内禁止手写绝对地址，只用 `next/link` / `useRouter`。
- 所有文件写入必须经 `resolveInsideProject`（禁止路径逃逸）；所有命令必须经 `runCommand` / `assertCommandAllowed`（禁止绕过黑名单）。
- 编排器必须是后台 job：DB 保证同一项目同时只有一条 `status='running'` 的 run（部分唯一索引）；进程重启把 running 置 `interrupted`。
- job 注册表沿用 `runner.ts` 的 `globalThis` 单例写法（避免 dev 热更新丢状态）。
- SCAFFOLD：空目录 → 拷贝；非空且无 `.atoms/` → 抛 `ScaffoldConflictError`（API 转 409，不覆盖不迁移）；有 `.atoms/` → 幂等补齐。
- 建表由模板 `lib/db/index.ts` 幂等 DDL 负责，禁止引入 `drizzle-kit push`。
- 包管理器统一 pnpm：store 在 `data/.pnpm-store`，安装参数固定 `pnpm install --prefer-offline`。
- VERIFY 复用 `runner.startService` 探活 `/api/health`，成功后保持运行，不并行启动第二个进程。
- 取消只在阶段边界与 install/build 处响应（`AbortSignal`），不细分到单次模型调用。
- PLAN 条目上限 40；VERIFY 修复最多 3 轮；SPEC/PLAN 各重试 1 次。
- 模型输出必须按纯文本/JSON 解析后校验，不得直接执行模型给的命令。
- 不引入新的测试框架：纯函数用 Node 内置 `node --experimental-strip-types --test`（Node 22.19 已验证可用，无新依赖），端到端用 curl。
- 对话、注释、提交信息用简体中文。

## Review Focus

1. **需求过于模糊**（如「做个网站」）：SPEC 校验失败后应给出可解释的失败原因并保留已生成产物，而不是抛出未捕获异常或产出空工程。
2. **目录已有历史 chat 文件且无 `.atoms/`**：必须返回 409 且不改动任何文件（覆盖即毁掉用户已有成果）。
3. **模型输出不合法**（JSON 带围栏、路径写成 `/etc/passwd`、条目超限、缺少 `app/page.tsx`）：PLAN 校验必须拒绝并降级为最小计划，且降级后仍能跑通 BUILD。
4. **install/build 卡死或用户取消**：必须连同子进程组一起终止，run 落 `cancelled`，已写文件保留可续跑。
5. **导出包内容错配**：zip 必须含 `.git` 与 `.atoms/`、排除 `node_modules`/`.next`，解压后 `pnpm install && pnpm dev` 能直接跑。

---

## 文件结构（先锁定边界）

**新增**

| 路径 | 职责 |
|---|---|
| `templates/next-base/**` | 模板工程（见 Task 2/3） |
| `app/src/lib/generation/types.ts` | 阶段名、run 状态、事件联合类型、`StageContext`、`GenerationPlan` |
| `app/src/lib/generation/git.ts` | `ensureGitRepo` / `commitAll` |
| `app/src/lib/generation/scaffold.ts` | 模板拷贝、哈希、node_modules 缓存、冲突判定 |
| `app/src/lib/generation/plan-schema.ts` | PLAN 校验与最小计划（纯函数，可单测） |
| `app/src/lib/generation/spec-schema.ts` | SPEC.md 校验（纯函数，可单测） |
| `app/src/lib/generation/events.ts` | 事件落库 + 进程内订阅总线 |
| `app/src/lib/generation/prompts.ts` | 各阶段提示词与用户消息拼装 |
| `app/src/lib/generation/stages/{spec,plan,build,verify}.ts` | 单阶段实现 |
| `app/src/lib/generation/pipeline.ts` | 编排器、job 注册表、取消、续跑 |
| `app/src/lib/ai/model.ts` | 统一 OpenAI provider 与按用途取模型 |
| `app/src/lib/db/generation.ts` | run / event 数据访问 |
| `app/src/app/api/projects/[id]/generate/route.ts` | 触发 + NDJSON 订阅 + 取消 |
| `app/src/app/api/projects/[id]/generation/route.ts` | 状态与历史事件 |
| `app/src/app/api/projects/[id]/export/route.ts` | zip 导出 |
| `app/src/components/workspace/generation-timeline.tsx` | 生成时间线 UI |

**修改**

`app/src/lib/db/schema.ts`、`app/src/lib/db/index.ts`（DDL）、`app/src/lib/config.ts`、`app/src/lib/workspace/command.ts`（AbortSignal）、`app/src/lib/runner.ts`（pnpm + basePath）、`app/src/lib/ai/tools.ts`（系统提示词 + `initialQuery` 相关无改动）、`app/src/components/workspace/workspace.tsx`、`app/src/components/workspace/chat-panel.tsx`、`app/server.mjs`（启动时置 interrupted）。

---

### Task 1: 数据层与共享类型

**Files:**
- Create: `app/src/lib/generation/types.ts`
- Modify: `app/src/lib/db/schema.ts`（追加两张表与类型导出）
- Modify: `app/src/lib/db/index.ts:19-60`（DDL 追加两张表与索引）
- Create: `app/src/lib/db/generation.ts`

**Interfaces（后续任务依赖，签名不可改）:**

```ts
// generation/types.ts
export type GenerationStage = "scaffold" | "spec" | "plan" | "build" | "verify";
export const STAGE_ORDER: GenerationStage[];
export type StageRoleId = "leader" | "pm" | "architect" | "engineer";
export interface StageRole { id: StageRoleId; name: string; title: string; duty: string }
export const STAGE_ROLES: Record<GenerationStage, StageRole>;
// 角色化呈现（仅 UI 层，不入库）：scaffold→leader/Mike、spec→pm/Emma、
// plan→architect/Bob、build→engineer/Alex、verify→leader/Mike（验收）
export type GenerationStatus = "running" | "ready" | "failed" | "cancelled" | "interrupted";
export type GenerationEventPayload =
  | { type: "stage"; stage: GenerationStage; status: "running" | "done" | "failed"; durationMs?: number; error?: string }
  | { type: "file"; path: string; status: "writing" | "done" | "failed"; error?: string }
  | { type: "log"; level: "info" | "warn" | "error"; message: string }
  | { type: "run"; status: GenerationStatus; previewUrl?: string | null };
export interface PlanItem { path: string; action: "create" | "modify"; purpose: string; dependsOn: string[] }
export interface GenerationPlan { pages: string[]; items: PlanItem[]; dataModel: { table: string; columns: string[] }[] }
export interface StageContext {
  projectId: string; runId: string; requirement: string; signal: AbortSignal;
  emit: (event: GenerationEventPayload) => void;
  log: (level: "info" | "warn" | "error", message: string) => void;
  plan: GenerationPlan | null; // plan 阶段之后由 pipeline 注入
}
export interface StageResult { ok: boolean; error?: string }

// db/generation.ts
export interface GenerationRunRow {
  id: string; projectId: string; status: GenerationStatus; stage: GenerationStage;
  requirement: string; error: string | null; inputTokens: number; outputTokens: number;
  startedAt: Date; finishedAt: Date | null;
}
export interface GenerationEventRow {
  id: string; runId: string; stage: GenerationStage;
  level: "info" | "warn" | "error" | "file"; message: string; payload: unknown; createdAt: Date;
}
export function createGenerationRun(input: { projectId: string; requirement: string; stage?: GenerationStage }): GenerationRunRow;
export function getGenerationRun(runId: string): GenerationRunRow | undefined;
export function getActiveGenerationRun(projectId: string): GenerationRunRow | undefined;
export function getLatestGenerationRun(projectId: string): GenerationRunRow | undefined;
export function updateGenerationRun(runId: string, patch: { status?: GenerationStatus; stage?: GenerationStage; error?: string | null; finishedAt?: Date | null }): void;
export function addRunTokens(runId: string, usage: { input?: number; output?: number }): void;
export function appendGenerationEvent(input: { runId: string; stage: GenerationStage; level: GenerationEventRow["level"]; message: string; payload?: unknown }): GenerationEventRow;
export function listGenerationEvents(runId: string): GenerationEventRow[];
```

- [ ] **Step 1: 在 `types.ts` 写出上述类型**（`STAGE_ORDER` 用 `["scaffold","spec","plan","build","verify"] as const` 派生）

`STAGE_ROLES` 取值固定为：`leader = { name:"Mike", title:"Team Leader", duty:"搭建工程骨架 / 最终验收" }`、`pm = { name:"Emma", title:"Product Manager", duty:"把需求拆成 SPEC" }`、`architect = { name:"Bob", title:"Architect", duty:"产出文件级计划" }`、`engineer = { name:"Alex", title:"Engineer", duty:"逐文件实现" }`（中文 title 同时给出：团队负责人 / 产品经理 / 架构师 / 工程师）。

- [ ] **Step 2: 在 `schema.ts` 追加两张表**

字段与 DDL 一一对应；`generation_runs` 额外含 `requirement`、`inputTokens`、`outputTokens`（验收标准 8 要求记录 token 消耗，spec 5.9 的原表缺这两列）。

- [ ] **Step 3: 在 `db/index.ts` 的 `DDL` 末尾追加**

```sql
CREATE TABLE IF NOT EXISTS generation_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  requirement TEXT NOT NULL DEFAULT '',
  error TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_active ON generation_runs(project_id) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_runs_project ON generation_runs(project_id, started_at);
CREATE TABLE IF NOT EXISTS generation_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  payload_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_run ON generation_events(run_id, created_at);
```

- [ ] **Step 4: 实现 `db/generation.ts`**

要点：`createGenerationRun` 在部分唯一索引冲突时（`SQLITE_CONSTRAINT_UNIQUE`）捕获错误并返回 `getActiveGenerationRun(projectId)`；`listGenerationEvents` 按 `created_at asc, rowid asc`；事件 id 用 `evt_${Date.now().toString(36)}${随机 6 位}`。

- [ ] **Step 5: 验证**

Run: `cd app && pnpm typecheck && pnpm lint`
Expected: 两条命令均 0 错误。

Run（启动一次服务让 DDL 生效后检查）: `cd app && (pnpm dev > /tmp/atoms-dev.log 2>&1 &) ; sleep 20 ; sqlite3 ../data/atoms.db ".schema generation_runs"`
Expected: 输出包含 `input_tokens`、`output_tokens` 与 `idx_runs_active`。

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/generation/types.ts app/src/lib/db/schema.ts app/src/lib/db/index.ts app/src/lib/db/generation.ts
git commit -m "feat(db): 新增生成流水线的 run / event 表与访问层"
```

---

### Task 2: 模板骨架（可 install、可 build）

**Files（全部新建于 `templates/next-base/`）:**
- Create: `package.json`、`next.config.ts`、`tsconfig.json`、`postcss.config.mjs`、`.gitignore`
- Create: `app/layout.tsx`、`app/page.tsx`、`app/globals.css`、`app/api/health/route.ts`

**Interfaces:**
- Produces: 可被 `scaffoldProject` 整目录拷贝的模板根；`GET /api/health` → `{"ok":true}`；`basePath` 由 `ATOMS_BASE_PATH` 控制。

- [ ] **Step 1: 写 `package.json`**

```json
{
  "name": "atoms-app",
  "private": true,
  "version": "0.1.0",
  "scripts": { "dev": "next dev", "build": "next build", "start": "next start" },
  "dependencies": {
    "better-sqlite3": "13.1.1",
    "class-variance-authority": "0.7.1",
    "clsx": "2.1.1",
    "next": "16.4.6",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "tailwind-merge": "2.6.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "4.3.3",
    "@types/better-sqlite3": "9.6.0",
    "@types/node": "20.19.0",
    "@types/react": "19.0.0",
    "@types/react-dom": "19.0.0",
    "tailwindcss": "4.3.3",
    "typescript": "5.9.3"
  }
}
```

- [ ] **Step 2: 写 `next.config.ts`（子路径契约，spec 9.1）**

```ts
import type { NextConfig } from "next";

const basePath = process.env.ATOMS_BASE_PATH || "";
const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  ...(basePath ? { basePath, assetPrefix: `${basePath}/` } : {}),
};

export default nextConfig;
```

- [ ] **Step 3: 写 `tsconfig.json` / `postcss.config.mjs` / `.gitignore`**

`tsconfig.json`：`next` 默认配置 + `"paths": { "@/*": ["./*"] }`（注意模板根就是源码根，别名指 `./*` 而非 `./src/*`）。
`postcss.config.mjs`：`export default { plugins: { "@tailwindcss/postcss": {} } };`
`.gitignore`：`node_modules/`、`.next/`、`*.db`、`*.db-shm`、`*.db-wal`、`.DS_Store`。

- [ ] **Step 4: 写 `app/layout.tsx` / `app/globals.css` / `app/page.tsx`**

`globals.css` 首行 `@import "tailwindcss";`，定义 `--background`、`--foreground` 两个 CSS 变量与 `body` 基础样式。
`layout.tsx` 导出 `metadata = { title: "Atoms App" }`，`<html lang="zh-CN">`，`<body className="antialiased">`。
`page.tsx` 是占位首页（一句话标题 + 说明该文件将被 AI 覆盖），不含任何绝对链接。

- [ ] **Step 5: 写 `app/api/health/route.ts`**

```ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true });
}
```

（Task 3 会把它改为在返回前触碰一次数据库连接，让 DDL 在首次请求时执行。）

- [ ] **Step 6: 验证模板独立可构建**

Run:
```bash
rm -rf /tmp/tpl && cp -R templates/next-base /tmp/tpl && cd /tmp/tpl && pnpm install && pnpm build
```
Expected: `pnpm build` 退出码 0，输出包含 `Compiled successfully` 或路由表（含 `/api/health`）。

- [ ] **Step 7: Commit**

```bash
git add templates/next-base
git commit -m "feat(template): 新增 next-base 模板骨架与 health 端点"
```

---

### Task 3: 模板数据层、UI 组件与约定文档

**Files:**
- Create: `templates/next-base/lib/utils.ts`（`cn` = clsx + tailwind-merge）
- Create: `templates/next-base/lib/db/index.ts`、`templates/next-base/lib/db/schema.ts`
- Create: `templates/next-base/components/ui/{button,card,input}.tsx`
- Create: `templates/next-base/.atoms/CONVENTIONS.md`
- Modify: `templates/next-base/app/api/health/route.ts`、`templates/next-base/app/page.tsx`（改用 UI 组件）

**Interfaces:**
- Produces: `getDb(): Database.Database`（单例，WAL）；`DDL: string[]`；`export const TABLES`（表名常量）；`<Button variant="default|outline|ghost">`、`<Card>/<CardHeader>/<CardTitle>/<CardContent>`、`<Input>`。

- [ ] **Step 1: 写 `lib/db/index.ts`（spec 9.4：幂等 DDL）**

```ts
import Database from "better-sqlite3";
import path from "node:path";

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
const DDL: string[] = [
  // BUILD 阶段新增表时，把对应 CREATE TABLE IF NOT EXISTS 追加到这里
];

declare global {
  var __appDb: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (globalThis.__appDb) return globalThis.__appDb;
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  for (const stmt of DDL) db.exec(stmt);
  globalThis.__appDb = db;
  return db;
}
```

`lib/db/schema.ts` 只导出 `export const TABLES = {} as const;` 并注明「表结构以 `lib/db/index.ts` 的 DDL 为准，此处仅登记表名」；`getDb` 调用前需 `fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })`。

- [ ] **Step 2: 写三个 UI 组件**

用 `cva` 定义 `buttonVariants`（`default` 蓝底白字 / `outline` 描边 / `ghost` 无边框，尺寸 `sm|md|lg`），`Button` 接受 `React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>`。`Card` 系列是纯 `div` 组合（`rounded-2xl border bg-white`）。`Input` 是受控 `input` 的薄封装。

- [ ] **Step 3: 改写 `app/page.tsx` 使用 Button/Card/Input，并改写 health 路由**

health 路由在 `GET` 内调用 `getDb()`（触发建表）后返回 `{ ok: true }`。

- [ ] **Step 4: 写 `.atoms/CONVENTIONS.md`**

内容固定为四条：①目录分层 `app/`（路由与页面）、`components/ui`（基础组件）、`components/<feature>`（业务组件）、`lib/`（纯逻辑与数据访问）；②所有跳转用 `next/link` + `useRouter`，禁止手写 `/` 开头的绝对地址（子路径部署）；③数据访问只经 `lib/db`，新表在 `lib/db/index.ts` 的 `DDL` 数组追加幂等建表语句并在 `schema.ts` 登记表名；④组件默认 `"use client"` 仅在有交互时添加。

- [ ] **Step 5: 验证**

Run:
```bash
rm -rf /tmp/tpl && cp -R templates/next-base /tmp/tpl && cd /tmp/tpl && pnpm install && pnpm build
```
Expected: 构建通过。

Run:
```bash
cd /tmp/tpl && (pnpm dev -p 4123 > /tmp/tpl-dev.log 2>&1 &) ; sleep 15 ; curl -s localhost:4123/api/health ; curl -s -o /dev/null -w "%{http_code}" localhost:4123/
```
Expected: `{"ok":true}` 与 `200`；`/tmp/tpl/data/app.db` 已生成。

- [ ] **Step 6: Commit**

```bash
git add templates/next-base
git commit -m "feat(template): 数据层、基础 UI 组件与分层约定"
```

---

### Task 4: 模板配置项 + SCAFFOLD 阶段

**Files:**
- Modify: `app/src/lib/config.ts`（追加 3 个配置）
- Create: `app/src/lib/generation/git.ts`
- Create: `app/src/lib/generation/scaffold.ts`

**Interfaces:**
- Consumes: `runCommand`（`@/lib/workspace/command`）、`ensureProjectRoot` / `projectRoot`（`@/lib/workspace/paths`）。
- Produces:
```ts
export class ScaffoldConflictError extends Error { constructor(projectId: string) }
export interface ScaffoldResult { action: "copied" | "merged" | "skipped"; filesWritten: number }
export function templateHash(): string;            // sha256(templates/next-base/package.json) 前 16 位
export function listTemplateFiles(): string[];     // 相对路径，排除 node_modules/.next/.git
export async function scaffoldProject(projectId: string): Promise<ScaffoldResult>
export function hasNodeModulesCache(): boolean;
export async function restoreNodeModulesCache(projectId: string): Promise<boolean>;
export async function saveNodeModulesCache(projectId: string): Promise<void>;
// git.ts
export async function ensureGitRepo(projectId: string): Promise<void>;
export async function commitAll(projectId: string, message: string): Promise<boolean>;
```

- [ ] **Step 1: 扩展 `config.ts`**

```ts
templateRoot: process.env.TEMPLATE_ROOT ? path.resolve(process.env.TEMPLATE_ROOT) : path.resolve(process.cwd(), "..", "templates"),
templateCacheRoot: process.env.TEMPLATE_CACHE_ROOT ? path.resolve(process.env.TEMPLATE_CACHE_ROOT) : path.resolve(process.cwd(), "..", "data", ".template-cache"),
pnpmStoreDir: process.env.PNPM_STORE_DIR ? path.resolve(process.env.PNPM_STORE_DIR) : path.resolve(process.cwd(), "..", "data", ".pnpm-store"),
```

- [ ] **Step 2: 写 `git.ts`**

`ensureGitRepo`：若项目根无 `.git`，执行 `git init -q`，并 `git config user.name "Atoms"` / `git config user.email "atoms@local"`（只写项目级配置，不改全局配置）。
`commitAll`：`git add -A` → `git diff --cached --quiet` 为 0 时返回 `false` → 否则 `git commit -q -m "<message>"` 返回 `true`。全部经 `runCommand(projectId, ...)`。

- [ ] **Step 3: 写 `scaffold.ts` 的冲突判定与拷贝**

`scaffoldProject` 逻辑（spec 9.3）：
1. `root = ensureProjectRoot(projectId)`；`entries = fs.readdirSync(root).filter(n => n !== ".git")`。
2. 非空且无 `.atoms/` → `throw new ScaffoldConflictError(projectId)`。
3. 空目录 → `action="copied"`；有 `.atoms/` → `action="merged"`。
4. 逐文件拷贝 `listTemplateFiles()`，已存在则跳过（不覆盖用户/AI 已有内容），统计 `filesWritten`；`action="skipped"` 仅当 `filesWritten === 0`。
5. 拷贝完成后 `ensureGitRepo` + `commitAll(projectId, "chore: 初始化工程骨架")`。
6. 若 `hasNodeModulesCache()` 且项目无 `node_modules` → `restoreNodeModulesCache`。

- [ ] **Step 4: 实现 node_modules 缓存（spec 5.7）**

缓存目录 `path.join(config.templateCacheRoot, templateHash())`。
`restoreNodeModulesCache`：目录存在时执行 `cp -al "<cacheDir>/node_modules" "<root>/node_modules"`（失败则回退 `cp -a`）。`saveNodeModulesCache`：项目存在 `node_modules` 且缓存不存在时 `mkdir -p` 后 `cp -al` 快照。命令统一带 `timeoutMs: 120_000`。

- [ ] **Step 5: 验证**

Run: `cd app && pnpm typecheck && pnpm lint`
Expected: 0 错误。运行期验证由 Task 10 的 curl 端到端覆盖（`POST /generate` 后检查项目目录含 `package.json`、`.atoms/` 与 `.git`）。

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/config.ts app/src/lib/generation/git.ts app/src/lib/generation/scaffold.ts
git commit -m "feat(generation): 模板拷贝、node_modules 缓存与 git 提交"
```

---

### Task 5: 模型接入 + SPEC 阶段

**Files:**
- Modify: `app/src/lib/config.ts`（追加模型配置）
- Create: `app/src/lib/ai/model.ts`
- Modify: `app/src/app/api/chat/route.ts:1-13,41-47`（改用 `getModel("chat")`）
- Create: `app/src/lib/generation/spec-schema.ts`、`app/src/lib/generation/spec-schema.test.ts`
- Create: `app/src/lib/generation/prompts.ts`（本任务只写 SPEC 部分，后续任务追加）
- Create: `app/src/lib/generation/stages/spec.ts`
- Modify: `app/tsconfig.json`（`"allowImportingTsExtensions": true`）
- Modify: `app/package.json`（`"test:unit": "node --experimental-strip-types --test src/lib/generation/*.test.ts"`）

**Interfaces:**
- Produces:
```ts
// ai/model.ts
export type ModelKind = "chat" | "spec" | "plan" | "build" | "repair";
export function getModel(kind: ModelKind): LanguageModel;   // provider baseURL = OPENAI_BASE_URL，apiKey = OPENAI_API_KEY
// spec-schema.ts（纯函数，零运行时依赖）
export interface SpecValidation { ok: boolean; errors: string[] }
export function validateSpec(markdown: string): SpecValidation;
// prompts.ts
export const SPEC_SYSTEM_PROMPT: string;
export function specUserPrompt(requirement: string): string;
// stages/spec.ts
export async function runSpecStage(ctx: StageContext): Promise<StageResult>;
```

- [ ] **Step 1: 写失败的测试 `spec-schema.test.ts`**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSpec } from "./spec-schema.ts";

const GOOD = `# 需求规格
## 目标
做一个宠物美容预约网站，用户可以查看服务并提交预约。
## 页面
- / 首页：服务介绍
- /booking 预约表单
## 数据模型
- appointments(id, name, phone, service, created_at)
## 非目标
- 不做在线支付
`;

test("完整 SPEC 通过校验", () => {
  assert.deepEqual(validateSpec(GOOD), { ok: true, errors: [] });
});

test("缺少页面段落时失败", () => {
  const r = validateSpec(GOOD.replace("## 页面", "## 页面清单"));
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /页面/);
});

test("缺少数据模型段落时失败", () => {
  const r = validateSpec(GOOD.replace("## 数据模型", "## 表"));
  assert.equal(r.ok, false);
});

test("过短内容失败", () => {
  assert.equal(validateSpec("## 页面\n## 数据模型").ok, false);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd app && pnpm test:unit`
Expected: FAIL，报 `Cannot find module './spec-schema.ts'`。

- [ ] **Step 3: 实现 `spec-schema.ts`**

`validateSpec`：要求长度 ≥ 200 字符；必须包含标题行 `## 页面` 与 `## 数据模型`（允许 `## 页面` 后带内容）；不满足时把原因写入 `errors`（中文描述，供前端与日志展示）。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd app && pnpm test:unit`
Expected: 4 个测试全部 pass。

- [ ] **Step 5: 写 `ai/model.ts` 并改造 chat 路由**

`getModel` 用模块级单例 `createOpenAI({ baseURL: process.env.OPENAI_BASE_URL, apiKey: process.env.OPENAI_API_KEY })`；模型名取 `config[kind === "chat" ? "chatModel" : `${kind}Model`]`。config 追加 `specModel`/`planModel`/`buildModel`/`repairModel`，默认值分别为 `process.env.SPEC_MODEL ?? "gpt-4o"`、`PLAN_MODEL ?? "gpt-4o"`、`BUILD_MODEL ?? "gpt-4o-mini"`、`REPAIR_MODEL ?? "gpt-4o"`。
chat 路由删除本地 provider，改 `model: getModel("chat")`。

- [ ] **Step 6: 写 `prompts.ts` 的 SPEC 部分 + `stages/spec.ts`**

`SPEC_SYSTEM_PROMPT` 要求：只输出 Markdown，固定四段标题 `## 目标` `## 页面` `## 数据模型` `## 非目标`；页面必须给出路由路径；数据模型必须给出表名与列名（SQLite 类型）；不要输出代码块。
`runSpecStage`：
1. `emit({type:"file", path:".atoms/SPEC.md", status:"writing"})`。
2. 调 `generateText({ model: getModel("spec"), system: SPEC_SYSTEM_PROMPT, prompt: specUserPrompt(requirement), temperature: 0.2 })`；`addRunTokens(ctx.runId, usage)`。
3. `validateSpec(text)` 失败 → 重试 1 次（同一提示词加一句「上一版缺少：<errors>」）。
4. 通过 → `writeFile(projectId, ".atoms/SPEC.md", text)`，`emit` 状态 `done`，返回 `{ok:true}`；两次都失败 → `{ok:false, error: "需求过于模糊：<errors>"}`。
5. 每步前检查 `ctx.signal.aborted`，中止时返回 `{ok:false, error:"cancelled"}`。

- [ ] **Step 7: 验证**

Run: `cd app && pnpm test:unit && pnpm typecheck && pnpm lint`
Expected: 全部通过。

- [ ] **Step 8: Commit**

```bash
git add app/src/lib/ai/model.ts app/src/lib/config.ts app/src/app/api/chat/route.ts \
  app/src/lib/generation/spec-schema.ts app/src/lib/generation/spec-schema.test.ts \
  app/src/lib/generation/prompts.ts app/src/lib/generation/stages/spec.ts \
  app/tsconfig.json app/package.json
git commit -m "feat(generation): 模型接入与 SPEC 阶段"
```

---

### Task 6: PLAN 阶段（校验 + 最小计划降级）

**Files:**
- Create: `app/src/lib/generation/plan-schema.ts`、`app/src/lib/generation/plan-schema.test.ts`
- Modify: `app/src/lib/generation/types.ts`（`StageResult` 增加 `plan?: GenerationPlan`）
- Modify: `app/src/lib/generation/prompts.ts`（追加 `PLAN_SYSTEM_PROMPT`、`planUserPrompt(spec, templateFiles)`）
- Create: `app/src/lib/generation/stages/plan.ts`

**Interfaces:**
- Consumes: `listTemplateFiles()`（Task 4）、`validateSpec` 产出的 `.atoms/SPEC.md`。
- Produces:
```ts
export const MAX_PLAN_ITEMS = 40;
export interface PlanValidation { ok: boolean; errors: string[] }
export function validatePlan(plan: unknown, templateFiles: string[]): PlanValidation;
export const MINIMAL_PLAN: GenerationPlan;   // 只含 { path: "app/page.tsx", action: "modify" }
export const PLAN_JSON_PATH = ".atoms/PLAN.json";
export async function runPlanStage(ctx: StageContext): Promise<StageResult>;  // 成功时 StageResult.plan 为校验后的计划
```

- [ ] **Step 1: 写失败的测试 `plan-schema.test.ts`**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { MINIMAL_PLAN, validatePlan } from "./plan-schema.ts";

const FILES = ["app/page.tsx", "lib/db/index.ts", "components/ui/button.tsx"];
const BASE = {
  pages: ["/"],
  items: [
    { path: "app/page.tsx", action: "modify", purpose: "首页", dependsOn: [] },
    { path: "components/site/hero.tsx", action: "create", purpose: "首屏", dependsOn: ["components/ui/button.tsx"] },
  ],
  dataModel: [],
};

test("合法计划通过", () => {
  assert.deepEqual(validatePlan(BASE, FILES), { ok: true, errors: [] });
});

test("路径逃逸被拒绝", () => {
  for (const bad of ["/etc/passwd", "../../secret.ts", "app/../x.ts"]) {
    const plan = { ...BASE, items: [{ ...BASE.items[0], path: bad }] };
    assert.equal(validatePlan(plan, FILES).ok, false, bad);
  }
});

test("缺少 app/page.tsx 被拒绝", () => {
  assert.equal(validatePlan({ ...BASE, items: [BASE.items[1]] }, FILES).ok, false);
});

test("条目超过 40 被拒绝", () => {
  const items = Array.from({ length: 41 }, (_, i) => ({ path: `components/x${i}.tsx`, action: "create", purpose: "x", dependsOn: [] }));
  assert.equal(validatePlan({ ...BASE, items }, FILES).ok, false);
});

test("有数据模型但未声明 lib/db/index.ts 被拒绝", () => {
  const plan = { ...BASE, dataModel: [{ table: "leads", columns: ["id", "email"] }] };
  assert.equal(validatePlan(plan, FILES).ok, false);
});

test("非对象或空页面被拒绝后可用最小计划", () => {
  assert.equal(validatePlan("nope", FILES).ok, false);
  assert.equal(validatePlan({ pages: [], items: [] }, FILES).ok, false);
  assert.equal(validatePlan(MINIMAL_PLAN, FILES).ok, true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd app && pnpm test:unit`
Expected: FAIL，`Cannot find module './plan-schema.ts'`。

- [ ] **Step 3: 实现 `plan-schema.ts`**

校验规则（每条写入 `errors`，最多收集 8 条）：plan 为对象且 `pages` 是 1–12 个以 `/` 开头的字符串；`items` 是数组且长度 ≤ `MAX_PLAN_ITEMS`；每项 `path` 匹配 `/^[A-Za-z0-9._@[\]/-]+$/`、不以 `/` 开头、不含 `..`、不等于 `.atoms/PLAN.json`；`action ∈ {create, modify}`；`dependsOn` 的每一项必须是模板文件或本计划中前面的条目；`items` 必须包含 `app/page.tsx`；`dataModel` 非空时必须包含 `lib/db/index.ts`。路径规则导出为 `export function isSafePlanPath(p: string): boolean`（BUILD / VERIFY 复用）。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd app && pnpm test:unit`
Expected: 全部 pass。

- [ ] **Step 5: 实现 `stages/plan.ts`**

1. 读 `.atoms/SPEC.md`（`readFile`），读 `listTemplateFiles()`。
2. `generateObject({ model: getModel("plan"), schema: zodPlanSchema, system: PLAN_SYSTEM_PROMPT, prompt: planUserPrompt(spec, templateFiles), temperature: 0.2 })`，`addRunTokens`。
3. `validatePlan(object, templateFiles)`；失败则带 `errors` 重试 1 次；仍失败 → 用 `MINIMAL_PLAN` 并 `log("warn", "计划校验失败，已降级为最小计划：…")`。
4. 通过 → `writeFile(ctx.projectId, PLAN_JSON_PATH, JSON.stringify(plan, null, 2))`，`emit` 文件事件，返回 `{ ok: true, plan }`。
5. `PLAN_SYSTEM_PROMPT` 必须写明：只输出 JSON；`items` 按依赖顺序排列；页面文件路径必须是 `app/**/page.tsx`；组件拆到 `components/<feature>/`；任何新增表都必须包含 `lib/db/index.ts` 条目；总量控制在 3–12 个文件。

- [ ] **Step 6: 验证**

Run: `cd app && pnpm test:unit && pnpm typecheck && pnpm lint`
Expected: 全部通过。

- [ ] **Step 7: Commit**

```bash
git add app/src/lib/generation/plan-schema.ts app/src/lib/generation/plan-schema.test.ts \
  app/src/lib/generation/types.ts app/src/lib/generation/prompts.ts app/src/lib/generation/stages/plan.ts
git commit -m "feat(generation): PLAN 阶段与计划校验降级"
```

---

### Task 7: BUILD 阶段（逐文件生成）

**Files:**
- Modify: `app/src/lib/generation/prompts.ts`（追加 `BUILD_SYSTEM_PROMPT`、`buildFilePrompt(input)`）
- Create: `app/src/lib/generation/stages/build.ts`

**Interfaces:**
- Consumes: `ctx.plan`（Task 6）、`isSafePlanPath`、`readFile` / `writeFile`（平台工具层）、`resolveInsideProject`。
- Produces:
```ts
export async function runBuildStage(ctx: StageContext): Promise<StageResult>;  // 全部条目尝试完才返回；失败条目计入 error 文案
export function stripCodeFence(text: string): string;  // 去掉 ```tsx / ``` 包裹
export function writeFileAtomic(projectId: string, relPath: string, content: string): void;
```

- [ ] **Step 1: 写 `writeFileAtomic`**

`const abs = resolveInsideProject(projectId, relPath, { allowMissing: true })` → `fs.mkdirSync(dirname)` → 写 `${abs}.atoms-tmp` → `fs.renameSync(tmp, abs)`。路径不安全时由 `resolveInsideProject` 抛 `PathEscapeError`。

- [ ] **Step 2: 写 `runBuildStage`**

对 `ctx.plan.items` 逐项执行（顺序即依赖顺序）：
1. 检查 `ctx.signal.aborted` → 返回 `{ ok:false, error:"cancelled" }`。
2. `emit({type:"file", path:item.path, status:"writing"})`。
3. 拼上下文：`.atoms/SPEC.md` 全文（超 6000 字符截断）、`.atoms/CONVENTIONS.md` 全文、`item.dependsOn` 中已存在文件的内容（每个截断 4000 字符，总量上限 `config.maxToolOutputChars`）、`item.action === "modify"` 时附当前文件内容。
4. `generateText({ model: getModel("build"), system: BUILD_SYSTEM_PROMPT, prompt: buildFilePrompt(...), temperature: 0.3 })`；`addRunTokens`。
5. `stripCodeFence(text)` 后 `writeFileAtomic`；成功 `emit done`，失败重试 1 次（共 2 次），仍失败 `emit({status:"failed", error})` 并累计到 `failures`。
6. 全部结束：有失败 → `{ ok:false, error: `以下文件写入失败：${failures.join(", ")}` }`；否则 `{ ok:true }`。

`BUILD_SYSTEM_PROMPT` 必须写明：只输出文件内容，不要解释、不要 Markdown 围栏；遵循 `.atoms/CONVENTIONS.md`；页面跳转用 `next/link`；`input/output` 走 shadcn 风格组件；新增表时在 `lib/db/index.ts` 的 `DDL` 数组追加幂等 `CREATE TABLE IF NOT EXISTS`，并使用 `getDb()` 访问。

- [ ] **Step 3: 验证（类型与静态检查）**

Run: `cd app && pnpm typecheck && pnpm lint && pnpm test:unit`
Expected: 全部通过。运行期验证由 Task 10 的端到端 curl 覆盖（检查 `app/page.tsx` 文件内容长度 > 0 且不再等于模板占位文案）。

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/generation/prompts.ts app/src/lib/generation/stages/build.ts
git commit -m "feat(generation): BUILD 阶段逐文件生成与原子写入"
```

---

### Task 8: VERIFY 阶段 + 运行时改造

**Files:**
- Modify: `app/src/lib/workspace/command.ts:24-98`（支持 `signal`，新增 `aborted` 字段）
- Modify: `app/src/lib/runner.ts:55-84,102-107`（pnpm 识别 + `ATOMS_BASE_PATH` 注入）
- Modify: `app/src/lib/generation/prompts.ts`（追加 `REPAIR_SYSTEM_PROMPT`）
- Create: `app/src/lib/generation/stages/verify.ts`

**Interfaces:**
- Consumes: `runCommand`、`startService` / `getRuntimePort`、`restoreNodeModulesCache` / `saveNodeModulesCache`、`isSafePlanPath`。
- Produces:
```ts
export interface CommandResult { stdout: string; stderr: string; exitCode: number | null; timedOut: boolean; aborted: boolean }
export async function waitForHealth(port: number, timeoutMs?: number): Promise<boolean>;  // 默认 60_000，每 1s GET /api/health
export async function runVerifyStage(ctx: StageContext): Promise<StageResult>;
```

- [ ] **Step 1: 给 `runCommand` 加取消能力**

`opts` 增加 `signal?: AbortSignal`；`signal.aborted` 时直接 resolve `{ exitCode: null, timedOut: false, aborted: true }`；`signal.addEventListener("abort")` → 先 `process.kill(-pid, "SIGTERM")`，3 秒后仍存活则 `SIGKILL`；`aborted = true`。`CommandResult` 增加 `aborted: boolean`，所有返回分支都带上。

- [ ] **Step 2: 改造 `runner.ts`**

新增 `function packageManager(root: string): "pnpm" | "npm"`（存在 `pnpm-lock.yaml` 用 pnpm）。`buildStartCommand` 的 next 分支改为：
```ts
const pm = packageManager(root);
if (deps.next && scripts.dev) return `${pm} run dev -- -p ${port} -H 127.0.0.1`;
```
其他分支把 `npm` 换成 `${pm}`。`spawn` 的 `env` 增加 `ATOMS_BASE_PATH: \`/p/${projectId}\``。

- [ ] **Step 3: 写 `waitForHealth` + `runVerifyStage` 主流程**

`runVerifyStage(ctx)`：
1. `cancelled` 检查；`restoreNodeModulesCache(projectId)` 命中则跳过安装（`log("info","命中模板依赖缓存")`）。
2. 未命中：`runCommand(projectId, "pnpm install --prefer-offline --config.store-dir=<pnpmStoreDir>", { timeoutMs: 600_000, signal })`；成功后 `saveNodeModulesCache(projectId)`。
3. `runCommand(projectId, "pnpm build", { timeoutMs: 600_000, signal })`。
4. `startService(projectId)` → `waitForHealth(port)`。
5. 2–4 任一步失败（或 `aborted` → 返回 `cancelled`）：把 `stderr` 尾部 6000 字符交给修复流程，最多 3 轮：
   `generateObject({ model: getModel("repair"), schema: zodRepairSchema（files: {path, content}[]） , system: REPAIR_SYSTEM_PROMPT, prompt: 错误日志 + PLAN 摘要 })` → 逐个校验 `isSafePlanPath` 且路径属于 PLAN 条目或模板文件 → `writeFileAtomic` → 重跑第 3、4 步。
6. 成功 → 返回 `{ ok: true }`（服务保持运行，spec 9.6）。

- [ ] **Step 4: 验证**

Run: `cd app && pnpm typecheck && pnpm lint && pnpm test:unit`
Expected: 全部通过。

Run（独立验证 runner 的 pnpm 识别与 basePath）：
```bash
rm -rf /tmp/tplr && cp -R templates/next-base /tmp/tplr && cd /tmp/tplr && pnpm install && \
  ATOMS_BASE_PATH=/p/demo PORT=4321 pnpm dev -p 4321 -H 127.0.0.1 > /tmp/tplr.log 2>&1 & sleep 20 ; \
  curl -s localhost:4321/p/demo/api/health ; curl -s -o /dev/null -w "%{http_code}" localhost:4321/p/demo/
```
Expected: `{"ok":true}` 与 `200`（证明 basePath 生效、资源前缀正确）。

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/workspace/command.ts app/src/lib/runner.ts \
  app/src/lib/generation/prompts.ts app/src/lib/generation/stages/verify.ts
git commit -m "feat(generation): VERIFY 阶段、命令取消与 pnpm/basePath 运行时支持"
```

---

### Task 9: 事件总线与编排器

**Files:**
- Create: `app/src/lib/generation/events.ts`
- Create: `app/src/lib/generation/pipeline.ts`

**Interfaces:**
- Consumes: `db/generation.ts`（Task 1）、四个 stage（Task 5–8）、`commitAll`、`getRuntimePort`、`appendMessage` / `getOrCreateMainThread` / `updateProjectStatus`。
- Produces:
```ts
// events.ts
export class GenerationEventBus {
  constructor(runId: string);
  emit(event: GenerationEventPayload): void;                       // 落库 + 广播
  subscribe(listener: (e: GenerationEventPayload) => void): () => void;
  history(): GenerationEventPayload[];                             // 从 DB 重放
  close(): void;
}
export function getEventBus(runId: string): GenerationEventBus;
export function releaseEventBus(runId: string): void;
// pipeline.ts
export interface StartGenerationInput { projectId: string; requirement: string; resumeFrom?: GenerationStage }
export async function startGeneration(input: StartGenerationInput): Promise<{ run: GenerationRunRow; reused: boolean }>;
export function cancelGeneration(projectId: string): boolean;
export function isGenerationRunning(projectId: string): boolean;
export function subscribeRun(runId: string, listener: (e: GenerationEventPayload) => void): () => void;
```

- [ ] **Step 1: 写 `events.ts`**

`GenerationEventBus` 内部持有 `listeners: Set<fn>`。`emit` 先映射入库字段：`level = event.type === "file" ? "file" : event.type === "log" ? event.level : "info"`；`message` 由事件生成可读中文（如 `阶段 spec 完成（2.1s）`、`写入 app/page.tsx`），`payload` 存原始事件；然后遍历 `listeners` 同步调用。`history()` 读 `listGenerationEvents(runId).map(r => r.payload)`。总线注册表用 `globalThis.__atomsEventBuses: Map<string, GenerationEventBus>`；`releaseEventBus` 仅从 map 删除并 `close()`（之后 `subscribeRun` 找不到总线时只回放历史、立即结束）。

- [ ] **Step 2: 写 `pipeline.ts` 的 job 注册表**

```ts
interface GenerationJob { runId: string; controller: AbortController; promise: Promise<void> }
declare global { var __atomsGenerationJobs: Map<string, GenerationJob> | undefined }
```
`startGeneration`：
1. `const active = getActiveGenerationRun(projectId)`；存在 → `{ run: active, reused: true }`，不新建 job。
2. 无 active 且 `requirement.trim()` 为空 → 抛 `new Error("缺少需求描述")`（路由转 400）。
3. `createGenerationRun({ projectId, requirement, stage: resumeFrom ?? "scaffold" })`（并发触发时捕获唯一索引冲突并返回已存在的 run，`reused: true`）。
4. `updateProjectStatus(projectId, "generating")`；创建 `AbortController`，`void executeRun(run, controller.signal).catch(...)`，注册到 map，`promise.finally(() => map.delete(projectId))`。

- [ ] **Step 3: 实现 `executeRun`**

从 `STAGE_ORDER.indexOf(run.stage)` 开始循环：
1. 每阶段开始前检查 `signal.aborted` → 跳出并把 run 置 `cancelled`（`updateGenerationRun` + `updateProjectStatus(id,"error")` + `emit({type:"run",status:"cancelled"})`）。
2. 构造 `StageContext`（`emit` 来自事件总线；`log` 等价 `emit(log)`；`plan` 由上一阶段结果带入）。
3. `emit({type:"stage",stage,status:"running"})` → `updateGenerationRun(runId,{stage})`。
4. 执行阶段函数；`ScaffoldConflictError` → `stageError = "该项目已有文件，请在对话中继续修改"`。
5. 成功 → `commitAll(projectId, \`feat(gen): ${stage}\`)`，`emit({type:"stage",stage,status:"done",durationMs})`；plan 阶段把 `result.plan` 存入局部变量供 BUILD 使用。
6. 失败 → `emit failed` + `updateGenerationRun({status:"failed", error})` + `updateProjectStatus(id,"error")` + `emit({type:"run",status:"failed"})`，返回。
7. 全部成功 → `updateProjectStatus(id,"ready")`，`emit({type:"run",status:"ready",previewUrl: \`/p/${projectId}/\`})`，向主线程 `appendMessage` 一条 `role:"system"` 摘要（以角色口径叙述，如「Emma 完成需求拆解，Bob 产出 N 个文件的计划，Alex 完成构建，Mike 验收通过」，并附预览地址与导出地址 `/api/projects/${projectId}/export`），最后 `releaseEventBus(runId)`。

- [ ] **Step 4: 实现 `cancelGeneration`**

取 map 中 job → `controller.abort()` → 返回 `true`；无 job 但有 active run（进程重启后的残留）→ `updateGenerationRun(runId,{status:"cancelled"})` 并返回 `true`；否则 `false`。

- [ ] **Step 5: 验证**

Run: `cd app && pnpm typecheck && pnpm lint && pnpm test:unit`
Expected: 全部通过（`subscribeRun` 在总线上无监听时不得抛错，需在代码中显式处理）。

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/generation/events.ts app/src/lib/generation/pipeline.ts
git commit -m "feat(generation): 事件总线与阶段编排器"
```

---

### Task 10: HTTP 接口（触发 / 订阅 / 导出 / 启动清理）

**Files:**
- Create: `app/src/app/api/projects/[id]/generate/route.ts`
- Create: `app/src/app/api/projects/[id]/generation/route.ts`
- Create: `app/src/app/api/projects/[id]/export/route.ts`
- Modify: `app/server.mjs:23-36`（启动时把 running 置 interrupted）
- Modify: `app/package.json`（新增 `archiver`、`@types/archiver` 依赖）

**Interfaces:**
- Consumes: `startGeneration` / `cancelGeneration` / `subscribeRun`、`getEventBus`、`getActiveGenerationRun` / `getLatestGenerationRun` / `listGenerationEvents`、`getProject`。
- Produces（对外契约）:
  - `POST /api/projects/{id}/generate`，body `{ requirement?: string; resumeFrom?: GenerationStage; action?: "cancel" }`
  - `GET /api/projects/{id}/generation` → `{ run: GenerationRunRow | null, events: GenerationEventRow[] }`
  - `GET /api/projects/{id}/export` → `application/zip`

- [ ] **Step 1: 写 `generate/route.ts`**

```ts
export const runtime = "nodejs";
export const maxDuration = 1800;
```
逻辑：
- 项目不存在 → 404。
- `body.action === "cancel"` → `cancelGeneration(id)` → `{ ok: true }`。
- `requirement` 非空时校验长度 4–2000，否则 400。
- `startGeneration` 抛「缺少需求描述」→ 400。
- 响应 `Content-Type: application/x-ndjson`，`ReadableStream` 内先回放 `bus.history()`，再 `subscribe` 实时推送；每条 `JSON.stringify(event) + "\n"`。
- `start` 回调里用 `jobDone` 判断：`run.status !== "running"` 时（含 reused 且已结束）写完历史后立即 `controller.close()`，避免悬挂。
- `cancel()`（客户端断开）只取消订阅，**不** abort job（spec 9.2）。

- [ ] **Step 2: 写 `generation/route.ts`**

`const run = getActiveGenerationRun(id) ?? getLatestGenerationRun(id)`；返回 `{ run, events: run ? listGenerationEvents(run.id) : [] }`。

- [ ] **Step 3: 写 `export/route.ts`（spec 9.5）**

`npm install archiver && npm i -D @types/archiver`。用 `archiver("zip", { zlib: { level: 6 } })`，遍历 `projectRoot(id)`：跳过 `node_modules`、`.next`（目录整体跳过），其余（含 `.git`、`.atoms`）全部加入；`archive.finalize()`；把 archiver 的 `data` 事件桥接成 `ReadableStream`。响应头 `content-type: application/zip`、`content-disposition: attachment; filename="<project.name>.zip"`（文件名做 URL 编码，避免中文头错误）。

- [ ] **Step 4: 改 `server.mjs` 启动清理**

在 `app.prepare()` 前插入一段：复用 `databasePath()` 打开 DB（若文件存在），执行
```sql
UPDATE generation_runs SET status='interrupted', finished_at=<now_ms> WHERE status='running'
```
并 `console.log` 受影响行数；关闭连接。不得影响 WS 代理逻辑。

- [ ] **Step 5: 端到端验证（核心验收）**

Run（先启动平台）：
```bash
cd app && (pnpm dev > /tmp/atoms.log 2>&1 &) ; sleep 20
PID=$(curl -s -X POST localhost:3000/api/projects -H 'content-type: application/json' \
  -d '{"description":"做一个宠物美容预约网站，有服务介绍、预约表单、后台查看预约"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).project.id))")
curl -N -X POST localhost:3000/api/projects/$PID/generate -H 'content-type: application/json' \
  -d '{"requirement":"做一个宠物美容预约网站，有服务介绍、预约表单、后台查看预约"}'
```
Expected: NDJSON 依次出现 `scaffold → spec → plan → build → verify` 的 `stage` 事件、若干 `file` 事件，最后 `{"type":"run","status":"ready","previewUrl":"/p/<id>/"}`；过程无 `status:"failed"`。

Run:
```bash
ls ../data/projects/$PID | head ; ls ../data/projects/$PID/.atoms
curl -s localhost:3000/api/projects/$PID/generation | head -c 400
curl -s -o /tmp/out.zip localhost:3000/api/projects/$PID/export && unzip -l /tmp/out.zip | head -20
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/p/$PID/
```
Expected: 项目目录含 `package.json`、`app/`、`.atoms/SPEC.md`、`.atoms/PLAN.json`、`.git/`；`generation` 返回 run 与事件；zip 列表含 `.atoms/`、`.git/` 且不含 `node_modules`；预览根路径返回 200。

Run（冲突与取消）：
```bash
# 非空且无 .atoms 的项目应 409
QID=$(curl -s -X POST localhost:3000/api/projects -H 'content-type: application/json' -d '{"description":"旧项目"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).project.id))")
printf 'hi' > ../data/projects/$QID/keep.txt
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/api/projects/$QID/generate -H 'content-type: application/json' -d '{"requirement":"改成博客"}'
curl -s -X POST localhost:3000/api/projects/$QID/generate -H 'content-type: application/json' -d '{"action":"cancel"}'
```
Expected: `409`；`keep.txt` 仍存在；cancel 返回 `{"ok":true}`。

- [ ] **Step 6: 验证模型配置下的失败路径**

Run: 在 `OPENAI_BASE_URL` 指向无效地址时重复 Step 5 的 generate。
Expected: NDJSON 以 `{"type":"run","status":"failed"}` 结束，`GET .../generation` 可见 `error` 文案；`.git` 与已生成文件仍保留。

- [ ] **Step 7: Commit**

```bash
git add app/src/app/api/projects/\[id\]/generate app/src/app/api/projects/\[id\]/generation \
  app/src/app/api/projects/\[id\]/export app/server.mjs app/package.json app/package-lock.json
git commit -m "feat(api): 生成触发、事件订阅与工程导出接口"
```

---

### Task 11: 工作台时间线与入口切换

**Files:**
- Create: `app/src/components/workspace/generation-timeline.tsx`
- Modify: `app/src/components/workspace/workspace.tsx`
- Modify: `app/src/components/workspace/chat-panel.tsx`（删除 `initialQuery` 自启动，增加 `locked`）
- Modify: `app/src/lib/ai/tools.ts:253-274`（`HARNESS_SYSTEM_PROMPT` 增加读取 SPEC/PLAN 的约束）

**Interfaces:**
- Consumes: `POST /api/projects/{id}/generate`（Task 10）、`GET /api/projects/{id}/generation`、`GenerationEventPayload` / `GenerationStage`（Task 1）。
- Produces:
```tsx
// generation-timeline.tsx
export interface GenerationView { status: string; stage: string | null; error: string | null }
export function GenerationTimeline(props: {
  view: GenerationView | null;
  events: GenerationEventPayload[];
  onCancel: () => void;
  onRetry: () => void;
}): JSX.Element
// chat-panel.tsx 新增 prop
locked?: boolean   // true 时禁用 ComposerPrimitive.Input 与 Send
```

- [ ] **Step 1: 写 `GenerationTimeline`**

以**角色卡片**呈现五个阶段（视觉参考 atoms.dev dashboard 的 agent 列表，按文字描述实现，不追像素级复刻）：每张卡片左侧圆形头像显示角色首字母（Mike/Emma/Bob/Alex，配色沿用 `#4267ff`→`#b88ade` 渐变与灰阶），右侧两行——第一行 `角色中文名 · 阶段名`（如「产品经理 · SPEC」），第二行状态文案（待开始 / 进行中… / 已完成（2.1s）/ 失败：<错误>）；角色数据来自 `STAGE_ROLES`（Task 1），阶段顺序来自 `STAGE_ORDER`。卡片状态由 `events` 中该阶段的最后一个 `stage` 事件推导：`running` 脉冲点 + 「Mike 正在协调团队…」顶部横幅，`done` 绿点，`failed` 红点。

卡片列表下方显示「当前文件」（最后一个 `file` 事件路径）与滚动日志区（`log` 与 `failed` 文件事件，最多保留最近 200 条）。`status === "running"` 时显示「取消生成」按钮，`failed` 时显示「从失败阶段重试」按钮（调用 `onRetry`，内部带 `resumeFrom: view.stage`）。样式只用现有 Tailwind token，不引入新依赖。

- [ ] **Step 2: 改 `workspace.tsx` 的状态与订阅**

新增 state：`genView`、`genEvents`、`streaming`。新增 `attachGeneration(requirement?: string, resumeFrom?: GenerationStage)`：
1. `fetch(\`/api/projects/${id}/generate\`, { method:"POST", body: JSON.stringify({ requirement, resumeFrom }) })`。
2. 非 2xx 且状态 409 → 在对话区提示「该项目已有文件，请在对话中继续修改」；其他错误显示 `error`。
3. 读取 `res.body.getReader()`，按 `\n` 切分累积缓冲，逐行 `JSON.parse` 后 `setGenEvents` 追加；收到 `type:"run"` 时更新 `genView.status`。
4. `status === "ready"` → `await refresh()`，`setTab("preview")`，结束后重新拉一次 `GET generation` 对齐历史。

挂载时（`useEffect`）先 `GET /api/projects/{id}/generation`：若 run 存在则回填 `genEvents`，`status === "running"` 时调 `attachGeneration()` 续订（不带 requirement）。若 `initialQuery` 且 `initialMessages.length === 0` 且无任何 run → `attachGeneration(initialQuery)`。

预览区渲染：`genView?.status === "running" || genView?.status === "failed"` 时把预览区替换为 `<GenerationTimeline>`；`ready` 后回预览 iframe。头部新增「导出」链接 `<a href={\`/api/projects/${id}/export\`}>导出</a>`，`generating` 时禁用「运行/重启/停止」按钮。

- [ ] **Step 3: 改 `chat-panel.tsx`**

删除 `initialQuery` prop 与对应的 `useEffect`（首条需求已由流水线消费）；新增 `locked?: boolean`，`locked` 时给 `ComposerPrimitive.Input` 传 `disabled`、给 `ComposerPrimitive.Send` 传 `disabled`，输入框上方显示一行「生成中，完成后再继续对话」。

- [ ] **Step 4: 改 `HARNESS_SYSTEM_PROMPT`（spec 5.6）**

在「工作规范」追加两条：
- 首次构建由流水线完成；后续修改前先读 `.atoms/SPEC.md` 与 `.atoms/PLAN.json`，遵循其中的页面、数据模型与文件分层。
- 不得删除模板约定文件（`app/layout.tsx`、`app/api/health/route.ts`、`lib/db/index.ts`、`.atoms/CONVENTIONS.md`）；页面跳转用 `next/link`，禁止手写绝对地址。

- [ ] **Step 5: 验证（浏览器端）**

Run: `cd app && pnpm typecheck && pnpm lint && pnpm build`
Expected: 三者均通过。

Run: 启动 `pnpm dev`，浏览器打开 `http://localhost:3000`，在首页输入「做一个宠物美容预约网站，有服务介绍、预约表单、后台查看预约」并提交。
Expected（逐条观察）：进入工作台后预览区显示五张角色卡片（Mike·SCAFFOLD / Emma·SPEC / Bob·PLAN / Alex·BUILD / Mike·VERIFY），角色名与阶段名正确；卡片按顺序点亮，进行中的卡显示脉冲点与「正在协调团队」横幅；「当前文件」持续变化；对话输入框不可用；结束后自动切回预览且页面可交互；头部「导出」可下载 zip；刷新页面后角色卡片状态与产物一致。

- [ ] **Step 6: Commit**

```bash
git add app/src/components/workspace/generation-timeline.tsx \
  app/src/components/workspace/workspace.tsx app/src/components/workspace/chat-panel.tsx \
  app/src/lib/ai/tools.ts
git commit -m "feat(workspace): 生成时间线、入口切换与对话锁定"
```

---

### Task 12: 全量验证与验收

**Files:**
- 无新增；只做验证与必要修复。

- [ ] **Step 1: 平台静态检查**

Run: `cd app && pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build`
Expected: 四项全部通过。

- [ ] **Step 2: 主验收场景（spec 第 8 节）**

Run: 新建项目并触发生成（同 Task 10 Step 5 的 curl），等待 `status:"ready"`。
Expected: `GET /p/{id}/` 200；`GET /p/{id}/api/health` 返回 `{"ok":true}`；`generation_runs` 行含非零 `input_tokens`/`output_tokens` 与 `finished_at`。

Run: 通过预览页面提交一次预约表单（或 `curl -X POST /p/{id}/api/...` 命中表单提交接口）。
Expected: 项目 `data/app.db` 中对应表有新增行（`sqlite3 ../data/projects/{id}/data/app.db "select count(*) from <table>"`）。

- [ ] **Step 3: 导出可运行性验证**

Run:
```bash
unzip -q /tmp/out.zip -d /tmp/gen && cd /tmp/gen && pnpm install && (pnpm dev -p 4321 > /tmp/gen.log 2>&1 &) ; sleep 20 ; curl -s -o /dev/null -w "%{http_code}\n" localhost:4321/
```
Expected: `200`（无 `ATOMS_BASE_PATH`，证明导出后根路径可用）。

- [ ] **Step 4: 失败续跑验证**

Run: 生成到 BUILD 阶段时 `POST {"action":"cancel"}`；然后 `POST {"resumeFrom":"build"}`。
Expected: 第一次 run 为 `cancelled`；第二次从 `build` 开始，最终 `ready`；`.atoms/SPEC.md` 未被重新生成（文件 mtime 不变）。

- [ ] **Step 5: 清理与收尾**

删除本次验收产生的临时目录（`/tmp/tpl*`、`/tmp/gen`）与测试项目工作区；确认 `data/` 未被提交（`.gitignore` 已含 `/data/`）。

- [ ] **Step 6: Commit（如有修复）**

```bash
git add -A app/src templates
git commit -m "fix(generation): 验收问题修复"
```

---

## 依赖顺序与并行建议

```
Task 1 ──┬─> Task 4 ──> Task 5 ──> Task 6 ──> Task 7 ──> Task 8 ──┐
Task 2 ──┼─> Task 3                                            ├─> Task 9 ──> Task 10 ──> Task 11 ──> Task 12
         └──────────────────────────────────────────────────────┘
```

- Task 2/3（模板）与 Task 1（数据层）互不依赖，可并行。
- Task 4 依赖 Task 2/3 的模板文件存在；Task 5–8 依赖 Task 1 的类型与 Task 4 的模板清单。
- Task 10 是第一次真正跑通全链路的地方；Task 11 之前不要改前端入口，避免半成品状态影响排查。

## 与 spec 的四处实现细化（已确认可接受）

1. `generation_runs` 增 `requirement`、`input_tokens`、`output_tokens` 三列 —— spec 5.9 原表缺列，但第 8 节验收要求记录 token 消耗。
2. 模板数据层直连 `better-sqlite3`（不引入 drizzle）—— 减少模板依赖体积，契约（`getDb()` + `DDL` 数组）与 spec 9.4 一致。
3. `projects.status` 的 `ready` 与 `running` 并存：流水线成功写 `ready`，手动启动服务写 `running`，两者都表示服务可用，前端以 `port` 判断是否渲染 iframe。
4. 生成过程按"角色协作"呈现（Emma/PM、Bob/Architect、Alex/Engineer、Mike/Team Leader，即 `STAGE_ROLES`）—— 对应 spec 第 7 节「时间线的前端视觉细节」；仅 UI 映射，不改阶段语义与数据库结构，入口仍沿用现有首页输入框。
