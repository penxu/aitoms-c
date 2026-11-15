# One-prompt App Delivery Implementation Plan

> **For agentic workers:** Use Superpowers execution and verification skills. Steps use checkboxes for tracking.

**Goal:** 在原页面框架内完成一句话生成、预览、独立发布、回滚和部署包。
**Architecture:** 现有生成与开发 runner 保留；新增源码快照、生产发布数据库、生产进程与代理。发布、生成规则和 UI 分文件负责，通过以下 JSON 接口连接。
**Tech Stack:** Next.js 16、React、SQLite、AI SDK、Tailwind、archiver。
**Spec:** openspec/changes/one-prompt-app-delivery/design.md（用户于 2026-11-14 确认）。

## Global Constraints

- 保留 `/`、`/dashboard`、`/app/{id}` 及原区块顺序。
- 独立生产 URL `/s/{id}`，开发预览 `/p/{id}`；所有发布必须固定快照、探活后切换。
- 生产、开发、测试数据库隔离；不自动迁移开发数据。
- 不设置产品 token 配额；保留取消、超时、有限修复。
- 已有规格和历史数据保留；不将本地 URL 称为已上线公网。

## Review Focus

- 导出秘密、数据库旁路文件与外部链接：快照测试必须排除。
- 构建失败/探活失败/端口耗尽：旧活动版本不切换，状态可恢复。
- 开发修改与重复发布：项目任务互斥、快照固定、生产数据不污染。
- 子路径导航、静态资源、API：代理保留 basePath 并执行实际访问测试。
- 刷新、网络错误、移动端：恢复任务、保留输入、无横向溢出。

## Task 1 — 源码快照与部署包

Files: `app/src/lib/packages/source.ts`, `archive.ts`, `source.test.ts`; existing export route.
Interfaces: `collectSource(root): SourceFile[]`, `snapshotSource(root,destination): {sourceHash,files}`, `createProjectArchive(root,metadata): Promise<Buffer>`.
- [ ] 编写临时目录测试：源码保留，env/密钥/数据库/git/链接排除，哈希随源码变化，路径非法失败。
- [ ] 运行测试确认缺模块失败；实现白名单遍历、固定哈希、快照及完整归档。
- [ ] 生成 Dockerfile、Compose、环境示例、README、manifest；解压检查并验证草稿/已验证标志。
- [ ] 更新导出 API，错误在响应前捕获，取消与资源清理；测试再跑通过。

## Task 2 — 发布存储与状态机

Files: `app/src/lib/releases/{store,process,pipeline,types,commands}.ts`, tests; db initialization, runner, instrumentation.
Interfaces: Release `{id,projectId,sourceHash,status,createdAt,finishedAt,error}`; event `{id,releaseId,message,createdAt}`. `startRelease(id): Release`, `rollbackRelease(projectId,releaseId): Release`, `getDeployment(projectId)`.
- [ ] 先测试同项目单任务、失败不改变活动版本、回滚归属、初始化幂等和中断恢复。
- [ ] 实现 releases/release_events/release_processes/project_deployments，事务切换及有界日志。
- [ ] 发布快照使用 `/s/{id}` 构建，生产 start、健康检查；全局单构建队列，共享端口分配锁。
- [ ] 单独数据目录注入生产实例，恢复活动实例并清理历史五个之外的产物；失败保持旧版。
- [ ] 验证失败测试、数据隔离及真实进程启动，记录结果。

## Task 3 — 发布 API 与生产代理

Files: release API routes, `/s/[projectId]/[[...path]]/route.ts`, Nginx/env configuration.
Interfaces: GET releases returns `{releases,activeReleaseId,publicOrigin,productionUrl,localUrl,busy}`; POST returns `{release}` with 202. detail returns `{release,events}`; rollback POST returns `{release}`. Errors `{error}`.
- [ ] 验证参数、项目和版本归属，重复任务复用；实现路由。
- [ ] 生产代理保留前缀、流式 body、过滤逐跳 headers；实际请求检查资源和 API。
- [ ] 原 export URL 默认 source；deploy 支持 releaseId 固定版本；验证未验证包不显示已验证。

## Task 4 — 生成质量

Files: generation prompts/spec schema/tests, generate/chat routes, template database.
- [ ] 模型缺配置及设计/验收 schema 测试先失败；实现入口校验和设计、核心流程、外部依赖提示。
- [ ] 保持幂等恢复取消；生成验证报告明确区分构建/探活和业务人工验收，不假报全功能验证。
- [ ] 模板数据库支持 ATOMS_DATA_DIR，本地默认兼容，生产配置独立。
- [ ] 实际模型运行参考预约应用并检查表单持久化；不可用时记录真实限制，任务不虚勾。

## Task 5 — 原框架的视觉与交付交互

Files: marketing/dashboard/workspace/layout components, styles, new release-panel.
- [ ] 记录旧版截图；在原区块顺序内升级暖白、品牌蓝、排版留白、细边框和统一图标。
- [ ] 添加发布面板，按 Task 3 JSON 接口调用，轮询进度及历史，错误保留上下文；下载用真实响应处理。
- [ ] 加入移动导航、对话/代码/预览切换、设备预览和可访问标签。
- [ ] 三视口、键盘、错误、空状态、减少动效检查；去除伪造计费/集成承诺。

## Task 6 — 集成、文档及交付

- [ ] 执行 unit/typecheck/lint/build，修复新增错误。
- [ ] 浏览器执行创建→生成→预览→发布→修改草稿→回滚→下载，记录证据。
- [ ] 解压源码到全新目录，以根路径安装构建启动；容器及公网环境存在时执行对应验收，否则保留未验证项。
- [ ] 更新 README、配置示例和 OpenSpec 精确完成状态；新上下文审查后处理实质问题。

## Execution decisions

用户已确认实施；不再次为执行方式请求确认。在当前工作目录创建 codex 功能分支，保留现有依赖和数据以便真实验收；不创建额外工作树。按 dispatching-parallel-agents 技能把不共享文件的生成规则和 UI 委派，主代理完成发布后端及接口，最后统一审查。
