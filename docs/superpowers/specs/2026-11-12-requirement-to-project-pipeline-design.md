# 需求 → 可导出工程：阶段化生成流水线

**日期：** 2026-11-12
**状态：** 待审批
**范围：** atoms-c 平台首版「一句话生成应用」能力

---

## 1. 意图与动机

用户在一个输入框里写一句需求，平台产出一个**结构规整、可导出、可继续开发的完整工程**，并在服务器上跑起来供预览。

这与"生成一个能看的页面"是两种产品。工程化目标带来了三个硬要求：

1. **结构可预期**：同一类需求，产出的目录结构与分层基本一致，接手的人不需要重新理解。
2. **可验证**：产物必须能 `install` → `build` → 启动 → 探活，而不是"看起来对"。
3. **可交付**：用户可以随时把整个工程拿走（git 历史 + zip），继续在自己机器上开发。

## 2. 目标 / 非目标 / 反目标

### 目标

- 输入一段自然语言需求，产出通过构建与探活的 Next.js 工程
- 生成过程对用户可见：当前阶段、正在写哪个文件、失败在哪一步
- 同一项目可反复迭代（后续对话继续改），也可随时导出
- 单项目生成可中断、可续跑、可从失败阶段重试

### 非目标（本期不做）

- 用户认证、计费、配额（已在前序提案中排除）
- 容器级沙箱隔离（沿用现有目录白名单 + 命令黑名单）
- 自定义域名发布、多人实时协作
- 非 Next.js 技术栈的模板（Vue/Nuxt/Python 等）

### 反目标（即使功能可用也算失败）

- 产出需要人工补步骤才能跑起来
- 失败后留下半截工程，用户无法判断哪里坏了
- 每次生成结构差异极大，导出后无法维护
- 生成过程是个黑盒，只能等结果

## 3. 约束

| 约束 | 含义 |
|---|---|
| 单机部署 | 平台与用户项目跑在同一台服务器，端口池 4000–4999 复用 |
| 无沙箱 | 所有文件/命令仍受 `resolveInsideProject` 与命令黑名单约束 |
| 模型不确定 | 单次自由生成质量随机 → 必须用"计划 + 验收"收敛 |
| 依赖安装慢 | 每项目 `npm install` 数百 MB → 需要模板预热与 store 复用 |
| 已有代码 | 必须复用现有 `workspace/*`、`runner.ts`、`db/*`，不另起一套 |

## 4. 候选方案与选择

| 方案 | 做法 | 取舍 |
|---|---|---|
| 1 模板优先 | 固定骨架 + AI 只写业务文件 | 快、稳；复杂需求受限 |
| **2 阶段化流水线（已选）** | SPEC → PLAN → BUILD → VERIFY，产物落盘 | 慢、实现量大；可解释、可续跑、质量可控 |
| 3 现状加强版 | 单循环 + 末尾构建校验 | 改动最小；问题仍不可定位 |

**选择：方案 2，并以方案 1 的模板作为第 0 步。** 模板解决"骨架确定、秒级可运行"，流水线解决"需求理解、文件规划、验收修复"。两者不是替代关系。

## 5. 总体设计

### 5.1 流程

```
用户输入需求
   │
   ▼
① SCAFFOLD  拷贝 templates/next-base → git init → 首次提交     （无 AI，~2s）
   │
   ▼
② SPEC      模型输出 .atoms/SPEC.md：目标 / 页面 / 数据模型 / 非目标
   │
   ▼
③ PLAN      模型读 SPEC + 模板清单，输出 .atoms/PLAN.json：文件级任务清单
   │
   ▼
④ BUILD     按 PLAN 逐项写文件（每项一次模型调用），全部落盘
   │
   ▼
⑤ VERIFY    pnpm install → pnpm build → 启动服务 → 探活；失败则回灌修复（≤3 轮）
   │
   ▼
完成：状态 ready，服务运行，预览可用，可导出
```

每一步都写入 `generation_runs`，事件写入 `generation_events`，前端据此渲染时间线。

### 5.2 关键产物

- `.atoms/SPEC.md` — 需求理解结果，人可读
- `.atoms/PLAN.json` — 文件级计划，机器可执行：

```json
{
  "pages": ["/", "/pricing"],
  "items": [
    { "path": "app/page.tsx", "action": "modify", "purpose": "首页 Hero + 功能三栏", "dependsOn": [] },
    { "path": "components/site/pricing.tsx", "action": "create", "purpose": "定价卡片", "dependsOn": ["lib/site-content.ts"] }
  ],
  "dataModel": [{ "table": "leads", "columns": ["id", "email", "created_at"] }]
}
```

PLAN 是整个方案的核心：它把"生成"从一次性赌博变成可审计的执行过程，也让失败点可以定位到具体文件。

### 5.3 服务端模块

新增 `app/src/lib/generation/`：

| 文件 | 职责 |
|---|---|
| `pipeline.ts` | 编排器：按阶段推进、状态机、失败重试、续跑 |
| `scaffold.ts` | 模板拷贝、git init/commit、模板哈希缓存 |
| `stages/spec.ts` | 生成并校验 `SPEC.md` |
| `stages/plan.ts` | 生成并校验 `PLAN.json`（路径合法、条目上限、必需文件） |
| `stages/build.ts` | 按条目逐文件生成，原子写入 |
| `stages/verify.ts` | install/build/启动/探活 + 修复回灌 |
| `events.ts` | 事件落库与 NDJSON 输出 |
| `prompts.ts` | 各阶段系统提示词 |

### 5.4 接口

**触发**：`POST /api/projects/{id}/generate`，body `{ requirement: string }`，返回 `application/x-ndjson` 流：

```json
{"type":"stage","stage":"scaffold","status":"running"}
{"type":"stage","stage":"scaffold","status":"done","durationMs":1800}
{"type":"file","path":"app/page.tsx","status":"writing"}
{"type":"log","level":"error","message":"TS2322 ..."}
{"type":"run","status":"ready","previewUrl":"/p/{id}/"}
```

**状态查询**：`GET /api/projects/{id}/generation` 返回最近一次 run 与全部事件（刷新后可恢复时间线）。

**重试**：`POST /api/projects/{id}/generate` 携带 `{ resumeFrom: "verify" }`，从指定阶段续跑，之前的产物保留。

**导出**：`GET /api/projects/{id}/export` 返回 zip：包含源码、`.atoms/` 与 `.git`（保留提交历史），排除 `node_modules`、`.next`。

**取消**：`POST /api/projects/{id}/generate` 携带 `{ action: "cancel" }`。取消在阶段边界检查，并终止当前 install/build 子进程；已写入文件保留，run 标记为 `cancelled`。

### 5.5 前端

工作台的状态从"结果页"变成"过程页"：

- 首条消息触发生成后，右侧预览区切换为**生成时间线**（阶段列表 + 当前文件 + 日志滚动）
- 完成后自动切回预览 iframe 并启动服务
- 失败时时间线停在失败阶段，提供「重试此阶段」与「查看错误」
- 对话区保留一条系统摘要消息（完成了什么、预览地址、如何导出）

对话输入框在生成期间禁用，避免与流水线争抢文件。

### 5.6 与现有对话能力的关系

- **首次生成**走流水线（`/api/projects/{id}/generate`）
- **后续修改**仍走现有 `/api/chat` 的 harness 工具循环
- chat 的系统提示词增加一条：动手前先读 `.atoms/SPEC.md` 与 `.atoms/PLAN.json`，遵循既有分层与命名

两条路径共用同一套文件工具与安全层，不产生第二套写文件实现。

### 5.7 依赖与缓存

- 包管理器统一为 pnpm，store 放在 `data/.pnpm-store`
- `pnpm install --prefer-offline --config.node-linker=hoisted`
- 模板首次安装完成后，把 `node_modules` 快照到 `data/.template-cache/{templateHash}/node_modules`；新项目用硬链接拷贝（`cp -al`）命中缓存，未命中再走 install
- 缓存以模板 `package.json` 哈希为键，模板升级自动失效

### 5.8 模板契约（`templates/next-base/`）

必须包含且 AI 不得删除：

```
package.json            # 固定依赖版本，scripts: dev/build/start
next.config.ts
tsconfig.json
postcss.config.mjs
app/layout.tsx          # 全局字体与样式
app/page.tsx            # 占位首页，AI 覆盖
app/globals.css
app/api/health/route.ts # 探活端点，返回 { ok: true }
components/ui/…         # button / card / input / dialog
lib/db/index.ts         # SQLite 连接（WAL）
lib/db/schema.ts        # 空 schema，AI 按数据模型补充
lib/utils.ts
.atoms/CONVENTIONS.md   # 分层与命名约定，BUILD 阶段必读
```

### 5.9 数据模型新增

```sql
generation_runs(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL,          -- running | ready | failed | cancelled
  stage TEXT NOT NULL,           -- scaffold|spec|plan|build|verify
  error TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
)

generation_events(
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  level TEXT NOT NULL,           -- info | warn | error | file
  message TEXT NOT NULL,
  payload_json TEXT,
  created_at INTEGER NOT NULL
)
```

`projects.status` 增加 `generating` / `ready` 两个值（已有 `created/running/stopped/error`）。

### 5.10 失败与重试策略

| 阶段 | 失败判定 | 处理 |
|---|---|---|
| SPEC | 输出缺少页面或数据模型段落 | 重试 1 次，仍失败则终止并提示需求过于模糊 |
| PLAN | JSON 不合法 / 路径逃逸 / 条目 > 40 / 缺必需文件 | 重试 1 次，仍失败则降级为"仅首页"最小计划 |
| BUILD | 单文件连续 2 次写入失败 | 记录该条目失败，继续后续条目（部分完成优于全废） |
| VERIFY | install / build / 探活失败 | 抓 stderr → 修复调用（只允许改 PLAN 内文件）→ 重跑，最多 3 轮 |

任何阶段终止都保留已产出的文件与 git 提交，用户可从失败阶段续跑。

## 6. 已定事项（实现时的既定决策）

- 导出 = 每项目独立 git 仓库 + zip 下载（git 同时提供版本回滚）
- 模板与生成代码统一 Next.js + Tailwind + shadcn + SQLite
- 生成过程用 NDJSON 流，不用 WebSocket
- BUILD 阶段不给模型 `run_command` 权限，命令只出现在 VERIFY 的固定流程中
- 阶段产物（SPEC/PLAN）放在项目内 `.atoms/`，随导出一起带走

## 7. 留给实现者的空间

- 各阶段模型与温度的具体取值（建议 SPEC/PLAN 用强模型低温，BUILD 用性价比模型）
- 每个文件的上下文拼装策略（SPEC 全文 vs 摘要 + 相邻文件）
- 模板内 UI 组件的具体清单
- 时间线的前端视觉细节
- pnpm 缓存命中率不理想时的替代方案（如模板预构建镜像）

## 8. 验收标准

- 输入"做一个宠物美容预约网站，有服务介绍、预约表单、后台查看预约" → 产出可构建、可启动的工程，首页与两个页面可访问，表单提交写入 SQLite
- 全流程无人工介入，耗时与 token 消耗记录在 `generation_runs`
- 刷新工作台后时间线与产物一致；失败后可指定阶段续跑
- 导出 zip 解压后 `pnpm install && pnpm dev` 可本地运行
- 生成期间既有聊天、文件树、预览不崩溃

## 9. 设计审查后的既定决策

审查提出的 7 个问题，处理如下（均为实现时不可再议的约定）：

**9.1 子路径适配：模板内置 `basePath`**
`templates/next-base/next.config.ts` 读取 `process.env.ATOMS_BASE_PATH`（默认空字符串）设置 `basePath` 与 `assetPrefix`。`runner.startService` 启动项目时注入 `/p/{id}`，于是 Next 生成的资源与页面内链都带前缀，代理剥掉前缀后正好命中项目根路径。
- 平台内：`/p/{id}/_next/...` → 代理 → `/_next/...` ✅
- 导出后本地：环境变量为空，工程在根路径正常跑 ✅
- 页面跳转使用 `next/link` 与 `useRouter`，由 Next 自动加前缀；内部禁止手写绝对地址

**9.2 编排器是独立后台 job，不绑定请求**
`/api/projects/{id}/generate` 只做三件事：创建 run 记录、启动/复用进程内 job、把 job 事件以 NDJSON 推给订阅者。客户端断开不终止 job；重新打开页面通过 `GET .../generation` 拉取历史事件继续看。
- 单项目互斥：DB 层面保证同一 project 同时只有一个 `status='running'` 的 run，重复触发直接返回该 run
- 进程重启：启动时把所有 `running` 的 run 标记为 `interrupted`，允许 `resumeFrom` 续跑
- job 注册表沿用 `runner.ts` 的 `globalThis` 单例模式，避免 dev 热更新丢状态

**9.3 SCAFFOLD 对非空目录**
- 目录为空 → 正常拷贝模板
- 目录非空但无 `.atoms/`（历史 chat 自由生成的项目）→ 返回 409，提示"该项目已有文件，请在对话中继续修改"，不做覆盖也不做迁移
- 目录内有 `.atoms/` → 视为同一发布线，scaffold 幂等跳过，只补齐缺失的模板文件

**9.4 数据表创建由模板负责**
不引入 `drizzle-kit push`。模板 `lib/db/index.ts` 在首次连接时执行幂等 DDL（与平台自身做法一致）；`schema.ts` 只声明表结构常量，BUILD 阶段新增表时同步写入 DDL 数组。好处：`pnpm dev` 即建表，导出后零额外步骤。

**9.5 导出含 git 历史**
zip 包含 `.git`，承诺的"版本回滚"与导出物一致（已在 5.4 修正）。

**9.6 VERIFY 复用 `runner.ts`，不另起进程**
VERIFY 调用 `runner.startService(projectId)` 获得端口并注册到 `processes` 表，探活 `GET /api/health` 通过后**保持运行**，预览立即可用。`runner.buildStartCommand` 增加 pnpm 识别（存在 `pnpm-lock.yaml` 时用 `pnpm dev`），与模板保持一致。VERIFY 不并行启动第二个进程。

**9.7 取消粒度**
只在阶段边界与长命令（install/build）处响应取消，不细分到单次模型调用。理由：单文件调用秒级返回，细分收益低而复杂度高。
