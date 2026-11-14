# Delta: Data Persistence（SQLite 持久化）

**Change ID:** `bootstrap-atoms-ai-builder`
**Affects:** 数据层（better-sqlite3 + drizzle-orm）

---

## ADDED

### Requirement: SQLite 内置数据库

平台使用 SQLite 作为唯一持久化存储，Next.js 后端启动即自带数据库服务，不依赖外部数据库。

#### Scenario: 零配置启动
- GIVEN 全新环境未初始化数据库
- WHEN 平台首次启动
- THEN 自动创建 `DATABASE_PATH` 指向的 SQLite 文件并执行 schema（WAL 模式）

### Requirement: 核心数据模型

表结构：

- `users`：用户（首版最简会话标识）
- `projects`：id、name、description、workspacePath、assignedPort、status（created/generating/running/stopped/error）、createdAt/updatedAt
- `threads`：对话线程，归属 project
- `messages`：消息（role/content/工具调用记录），归属 thread
- `processes`：projectId、pid、port、status、lastHeartbeat

#### Scenario: 项目全生命周期记录
- GIVEN 项目从创建到运行到停止
- WHEN 各事件发生
- THEN projects.status 与 processes 记录同步更新，无悬挂状态

### Requirement: 重启持久

#### Scenario: 服务器重启
- GIVEN 平台已有用户、项目与对话数据，服务器重启
- WHEN 平台重新启动
- THEN 所有数据完整恢复；运行中项目由孤儿清理流程标记为 stopped（详见 runtime-proxy）

### Requirement: 并发安全

#### Scenario: 并发写
- GIVEN 多个请求同时写入（如对话消息 + 文件操作日志）
- WHEN 并发事务提交
- THEN WAL 模式下无锁死、无数据损坏，短事务全部成功
