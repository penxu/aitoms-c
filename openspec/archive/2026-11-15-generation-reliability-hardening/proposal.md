# Why
生成引擎审查已复现代码归一误改、并发孤儿进程、续跑覆盖、缺文件无法修复与验收缺口，用户已要求逐项完善。
# What Changes
安全的语法级转换；项目互斥和进程身份恢复；生成超时/心跳与文件级检查点；导出契约上下文；可创建文件的错误分类修复；需求覆盖门槛、浏览器/API验收；统一依赖与运行隔离；按应用类型提供UI骨架。
# Capabilities
## New Capabilities
- generation-reliability: 可恢复、可验证、互斥且隔离的应用生成。
# Impact
app/src/lib/generation、workspace、runner、chat、模板、测试及部署文档。保留既有路由和用户源码/数据库，不自动重建旧任务。
