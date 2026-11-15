# Template dependency reuse implementation plan

> **For agentic workers:** Use executing-plans to implement this plan task by task.

**Goal:** 同模板新项目无需重复安装，依赖副本支持写时复制并保持独立写入。

**Architecture:** 可信模板在独立临时项目 staging 安装后原子发布统一缓存；项目异步克隆缓存的模块与锁文件，最终写入项目自身成功指纹。额外依赖、脚本、配置、锁文件或运行环境不一致回退独立安装。CoW 不支持时复制回退，保持现有路径边界。

**Tech Stack:** Node fs.promises / COPYFILE_FICLONE，现有 pnpm、runCommand、Next.js。

## Task 1: Template cache module
- [x] 在 generation/template-dependencies.test.ts 编写实际临时目录测试：匹配清单、环境键、两次请求仅安装一次、锁文件冲突、失败清理、取消、相对链接及缓存移除后仍能 require；先运行确认缺少模块失败。
- [x] 实现 template-dependencies.ts：纯键函数、严格 manifest 比较、独立可信 staging、异步封闭链接检查、原子发布与恢复。

## Task 2: Installation integration
- [x] scaffold.ts 在完整成功指纹命中之后、独立安装之前尝试固定模板缓存；使用 resolveInsideProject/ensureRuntimeDirectory 校验路径，安装仍只经 runCommand。
- [x] 用 COPYFILE_FICLONE 实现异步缓存复制；保留同步公共 API 的兼容并给其复制启用 CoW。
- [x] 添加安装链路测试，检查匹配模板跳过安装，缓存失败和定制项目回退。

## Task 3: Verification and delivery
- [x] 在 app 执行 npm run test:unit、npm run lint、npm run build，随后 npm run typecheck；检查真实模块加载和跨项目修改隔离。
- [x] 记录首装成本、文件系统条件、du 解释、缓存升级和回退方式；更新规格并归档。
