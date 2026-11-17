# Shared template runtime Implementation Plan

> Execute inline with executing-plans and TDD; user approved implementation. Final independent review required.

**Goal:** 兼容项目共用只读模板依赖，消除每个项目的恢复复制。
**Architecture:** SQLite可信绑定→受控缓存验证→隔离命名空间只读挂载。保留独立安装后备和发布边界。
**Spec:** openspec/archive/2026-11-17-shared-template-runtime/design.md

- [x] workspace/shared-dependencies.ts：SQLite绑定、身份校验、独立切换与清理；generation/shared-dependencies.test.ts先写失败测试。
- [x] template-dependencies.ts/scaffold.ts/dependency-cache.ts：共享回调、封存/快速认证、已有项目迁移、配置开关；模板测试先失败再通过。
- [x] execution.ts/container-execution.ts/runner.ts：只读挂载、启动指纹、成功后旧副本清理；真实Next和只读写入测试。
- [x] lint/typecheck/unit/build、只读审查、文档与归档。线上未部署不得声明生效。
