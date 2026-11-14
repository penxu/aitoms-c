# Delta: AI Chat（在线对话）

**Change ID:** `bootstrap-atoms-ai-builder`
**Affects:** `/app/{projectId}` 工作台、`/api/chat`

---

## ADDED

### Requirement: 流式对话

基于 Vercel AI SDK（Assistant）提供流式对话，前端使用 assistant-ui 的 Thread/Composer 组件渲染。

#### Scenario: 基本对话
- GIVEN 用户在工作台输入消息并发送
- WHEN `/api/chat` 处理请求
- THEN 回复以流式方式逐步渲染在 Thread 中

#### Scenario: 工具调用循环
- GIVEN 模型决定调用工具（如 write_file）
- WHEN 工具执行完毕
- THEN 结果回传模型继续推理，循环直至产生最终文本回复（支持多轮工具调用）

### Requirement: 工具调用过程可视化

#### Scenario: 显示 AI 动作
- GIVEN AI 正在执行文件读写或命令
- WHEN 工具调用进行中
- THEN 对话流中实时显示工具名与关键参数（文件路径/命令），完成后显示结果摘要

### Requirement: 对话历史持久化

#### Scenario: 刷新恢复
- GIVEN 项目已有若干轮对话
- WHEN 用户刷新或重新打开工作台
- THEN 全部对话消息从 SQLite 恢复显示

#### Scenario: 中断处理
- GIVEN 流式响应过程中连接中断
- WHEN 用户重新打开页面
- THEN 已持久化的消息不丢失，用户可继续对话

### Requirement: Agent 系统提示词

系统提示词声明 harness 工具集的使用规范：先读后写、小步修改、写后验证（起服务/访问预览）。

#### Scenario: 首条消息触发建项目
- GIVEN 项目目录为空且用户发送第一条需求描述
- WHEN 模型开始工作
- THEN 模型调用 `init_project` 生成脚手架，再逐步写入业务代码
