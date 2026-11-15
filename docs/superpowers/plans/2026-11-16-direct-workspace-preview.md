# Direct workspace preview Implementation Plan

> **For agentic workers:** Use executing-plans inline. User explicitly requested implementation of the approved direct-preview workflow.

**Goal:** 项目源码→复用已有依赖→启动或复用dev服务→打开预览。
**Architecture:** preview默认分支直接准备根依赖并startService；显式重启/依赖更新用restartService；full分支保持候选构建。编辑与pipeline只在full保护快照。
**Tech Stack:** Next16、Node、SQLite、pnpm。
**Spec:** openspec/archive/2026-11-16-direct-workspace-preview/design.md

## Global Constraints
保留路径校验、命令隔离、mutation lease、端口池、SQLite数据和生产发布边界。

## Review Focus
运行复用、显式重启、依赖变更、旧候选迁移、安装失败/取消、full快照、非法路径。

## Tasks
- [x] 修改preview-refresh/pipeline并新增files入口回归，先运行观察失败。
- [x] 修改preview.ts根目录运行、scaffold依赖变更标志、service/chat区分运行和重启、files/pipeline默认取消快照；通过针对测试。
- [x] lint/typecheck/unit、真实开发进程与HMR检查，文档与规格归档。未经部署不能声明线上已生效。
