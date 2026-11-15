# Generation Discussion Implementation Plan

> **For agentic workers:** Use executing-plans to implement inline, task by task.

**Goal:** 在生成工程前评估需求，持久化暂停并收集选择后恢复原任务。

**Architecture:** 增加 discuss 阶段和 waiting 状态。独立 DiscussionStore 在 SQLite 中保存版本与答案，事务校验提交；后台阶段返回后释放租约。工作台使用同一事件流与状态接口恢复问题。

**Tech Stack:** Next.js 16、React、AI SDK、better-sqlite3、Node test。

### 1. 讨论数据与状态
- [x] 在 app/src/lib/generation/discussion.test.ts 先写内存 SQLite 测试：原始需求不变、重开 store 保留、过期答案拒绝、重复答案幂等、取消不能恢复、唯一活动任务。
- [x] 执行 node --experimental-strip-types --test src/lib/generation/discussion.test.ts，确认失败。
- [x] 实现 discussion-schema.ts 与 discussion-store.ts：有界模型结构、选项和文本校验、事务 compare-and-set。
- [x] 原命令验证通过。

### 2. 分析、暂停与恢复
- [x] 扩展 pipeline.test.ts，验证等待时未运行 scaffold，恢复携带确认上下文。
- [x] 实现 discussion.ts 模型调用与持久化关卡；扩展 types、pipeline、数据库 active 查询与唯一性；mutations 拦截 waiting 的普通修改。
- [x] 扩展 generate POST 支持版本化 answer；generation GET 提供持久化讨论。
- [x] 跑 discussion/pipeline/recovery/events 测试，确认等待不被恢复逻辑误判且取消不会复活。

### 3. 工作台交互
- [x] 新建 generation-discussion.tsx：摘要、fieldset/radio、推荐理由、自由补充、确认、采用推荐、取消；请求失败保留输入。
- [x] workspace.tsx 衔接答案与快照，chat-panel.tsx 待回答禁用普通修改；阶段摘要和时间线显示 waiting，去除旋转与健康异常提示。
- [x] 添加 presentation 测试，等待用户不可显示完成或运行中。

### 4. 验收与记录
- [x] npm run typecheck、npm run lint、npm run test:unit。
- [x] 实际 API 和浏览器验证模糊需求暂停、刷新恢复、键盘选项、手机布局、确认续跑与取消；模型错误保留重试。
- [x] 独立 NEXT_DIST_DIR 生产构建；更新 OpenSpec 任务与验收说明，保留用户其他未提交工作。
