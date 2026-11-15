# Atoms Clone 实现说明

> 面向评审/交接的简要说明：实现思路与关键取舍、当前完成程度、后续扩展方向与优先级。
> 事实依据来自 `openspec/specs/`、`openspec/changes/`、`app/src/lib/**` 与 `docs/**`。

## 1. 实现思路与关键取舍

### 1.1 一句话

用户在一句话里描述需求，平台在服务器上**真实地**建工程、写代码、装依赖、跑构建、起服务、做浏览器验收，最后通过 `/p/{id}`（开发预览）与 `/s/{id}`（固定生产版本）两个子路径对外提供访问。

核心主张是：**宁可承认"没验证"，也不假装成功**。所有可见的"完成"都必须有实际执行过的命令或浏览器交互作依据。

### 1.2 分层

```
浏览器
 ├─ /                 营销落地页（复刻 atoms-clone.html）
 ├─ /projects /resources /dashboard   项目中心、资源库、工作台
 ├─ /api/chat          AI 对话（AI SDK + harness 工具集）
 ├─ /api/projects/{id}/generate        六阶段生成（NDJSON 推流）
 ├─ /api/projects/{id}/releases/*      发布、回滚、下载
 ├─ /p/{id}/**         开发预览 → 127.0.0.1:{4000-4999}
 └─ /s/{id}/**         生产版本 → 127.0.0.1:{独立端口}
```

生成链路：`discuss → scaffold → spec → plan → build → verify`（`app/src/lib/generation/types.ts`），每阶段成功即 git commit，状态落 `generation_runs` / `generation_events`。

### 1.3 关键取舍

| 取舍 | 选择 | 理由 | 代价 |
|---|---|---|---|
| **生成方式** | 六阶段结构化流水线，不是"一次对话生成整站" | 每阶段有独立 schema 校验（`spec-schema.ts` / `plan-schema.ts`），失败可定点重试，不会一错全废 | 链路长、首屏等待久、token 消耗高 |
| **脚手架** | 固定 `templates/next-base`，scaffold 直接整目录拷贝 | 模板决定了 `basePath`、`apiPath()`、数据目录等契约，验收脚本才有稳定靶子 | 生成结果基本是 Next.js 形态，无法真正产出 Vite/原生静态工程 |
| **代码写入** | 逐文件**整文件**生成 + 原子写（tmp+rename） | 模型输出可校验（语法 + 模板契约），避免 diff 补丁错行 | 大文件重复生成、token 浪费；无文件级并行 |
| **并发控制** | 项目级租约 + 唯一活动 run 索引 + 全局构建串行队列 | 一个项目同时只允许一个 run，构建不互相抢 CPU | 吞吐受限，构建期间其它项目排队 |
| **验收** | `tsc --noEmit` → `pnpm build` → 起服务探活 → Playwright 真实交互 | 编译通过 ≠ 能用；只有真点过表单、刷过页面才算业务验收 | 单轮验收最长 300s，需要 Chromium |
| **验收口径** | 只报告真正跑过的检查，缺失即标注 `pendingManual` | 避免"静态 HTTP 200 当成业务通过" | 报告经常不"漂亮"，需要人工确认项 |
| **运行时** | Node 子进程 + 4000–4999 端口池，非"一项目一容器" | 实现简单、冷启动快、资源占用低，适合单机复刻 | 隔离靠 bwrap/sandbox-exec 而非容器边界；进程状态需自己维护 |
| **执行隔离** | `WORKSPACE_EXECUTION_BACKEND=auto/native/docker`，native 优先 | Linux bwrap 开销远小于容器，且不需要挂 Docker socket | 依赖内核允许非特权用户命名空间；不可用时必须显式拒绝而非降级 |
| **命令约束** | 黑名单 + cwd 白名单（`resolveInsideProject`）+ 超时 + 输出截断 | 实现成本低，覆盖常见破坏性命令 | 不是白名单，安全边界主要靠执行隔离层兜底 |
| **持久化** | SQLite（WAL）+ 内嵌 DDL + 幂等 ALTER | 零外部依赖，单文件易备份 | 无迁移版本表、无回滚脚本，多实例不可行 |
| **发布** | 固定源码快照 + 独立数据目录 + 探活后事务切换 | 开发数据不污染线上，失败时旧版继续服务 | 每次发布都要完整重装/重构建，慢；只保留最近 5 份 |
| **失败处理** | 修复轮次上限 3 + 项目哈希比对判定"无进展" | 防止模型无限空转烧钱 | 复杂错误可能 3 轮修不好而终止 |

## 2. 当前完成程度

### 2.1 已完成（有代码与验证依据）

| 模块 | 状态 | 关键实现 |
|---|---|---|
| 营销落地页 | ✅ | `components/marketing/marketing-page.tsx` + `app/marketing.css`，滚动淡入、模板预填、真实 `POST /api/projects` |
| 项目中心 | ✅ | `/projects`，卡片网格、收藏（乐观更新）、删除确认、运行态缩略预览、骨架屏 |
| 资源库 | ✅ | `/resources`，18 条示例 + 6 个模板，纯 CSS 预览，点击带 `?q=` 跳工作台 |
| 工作台 | ✅ | 对话、文件树、代码/实时双视图、iframe 预览、desktop/tablet/mobile 设备切换、移动端分栏 |
| 六阶段生成 | ✅ | discuss（最多 2 轮澄清 + 确认）/ scaffold / spec / plan / build / verify(含 repair) |
| 断点恢复 | ✅ | 刷新复用 active run、`generation_progress.worker_pid` 判活、文件检查点 `reuse|generate|conflict` |
| 取消 | ✅ | AbortSignal 贯穿模型流、命令执行、Playwright；每阶段 900s 硬超时 |
| 技术验收 | ✅ | tsc + next build（独立候选快照，保留 3 个）+ 探活 60s |
| 业务验收 | ✅ | Playwright headless，14 种动作、接口断言、三档视口截图、横向溢出与 pageerror 收集 |
| 失败分类与修复 | ✅ | `[dependencies]/[imports]/[tsc]/[pnpm build]/[acceptance]/[start]` 分流，最多 3 轮，哈希无变化即停 |
| 运行时管理 | ✅ | `RuntimeGate` 单项目串行、端口池实测探测、`processes` 表 + 身份校验、启动时 `cleanupOrphans()` |
| 执行隔离 | ✅ | native（bwrap/sandbox-exec）/ docker（只读根、cap-drop、pids/mem/cpu 限制、仅 127.0.0.1 发布端口） |
| 子路径代理 | ✅ | `/p/` HTTP Route Handler + `server.mjs` WebSocket 裸管道；basePath 经 `ATOMS_BASE_PATH` 注入 |
| 生产发布 | ✅ | 快照 → install → build → start → 探活 → 事务切换；失败保留旧版；回滚以历史源码重新走全流程 |
| 数据隔离 | ✅ | `ATOMS_DATA_DIR`，发布期临时 `.build-data`，业务 env 白名单 |
| 部署包 | ✅ | 源码白名单 + 秘密排除 + manifest 哈希 + Dockerfile/Compose/DEPLOYMENT.md |
| 运维入口 | ✅ | `/api/health`、`scripts/deploy.sh`、`instrumentation.ts` 启动自愈 |

### 2.2 部分完成 / 有明确边界

| 项 | 现状 |
|---|---|
| 脚手架多样性 | 只有 `next-base`。`collectSource` 允许 static 兜底，但 build/verify 硬编码 `pnpm build --webpack` + `/api/health`，**Vite/纯静态只能预览、无法通过发布** |
| 计划降级 | `plan` 事件的 `degraded` 字段已声明但从未置 true，"降级为最小计划"未实现，校验失败直接终止 |
| 验收覆盖面 | 动作集是封闭枚举（无上传/拖拽/iframe/多窗口）；plan 未给 `acceptance` 时退化为"页面 200 冒烟" |
| 修复能力 | 只修 tsc/build/验收日志能定位到文件行的问题；受保护路径（模板文件）不可修 |
| 需求澄清 | 最多 2 轮，之后强制二选一确认 |
| 命令白名单 | 只有黑名单 + cwd 约束，安全依赖隔离层 |
| `/s/` WebSocket | `server.mjs` 只代理 `/p/` 的 upgrade，生产版本若自建 WS/SSE 会失败 |
| 数据库演进 | 无迁移版本表，仅幂等 `CREATE TABLE IF NOT EXISTS` + 按列存在性 ALTER |
| 发布保留 | 只留最近 5 份源码，更早版本无法回滚 |
| 部署开箱度 | Compose 依赖宿主非特权用户命名空间，策略收紧时入口会拒绝启动（预期行为，但需部署者准备） |

### 2.3 未做

| 项 | 说明 |
|---|---|
| 身份认证 / 多租户 | `users` 表仅 `id`，无鉴权；单租户可信环境，生产需前置 nginx `auth_basic` |
| 计费 | 明确不在范围；营销页定价仅为文案，无支付链路 |
| 云托管 / 自动域名与证书 | `PUBLIC_APP_ORIGIN` 仅用于展示，不做域名 provisioning |
| 高可用 / 水平扩展 | 单机 SQLite + 本地端口池，不支持多实例 |
| 公网验收证据 | 报告里 `independentProduction`/公网访问始终标注"未验证" |
| 生成产物可移植性 | 产物强绑模板与 pnpm 锁文件，脱离平台无法直接运行 |

## 3. 如果继续投入

优先级判断标准：**可用性 > 能力广度 > 商业化**。当前最大的风险不是"功能太少"，而是"部署一次踩十个坑"和"验收覆盖不到真实业务"。

### P0 — 直接影响"能不能用起来"

1. **部署自检与一键化**（价值最高）
   现状：`.env` 缺失、路径权限、原生模块 ABI、dev/prod 混用、SQLite 只读等问题的报错都很隐晦，需要逐条人肉排查。
   做法：启动时做前置自检（Node 版本、`better-sqlite3` 可加载、`WORKSPACE_ROOT`/`DATABASE_PATH` 可写、bwrap 预检、密钥格式 ASCII 校验），失败时输出**带修复建议**的中文错误；`/api/health` 扩展为诊断端点。
   理由：这是本次实际部署中耗时最多的部分，收益立竿见影。

2. **模型配置的前置校验**
   现状：`sk-把这里换成你的key` 这种占位符能一路走到发请求才报 `ByteString`；base URL / 模型名不匹配也是运行时才炸。
   做法：`isModelConfigured()` 增加字符集与端点格式校验，启动时探测一次 `/models`，结果写进健康检查。

3. **`/s/` 补齐 WebSocket 代理**
   现状：生产版本页面里若有自建 WS/SSE 会静默失败，而 `docs/delivery.md` 承诺 `/s/` 是完整生产形态。
   做法：`server.mjs` 增加 `/s/` 的 upgrade 分支，复用 `/p/` 的转发逻辑。

### P1 — 决定"生成结果够不够用"

4. **多脚手架支持**
   把 `scaffold` 与 `verify`/发布链路的"框架假设"抽成适配层（Next / Vite / 静态），至少让 Vite 能走完 build + 发布。
   理由：现在所有产物长得一样，用户需求多样性被模板吃掉。

5. **验收能力扩展**
   动作集加 upload / drag / iframe / 多标签；断言加 DOM 快照对比与可访问性检查；`plan` 缺 `acceptance` 时不再降级为冒烟，而是回退到"按 SPEC 页面清单生成默认检查"。

6. **发布速度与保留策略**
   增量安装（复用 pnpm store）、构建缓存、保留份数可配置。当前每次发布全量重装+重构建，是体验瓶颈。

7. **可观测性**
   `generation_runs` 已有 token 统计，把它做成面板：每阶段耗时、失败分类分布、修复轮次分布。没有这些数据，优化全靠猜。

### P2 — 产品化才需要

8. **认证与多租户**：`users` 表落地 + 会话 + 项目归属隔离；在此之前必须靠反代层保护。
9. **计费与配额**：按 token/生成次数计量，前置限流。
10. **云托管与域名**：自动域名、证书、独立子域；涉及基础设施，投入产出比最低，建议最后做。

### 一句话建议

先把 **P0 的三项** 做完——它们不增加能力，但决定这套东西能否被别人独立部署成功；然后做 **P1 的 4 和 5**，把"生成的东西真能用"这件事坐实。认证、计费、托管在单机验证阶段都属于伪需求。

## 附：部署时要留意的事实

- `.env` 必须放 `app/.env`（`server.mjs` 以 `process.cwd()` 加载），且已存在的 `process.env` 优先级更高（面板注入的变量会覆盖文件）。
- 生产必须 `npm run build && npm run start`；`npm run dev` 会导致 chunk 哈希漂移、水合失败，表现为"样式丢失 + 按钮无响应"。
- `data/` 由 root 创建后，非 root 运行用户读写会失败（`EACCES` / `SQLITE_READONLY`），需要 `chown -R <用户> data` 并重启进程（SQLite 只读模式在连接时确定）。
- `WORKSPACE_EXECUTION_BACKEND=native` 要求 `bwrap --unshare-user --unshare-pid --ro-bind / / /usr/bin/true` 可执行，否则平台拒绝启动（这是预期的安全行为，不应降级）。
