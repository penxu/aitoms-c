## Why
模板缓存命中仍复制整棵node_modules，并在每次复用时全量哈希，拖慢新项目与启动。用户已批准相同依赖共享只读包，先覆盖默认模板。
## What Changes
Linux bwrap和Docker对兼容模板项目共享平台准备的只读node_modules，项目根下仅保留挂载点；SQLite持久化可信绑定，不采纳项目自报外部路径。缓存发布完整验证，进程内复用不可变缓存认证；启动检查小型身份元数据。定制依赖/不支持的后端保留独立安装。切换运行后回收旧项目依赖副本，保留数据和编译缓存。
## Capabilities
### Modified Capabilities
- generation-reliability: 只读共享模板依赖。
## Impact
模板缓存、依赖识别、执行挂载、runner启动指纹与导出边界；不修改路径白名单，不共享可写依赖。
