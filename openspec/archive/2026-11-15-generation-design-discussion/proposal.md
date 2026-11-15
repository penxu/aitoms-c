## Why
一句话需求不明确时当前流水线直接生成工程，缺少可恢复的用户讨论与选择，可能产出错误业务或显示为失败。
## What Changes
增加生成前的需求分析、持久化等待回答、版本化答案提交，以及工作台中的推荐选项和自由补充交互。保留明确需求的直接生成流程。
## Capabilities
### New Capabilities
- `generation-discussion`: 在生成前确认关键歧义并可靠恢复。
### Modified Capabilities
## Impact
影响 generation 类型、编排、SQLite 状态与唯一性、生成 API、工作台。无外部数据库或新增线上部署。
