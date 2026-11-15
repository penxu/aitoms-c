## Why
普通运行/编辑仍复制源码与node_modules，为开发预览增加耗时与副本；用户已明确要求项目源码→复用依赖→启动或复用dev→打开预览。
## What Changes
默认预览直接运行项目根目录。运行复用根目录服务，显式重启或依赖变化时重启；旧候选在首次运行时切换到根目录。默认编辑/生成不固定旧预览快照，源码修改由HMR生效。full验证与生产发布继续隔离。
## Capabilities
### Modified Capabilities
- generation-reliability: 开发源码实时预览。
## Impact
workspace/preview、files API、pipeline、聊天工具；不弱化路径/执行隔离/端口/持久化保护。
