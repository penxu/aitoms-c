# Implementation Tasks: Atoms 云端 AI 编程平台

**Change ID:** `bootstrap-atoms-ai-builder`

---

## Phase 0: 项目脚手架与基础设施

- [x] 0.1 `create-next-app` 初始化（TypeScript + Tailwind + App Router），配置 ESLint
- [x] 0.2 接入 shadcn/ui（`components.json` + 基础组件），接入 assistant-ui 依赖
- [x] 0.3 集成 SQLite：better-sqlite3 + drizzle-orm，配置 `serverExternalPackages`，开启 WAL 模式
- [x] 0.4 环境变量定义：`WORKSPACE_ROOT`、`PORT_RANGE_MIN/MAX`、`DATABASE_PATH`、模型 API Key（见 `.env.example`）
- [x] 0.5 构建验证：`next build` 通过，SQLite 原生模块无打包报错

**Quality Gate:** PASSED（`tsc --noEmit` 与 `next build` 均通过）

---

## Phase 1: 数据层（SQLite + Drizzle）

- [x] 1.1 编写 schema：`users`、`projects`（status/port/workspacePath）、`threads`、`messages`、`processes`
- [x] 1.2 数据访问层：项目 CRUD、线程/消息读写、进程注册表操作（`src/lib/db/queries.ts`）
- [x] 1.3 项目状态机常量：`created → generating → running → stopped → error`
- [x] 1.4 数据层验证：通过集成调用验证建项目 / 写消息 / 进程注册（未引入独立测试框架）

**Quality Gate:** PASSED（建项目返回完整记录，`data/atoms.db` 正常写入）

---

## Phase 2: 落地页复刻（marketing-site）

- [x] 2.1 还原设计令牌：颜色变量、IBM Plex 字体、圆角/阴影（`src/app/marketing.css`）
- [x] 2.2 逐区块复刻：top-banner、nav、hero、builds、trust 深色区、logo 墙、AI 团队、workflow、video、bento、stories、pricing（月/年切换）、FAQ（手风琴）、final-CTA、footer、float-tip
- [x] 2.3 reveal 滚动动画与 hover 交互（IntersectionObserver）
- [x] 2.4 Hero 输入框接入路由：提交即创建项目并跳转 `/app/{projectId}?q=...`
- [x] 2.5 响应式适配（1024 / 640 断点）

**Quality Gate:** PASSED（`GET /` 200，Hero 文案与截图区结构渲染正常）

---

## Phase 3: 工作台与在线对话（ai-chat）

- [x] 3.1 工作台布局：左侧文件树 + 中间对话（assistant-ui Thread）+ 右侧预览 iframe
- [x] 3.2 `/api/chat` Route Handler：AI SDK 流式响应 + 工具调用循环（`stopWhen: stepCountIs(30)`）
- [x] 3.3 对话历史持久化：thread/messages 写入 SQLite，刷新后恢复（`initialMessages` 注入 runtime）
- [x] 3.4 工具调用 UI：显示 AI 正在读/写哪个文件、执行哪条命令（ToolCallCard）
- [x] 3.5 错误与中断处理：AI SDK 原生流中断恢复；工具失败信息回传模型重试

**Quality Gate:** PASSED（`/app/{id}` 200；对话链路依赖模型 API Key，未在本地做真实调用）

---

## Phase 4: Harness 工具集与项目工作区（project-workspace）

- [x] 4.1 `init_project` 工具：static / vite 脚手架模板
- [x] 4.2 文件工具：`read_file` / `write_file` / `edit_file` / `list_files` / `search_files` / `delete_file`
- [x] 4.3 执行工具：`run_command`（cwd 锁定、超时、输出截断、命令黑名单）、`install_deps`
- [x] 4.4 路径安全层：realpath 白名单校验，拒绝 `../` 与符号链接逃逸
- [x] 4.5 工具描述与系统提示词：harness 风格工作规范
- [x] 4.6 文件树 API：`GET /api/projects/{id}/files`（树 / 单文件）、`PUT`（保存）

**Quality Gate:** PASSED（`PUT ../../etc/evil.txt` 被拒绝并返回明确错误）

---

## Phase 5: 运行时与子路径代理（runtime-proxy）

- [x] 5.1 进程管理器：端口池分配（4000–4999）、启动/停止/重启、pid 与状态写入 `processes`
- [x] 5.2 AI 工具 `start_service` / `stop_service` / `restart_service` + 工作台按钮
- [x] 5.3 代理路由 `/p/{projectId}/[[...path]]`：转发 HTTP；`server.mjs` 处理 WebSocket Upgrade（HMR）
- [x] 5.4 崩溃检测与状态回写：进程 exit 更新 `projects.status`
- [x] 5.5 平台启动清理孤儿进程（`src/instrumentation.ts`）
- [x] 5.6 工作台预览 iframe 指向 `/p/{projectId}/`，运行中自动刷新
- [x] 5.7 Nginx 配置样例：`app/deploy/nginx.conf`

**Quality Gate:** PASSED（`/p/{id}/` 从 503 变为 200 并返回项目内容；停止后回到 503）

---

## Phase 6: 集成与打磨

- [x] 6.1 端到端验证：创建项目 → 写文件 → 启动服务 → 子路径访问 → 停止
- [x] 6.2 SQLite 持久化验证：项目记录与进程状态跨请求一致
- [x] 6.3 安全自查：路径逃逸被拒绝、命令黑名单、端口互斥
- [x] 6.4 README：本地开发 + Nginx 部署说明

**Quality Gate:** PASSED

---

## Completion Checklist

- [x] All phases complete（对话需配置模型 Key 后方可实测生成）
- [x] All quality gates passed
- [x] Documentation synced
- [x] Ready for `/openspec-archive bootstrap-atoms-ai-builder`
