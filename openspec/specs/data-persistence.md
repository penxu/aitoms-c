# Data Persistence Specification

> 来源：change `bootstrap-atoms-ai-builder`（2026-11-12 归档）
> 影响范围：数据层（better-sqlite3 + drizzle-orm）

## Requirements

### Requirement: SQLite 内置数据库

平台使用 SQLite 作为唯一持久化存储，Next.js 后端启动即自带数据库服务，不依赖外部数据库。

实现位置：`app/src/lib/db/index.ts`（WAL 模式、幂等 DDL、全局单例）

#### Scenario: 零配置启动
- GIVEN 全新环境未初始化数据库
- WHEN 平台首次启动
- THEN 自动创建 `DATABASE_PATH` 指向的 SQLite 文件并执行 schema（`journal_mode=WAL`）

### Requirement: 核心数据模型

实现位置：`app/src/lib/db/schema.ts`

- `users`：id、createdAt
- `projects`：id、name、description、workspacePath、assignedPort、status（created/generating/running/stopped/error）、createdAt/updatedAt
- `threads`：id、projectId、createdAt
- `messages`：id、threadId、projectId、role、partsJson（UIMessage parts）、createdAt
- `processes`：id、projectId（唯一）、pid、port、status（running/stopped/crashed）、command、lastHeartbeat、startedAt、stoppedAt

#### Scenario: 项目全生命周期记录
- GIVEN 项目从创建到运行到停止
- WHEN 各事件发生
- THEN `projects.status` 与 `processes` 记录同步更新，无悬挂状态

### Requirement: 重启持久

#### Scenario: 服务器重启
- GIVEN 平台已有用户、项目与对话数据，服务器重启
- WHEN 平台重新启动
- THEN 所有数据完整恢复；运行中项目由孤儿清理流程标记为 stopped（见 runtime-proxy）

### Requirement: 并发安全

#### Scenario: 并发写
- GIVEN 多个请求同时写入（如对话消息 + 文件操作日志）
- WHEN 并发事务提交
- THEN WAL 模式下无锁死、无数据损坏，短事务全部成功
