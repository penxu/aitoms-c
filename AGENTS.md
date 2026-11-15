# AGENTS.md

给在本仓库工作的 AI 编码代理的项目说明。个人化的临时设置请写进 `AGENT.local.md`（不提交），不要改本文件。

## 这是什么

**Atoms Clone**：一个云端 AI 编程平台。用户在落地页描述需求，AI 在服务器上创建项目、读写代码、安装依赖、启动服务，最终通过子路径 URL（`/p/{projectId}` 开发预览、`/s/{projectId}` 固定生产版本）访问生成的应用。

技术栈：Next.js 16（App Router）+ shadcn/ui + assistant-ui + Vercel AI SDK + SQLite（better-sqlite3 + drizzle-orm）+ Node 子进程端口池（4000–4999）+ 子路径反向代理。

## 仓库结构

```
.
├─ app/                  Next.js 应用（唯一的 package.json / node_modules 在这里）
│  ├─ src/app/           路由：/ 落地页、/app/{id} 工作台、/api/*、/p/*、/s/*
│  ├─ src/components/    marketing / dashboard / workspace / layout / ui
│  ├─ src/lib/           核心逻辑，按领域分目录（见下）
│  ├─ server.mjs         自定义服务器（HTTP + WebSocket 代理）
│  ├─ deploy/            nginx.conf 等部署配置
│  └─ AGENTS.md          由 `next dev` 自动生成，勿手工大改
├─ templates/            生成项目所用的脚手架模板（next-base 等）
├─ openspec/             规格驱动工作流：specs（source of truth）、changes、archive
├─ docs/                 交付说明与设计文档
└─ data/                 运行时数据，已 gitignore（SQLite + 用户项目工作区）
```

`src/lib/` 分层：

| 目录 | 职责 |
|---|---|
| `ai/` | 模型配置、harness 工具集（`tools.ts`）、消息转换 |
| `workspace/` | 项目目录内的文件读写、命令执行、端口分配、包管理器、工具链 |
| `runner.ts` | 用户项目进程的启动 / 停止 / 重启 |
| `db/` | drizzle schema、连接、查询 |
| `generation/` | 需求 → spec → plan → build → verify → delivery 流水线 |
| `releases/`, `packages/` | 生产版本、源码导出与部署包 |

## 常用命令

所有命令都在 `app/` 下执行（根目录没有 package.json）：

```bash
cd app
npm run dev        # node server.mjs，http://localhost:3000
npm run build      # next build
npm run start      # NODE_ENV=production node server.mjs
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm run test:unit  # node --experimental-strip-types --test src/lib/**/*.test.ts ...
```

单测用 Node 内置 `node:test` + `node:assert/strict`，不需要 vitest/jest。新增测试文件需同时加进 `package.json` 的 `test:unit` glob。测试内相对导入要写扩展名（`./plan-schema.ts`）。

## 编码约定

- TypeScript strict；导入用 `@/` 别名（映射到 `app/src/`）。
- 注释与面向用户的文案用中文，标识符用英文。
- 运行时代码用 `node:` 前缀导入内置模块（`node:fs`、`node:path`）。
- 配置集中在 `src/lib/config.ts`，全部来自环境变量并带默认值；不要在业务代码里散落 `process.env`。
- 新增 shadcn 组件放 `src/components/ui/`，业务组件按域放对应目录。
- 优先小范围精确修改；不要顺手重构无关文件。

## 硬性约束（不可协商）

- **路径安全**：所有文件 / 命令工具必须经 `resolveInsideProject()` 校验，限制在 `data/projects/{projectId}/` 内。禁止绕过 realpath 白名单，禁止接受 `../` 或符号链接逃逸。
- **命令执行**：只能走 `runCommand()`（黑名单 + 超时 + 输出截断），不要直接 `exec` 用户输入。
- **持久化**：只用 SQLite（WAL 模式），不引入外部数据库或 ORM 之外的存储。
- **端口**：只从 `PORT_RANGE_MIN..MAX` 池中分配，进程状态写 `processes` 表；平台启动时由 `instrumentation.ts` 清理孤儿进程。
- **代理**：开发预览 `/p/{id}` 与生产版本 `/s/{id}` 边界不要混淆，源码 / 进程 / 数据库隔离见 `docs/delivery.md`。

## 规格工作流（OpenSpec）

1. 改行为前先看 `openspec/specs/` 的当前规格；
2. 非平凡改动在 `openspec/changes/{change-id}/` 写 proposal + tasks + delta specs；
3. 完成后归档到 `openspec/archive/`，delta 合入 `openspec/specs/`。

项目定位与历史决策见 `openspec/project.md`。

## 注意事项

- **Next.js 16** 与训练数据中的版本有破坏性差异。写路由 / 缓存 / 配置文件前，先读 `app/node_modules/next/dist/docs/` 里的对应指南。
- `app/AGENTS.md` 由 `next dev` 自动重写，不要删除或大改；需要项目级约定时加在本文件。
- 不要提交 `data/`、`.env*`、构建产物或 `AGENT.local.md`。
- 完成后至少跑 `npm run lint` 与 `npm run typecheck`；改了 `src/lib/**` 或 `src/components/workspace/**` 还要跑 `npm run test:unit`。
