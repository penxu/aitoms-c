# 单页生成与房间应用迁移验收

## 范围

新生成的应用默认采用根路由工作区，常规新建、编辑、详情与列表用本地状态/弹窗/面板操作。分享、登录回调等确需独立地址的页面可以保留，并使用 NavigationLink 与 loading.tsx 提供即时反馈。编辑器、3D 等模块按需加载，首页只读必要数据；API 路由、SQLite 持久化和未保存保护保留。

既有应用仅改造用户授权的 `p_mwhm79h1fjqv1c` 房间项目。源码补丁、摘要清单及可重复执行的迁移器位于 `scripts/project-upgrades/room-single-page/`。其他存量项目需要针对自身组件和数据模型迁移，不能通过覆盖一个模板安全完成。

平台 HMR 代理先验证外部 Origin 与 Host 同源，再将上游 Host/Origin/forwarded identity 统一为 localhost:port。拒绝第三方来源，不使用通配跨域白名单。该平台改动需部署新版平台并重启自定义 server.mjs 才生效。房间应用的定向配置先允许用户提供的公网 IP，以兼容尚未升级的平台代理。

## 本地证据

- 平台 `npm run lint`、`npm run typecheck`、`npm run build` 通过。平台构建用于验证仓库，生成项目仍启动开发服务。
- `npm run test:unit`：336 项通过，0 失败，0 跳过；包括默认单页提示词/模板契约及同源、跨源、非法来源、非法端口 HMR header 测试。
- 房间源码在真实 runCommand 隔离环境启动 Next.js 16 webpack dev，独立测试 SQLite，不使用线上业务数据。类型检查通过，无生产 BUILD_ID。
- Chrome 验收：新建弹窗、创建房间、懒加载编辑器、添加家具、未保存离开保护、实际保存 SQLite、刷新恢复、项目列表与再次打开。扩展测试覆盖超过首页 3 条限制的完整列表、直接 hash 刷新、延迟创建响应不能抢走编辑器或丢失修改、返回导航后脏状态复位、375px 无横向溢出。无页面运行异常。弹窗打开观测约 0.15–0.48 秒（本地测试值，不承诺公网固定延迟）。
- 真实 Next.js dev HMR：公网同源经同一 header helper 转发后返回 101；第三方来源返回 403，未连接上游。
- 真实平台 server.mjs 在首个 HTTP 请求后再进行 WebSocket 握手：修复前 socket hang up，修复后通过。NextCustomServer 会自动向 httpServer 注册 upgrade 监听器，因此为其提供独立、不监听端口的事件宿主；/p/ 只由预览代理处理，其余升级才转交 Next。另启动开发模式平台验证平台自身 /_next/hmr 收到 isrManifest / turbopack-connected，预览探针也通过。可重复回归：先构建平台，然后在仓库根执行 `node scripts/checks/preview-upgrade.mjs`（占用测试平台端口3009、探针端口4997，使用临时数据库）。
- 独立审查发现并修复完整列表截断、返回后脏状态残留、延迟创建响应的旧闭包问题；最终复审无未解决的重要问题。

## 线上状态

已通过项目文件 API 校验全部旧文件 SHA256 后写入 9 个文件；新组件先写，根入口最后写，API 在首次写入前保护原预览快照。开发预览重启成功，运行新 preview 候选，Next Ready 约3.3秒。未请求生产构建，未修改数据库。只读业务API检查返回原有空列表。

公网浏览器能看到新页面与新按钮，但原线上平台的重复 upgrade 处理仍关闭 HMR，造成客户端未完成激活，点击新建未打开弹窗。已复现并修复平台代码，不能将此次线上交互验收标为通过。项目内 allowedDevOrigins 不能解决平台代理重复处理；需要部署下面的平台服务器修复后再复验。当前没有服务器SSH/面板连接，不能直接替换平台宿主文件。

## 线上最后一步

将仓库 `app/server.mjs` 与新增的 `app/preview-proxy-headers.mjs` 一起上传，替换服务器 `/www/wwwroot/aitoms-c/app/` 中的对应文件（先备份原server.mjs，保持www可读取）。通过原面板重启该平台Node进程。两份文件属于自定义服务器运行时代码，这一步无需生产构建用户应用。重启后打开原预览地址，检查新建弹窗及HMR握手。仅重启生成项目服务不会加载平台server.mjs修复。

要让后续生成使用新的单页规则与导航模板，还需要按原方式部署本仓库的平台代码及templates；这是平台版本更新，与生成项目生产构建无关。
