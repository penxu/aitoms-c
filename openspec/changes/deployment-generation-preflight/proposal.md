## Why
面板部署中的非 ASCII 模型密钥可在请求头构造时触发 ByteString，Docker CLI 又可能继承错误的 HOME 或丢失连接配置。早期生成失败后普通聊天还可能把故障报告当作新应用。
## What Changes
增加不泄露凭据的模型配置校验、可信 Docker CLI 环境构造、明确的部署诊断；恢复聊天携带原始需求与确认决定，早期失败通过明确续跑入口恢复。
## Capabilities
### New Capabilities
### Modified Capabilities
- `generation-reliability`: 配置预检与保留原目标的失败恢复。
## Impact
模型配置、Docker CLI 环境、聊天恢复、面板部署诊断与说明；不自动修改服务器权限、不挂载 Docker socket、不降低隔离。
