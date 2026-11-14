# Proposal: Atoms 云端 AI 编程平台（Bootstrap）

**Change ID:** `bootstrap-atoms-ai-builder`
**Created:** 2026-11-12
**Status:** Implementation Complete
**Completed:** 2026-11-12

---

## Problem Statement

当前只有一个静态营销落地页 [atoms-clone.html](../../../atoms-clone.html)（Atoms：用 AI 构建网站与应用），它宣传的核心能力——"AI 员工，几分钟内从想法到上线"——背后没有任何真实产品支撑：

- **没有在线对话能力**：用户无法与 AI 交互来描述需求
- **没有项目管理能力**：用户创建"项目"后，服务器上不存在对应的项目文件夹，AI 无法读写代码
- **没有运行时能力**：即使生成了代码，也无法在服务器上跑起来供用户访问
- **没有数据持久化**：用户、项目、对话记录无处存储

目标用户：想快速把想法变成可运行产品的非程序员/独立开发者。

## Proposed Solution

构建一个 Next.js 单体应用（App Router），分四层实现落地页宣传的核心闭环：

### 1. 在线对话（AI SDK + assistant-ui）

- 前端用 **assistant-ui** 的聊天组件（Thread / Composer / 消息流），配合 **shadcn/ui** 还原 atoms-clone.html 的视觉风格
- 后端用 **Vercel AI SDK（Assistant）** 的 `useChat` / Route Handler 流式对话
- AI 不是普通聊天机器人，而是**编码 Agent**：挂载完整 harness 工具集（见第 2 层），在工具调用循环中完成"创建文件 → 写代码 → 装依赖 → 起服务"的全流程

### 2. 项目工作区 + Harness Agent 工具集

- 用户创建项目时，在服务器 `WORKSPACE_ROOT/{projectId}/` 下生成独立文件夹
- AI 通过服务端工具对该目录拥有**完整读写权限**，工具集对标 harness agent：
  - 文件类：`read_file`、`write_file`、`edit_file`（diff 补丁）、`list_files`（树形）、`search_files`（glob/grep）、`delete_file`
  - 执行类：`run_command`（在项目目录内执行 bash，支持超时与输出截断）
  - 项目类：`init_project`（脚手架模板）、`install_deps`
- 所有工具通过路径白名单强制限制在项目目录内（防目录逃逸）

### 3. 项目运行时 + 子路径转发

- 项目代码就绪后，平台在服务器上以子进程启动该项目的 dev/preview 服务，从 4000–4999 端口池分配空闲端口
- Next.js 提供 catch-all 代理路由 `/p/{projectId}/[[...path]]`：将 HTTP 请求（含 WebSocket Upgrade，兼容 HMR）转发到 `localhost:{port}`
- 生产部署时外层 Nginx 对 `/p/` 做同样的子路径转发（proxy_pass → Next.js，携带 Upgrade 头），与既有的前后端转发配置模式一致
- 进程生命周期（启动/停止/重启/崩溃检测）记录到 SQLite，平台重启后可恢复或清理孤儿进程

### 4. 数据持久化（SQLite）

- 使用 SQLite（better-sqlite3 驱动 + drizzle-orm），Next.js 后端启动即自带数据库，无需外部数据库服务
- 核心表：`users`、`projects`（含端口分配、状态）、`threads` / `messages`（对话历史）、`processes`（运行时进程注册表）
- 数据库文件与用户项目同处服务器文件系统，统一备份策略

## Scope

### In Scope

- 落地页 UI 复刻（Next.js + shadcn/ui + Tailwind，响应式）
- 工作台页面：对话区 + 项目文件树 + 在线预览 iframe
- AI 对话后端（流式 + 工具调用循环）
- Harness 工具集（文件读写、命令执行、路径安全限制）
- 项目进程管理 + 端口分配 + `/p/{projectId}` 子路径代理（HTTP + WebSocket）
- SQLite schema + 数据访问层
- Nginx 子路径转发配置示例

### Out of Scope

- 多租户计费/支付（落地页定价区仅为静态展示）
- 用户注册登录体系（首版用最简会话标识，认证体系另立提案）
- AI 团队多角色协作（落地页"AI 团队"区为营销内容）
- 容器级沙箱隔离（首版依赖路径白名单 + 超时限制；Docker 沙箱另立提案）
- 可视化编辑器、SEO 智能体等 bento 卡片中的扩展功能

## Impact Analysis

| Component | Change Required | Details |
|-----------|-----------------|---------|
| Database | Yes | 新建 SQLite schema：users / projects / threads / messages / processes |
| API | Yes | `/api/chat`（流式工具循环）、`/api/projects` CRUD、`/p/[projectId]` 代理 |
| State | Yes | 项目状态机：created → generating → running → stopped / error |
| UI | Yes | 落地页复刻 + 工作台（对话/文件树/预览三栏） |

## Architecture Considerations

- **单体优先**：平台与代理均在同一个 Next.js 应用内，降低部署复杂度；Nginx 只做最外层的子路径转发与静态加速
- **工具循环即产品核心**：`/api/chat` 的 tool-calling loop 是唯一写入口，文件操作/命令执行/进程管理全部封装为工具，便于审计与限流
- **安全边界**：路径白名单（realpath 校验）、命令黑名单 + 超时 + 输出截断、端口池互不冲突
- **可演进性**：进程管理器抽象为接口，未来可替换为 Docker/Podman 沙箱而不动上层

## Success Criteria

- [x] 落地页完成全部区块复刻，含 1024px / 640px 响应式断点
- [x] 用户输入一句话需求后，项目创建并进入工作台，AI 可调用工具链生成并启动服务（需配置模型 Key 实测）
- [x] 用户可通过 `/p/{projectId}/` 访问到项目服务（HTTP 全链路已实测；WebSocket 代理按设计实现，未做 dev 项目实测）
- [x] 对话历史、项目记录持久化到 SQLite（重启恢复逻辑已实现，未做断电式重启实测）
- [x] AI 工具无法逃逸项目目录（`PUT ../../etc/evil.txt` 已实测被拒绝）

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| 子进程命令执行被滥用（危险命令） | Medium | High | 命令黑名单 + 超时 + 输出截断 + 仅限项目目录 cwd；后续提案引入容器沙箱 |
| WebSocket 代理不通导致 HMR 失效 | Medium | Medium | Next.js 代理路由显式处理 Upgrade；Nginx 配置携带 `Upgrade`/`Connection` 头；提供轮询降级 |
| 端口池耗尽 / 孤儿进程堆积 | Low | Medium | 进程注册表 + 心跳检测 + 平台启动时清理无主进程 |
| SQLite 并发写锁竞争 | Low | Medium | WAL 模式；写操作集中短事务 |
| better-sqlite3 原生模块与 Next.js 打包冲突 | Medium | Medium | `serverExternalPackages` 配置 + 构建验证纳入 Phase 0 |

---

## Archive Information

**Archived:** 2026-11-12
**Duration:** 1 天（创建与实施同日完成）
**Outcome:** Successfully implemented

### Files Modified

- `app/src/app/page.tsx`、`app/src/components/marketing/*`、`app/src/app/marketing.css` — 落地页复刻
- `app/src/components/workspace/*`、`app/src/app/app/[projectId]/page.tsx` — 工作台
- `app/src/app/api/chat/route.ts` — AI 对话与工具循环
- `app/src/app/api/projects/**` — 项目、文件、消息、服务 API
- `app/src/app/p/[projectId]/[[...path]]/route.ts` — HTTP 子路径代理
- `app/server.mjs` — 自定义服务器 + WebSocket 代理
- `app/src/lib/ai/tools.ts` — harness 工具集与系统提示词
- `app/src/lib/workspace/{paths,files,command}.ts` — 工作区读写与安全
- `app/src/lib/runner.ts`、`app/src/instrumentation.ts` — 运行时与孤儿进程清理
- `app/src/lib/db/{schema,index,queries}.ts` — SQLite 数据层
- `app/deploy/nginx.conf`、`README.md`、`app/.env.example`

### Specs Updated

- `openspec/specs/marketing-site.md`
- `openspec/specs/ai-chat.md`
- `openspec/specs/project-workspace.md`
- `openspec/specs/runtime-proxy.md`
- `openspec/specs/data-persistence.md`

### Verification

- `npx tsc --noEmit` 通过
- `npm run lint` 通过
- `npm run build` 通过（10 条路由）
- 集成验证：建项目 → 写文件 → 启动服务 → `/p/{id}/` 200 → 停止 → 503；路径逃逸被拒绝

