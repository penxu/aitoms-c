# Atoms Clone — 项目约定

## 项目定位

复刻 [atoms-clone.html](../atoms-clone.html) 落地页 UI，并构建其背后的真实产品：一个 **云端 AI 编程平台**。用户通过在线对话描述需求，AI 在服务器上创建项目、读写代码、安装依赖、启动服务，用户通过子路径 URL 直接访问自己生成的应用。

## 硬性约束（来自用户决策）

- 技术栈固定：**Next.js（App Router）+ shadcn/ui + assistant-ui + Vercel AI SDK（Assistant）**
- 数据持久化：**SQLite**（Next.js 后端自带数据库服务，不引入外部数据库）
- 动态创建的用户项目服务：通过 **Next.js 子路径转发 + Nginx 反向代理** 对外提供访问
- AI 拥有项目目录的**完整读写权限**，并配备**类似 harness agent 的全套工具与模块**

## 架构总览

```
浏览器
  │
  ├─ /                     营销落地页（复刻 atoms-clone.html）
  ├─ /app/...              平台工作台（对话 + 文件树 + 预览）
  ├─ /api/chat             AI 对话（AI SDK + harness 工具集）
  └─ /p/{projectId}/...    ──代理──▶ localhost:{分配端口}（用户项目服务）
                                    （Nginx 在最外层同样做子路径转发）
```

- **用户项目工作区**：服务器上 `WORKSPACE_ROOT/{projectId}/` 目录，由 AI 通过工具集读写
- **端口分配**：为每个运行中的项目分配 4000–4999 范围内的空闲端口，进程状态记录在 SQLite
- **进程管理**：平台负责启动/停止/重启用户项目的 dev 或 preview 进程

## 目录约定

- `openspec/specs/` — 当前能力规格（source of truth），由已归档的 delta 合并而成
- `openspec/changes/{change-id}/` — 进行中的变更提案（proposal.md / tasks.md / specs/ delta）
- `openspec/archive/{change-id}/` — 已完成的变更归档（含 proposal / tasks / delta specs）

## 工作流

1. `/openspec-proposal` 创建提案 → 评审
2. `/openspec-apply {change-id}` 实施
3. `/openspec-archive {change-id}` 归档，delta 合入 `openspec/specs/`
