# 单页生成与既有房间应用迁移

> 使用 executing-plans 按任务实施。

**目标：** 同页操作、重模块懒加载、必要路由即时反馈，HMR同源代理可用。

**架构：** 新应用由提示词和模板提供统一契约；既有房间应用复用原API/编辑器，以hash与本地状态切换。WebSocket只规范化合法同源Origin。保留真实数据、未保存保护和开发预览。

- [x] 在generation测试目录增加提示词、模板契约与真实代理header单测，先确认缺实现失败。
- [x] 修改prompts/application-profile/CONVENTIONS，添加NavigationLink/loading模板和代理header模块；接入server.mjs。
- [x] 本地改房间SPA并在runCommand隔离下验证类型、页面、接口、保存、刷新、打开反馈；保留原源码备份。
- [ ] 通过已有文件与服务API更新授权线上项目，失败保留原预览与诊断。
- [ ] lint/typecheck/unit/build与真实WebSocket测试，更新文档及规格归档。

线上源码及开发服务已更新。公网HMR被原平台重复upgrade监听关闭，需部署本次server.mjs与helper后复验；不将该项误标完成。详见 docs/single-page-generated-apps-2026-11-15.md。
