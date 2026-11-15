## Why
开发预览中多路由首次编译和无反馈的导航影响操作响应，WebSocket代理保留公网Origin导致Next16 HMR拒绝。
## What Changes
默认生成单页工作台，常用操作用本地面板/抽屉，重模块按需加载。必要跳转用导航反馈与loading边界。修复同源预览HMR代理并拒绝跨源WebSocket。将已授权房间项目改为同页操作，保持现有API与数据库。
## Capabilities
### Modified Capabilities
- generation-reliability: 单页生成与即时交互。
## Impact
提示词、模板组件、开发WebSocket代理；仅迁移用户明确授权的房间项目，不批量重写其他项目、不运行生成应用生产构建。
