# Atoms Clone — 云端 AI 编程平台

复刻 `atoms-clone.html` 落地页，并实现其背后的真实产品：用户通过对话描述需求，AI 在服务器上创建项目、读写代码、安装依赖、启动服务，用户通过子路径直接访问生成的应用。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 16（App Router）+ shadcn/ui + assistant-ui + Tailwind v4 |
| AI | Vercel AI SDK（`streamText` + 工具调用循环） |
| 持久化 | SQLite（better-sqlite3 + drizzle-orm，WAL 模式） |
| 运行时 | Node 子进程 + 端口池（4000–4999）+ 子路径反向代理 |

## 架构

```
浏览器
 ├─ /                     落地页
 ├─ /app/{projectId}      工作台（文件树 / 对话 / 预览）
 ├─ /api/chat             AI 对话（harness 工具集）
 └─ /p/{projectId}/**  →  http://127.0.0.1:{port}/**（用户项目服务）
```

- 用户项目工作区：`data/projects/{projectId}/`，AI 通过工具集读写，路径限制在项目目录内（realpath 白名单，拒绝 `../` 与符号链接逃逸）
- 进程与端口注册在 SQLite `processes` 表；平台启动时通过 `instrumentation.ts` 清理孤儿进程
- WebSocket（HMR）由 `server.mjs` 自定义服务器代理，HTTP 由 Next Route Handler 代理

## 本地开发

```bash
cd app
cp .env.example .env.local     # 填入 OPENAI_API_KEY
npm install
npm run dev                    # 自定义服务器，http://localhost:3000
```

打开首页，在 Hero 输入框描述需求 → 自动创建项目并进入工作台。

## 生产部署

```bash
cd app
npm run build
npm run start                  # NODE_ENV=production node server.mjs
```

Nginx 反向代理配置见 [deploy/nginx.conf](app/deploy/nginx.conf)：

- `/` → Next.js
- `/p/` → Next.js（保留 `Upgrade` 头以支持用户项目的 WebSocket）

## AI 工具集（harness）

| 类别 | 工具 |
|---|---|
| 文件 | `read_file` `write_file` `edit_file` `list_files` `search_files` `delete_file` |
| 执行 | `run_command`（命令黑名单 + 超时 + 输出截断）`install_deps` |
| 项目 | `init_project`（static / vite 脚手架） |
| 运行时 | `start_service` `stop_service` `restart_service` |

## 数据模型（SQLite）

`users` / `projects` / `threads` / `messages` / `processes`，详见 [schema.ts](app/src/lib/db/schema.ts)。

## 规格文档

OpenSpec 工作流位于 `openspec/`：

- `openspec/project.md` — 项目约定
- `openspec/specs/` — 当前能力规格（source of truth）
- `openspec/archive/bootstrap-atoms-ai-builder/` — 首次变更的提案、任务与 delta 归档
