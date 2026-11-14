# Delta: Runtime Proxy（项目运行时与子路径转发）

**Change ID:** `bootstrap-atoms-ai-builder`
**Affects:** 进程管理器、`/p/{projectId}/[[...path]]` 代理路由、Nginx 部署配置

---

## ADDED

### Requirement: 项目服务启动

平台以子进程方式在服务器上运行用户项目（dev 或 preview 模式），并从 4000–4999 端口池分配空闲端口。

#### Scenario: AI 启动服务
- GIVEN 项目代码与依赖就绪
- WHEN AI 调用 `start_service`（或用户点击工作台"运行"按钮）
- THEN 子进程启动、端口写入 processes 表、project.status 变为 running

#### Scenario: 端口分配不冲突
- GIVEN 端口池中部分端口已被占用
- WHEN 新项目启动
- THEN 分配一个未被占用且未在注册表中的端口

#### Scenario: 崩溃检测
- GIVEN 运行中的项目进程异常退出
- WHEN 进程管理器监听到 exit 事件
- THEN project.status 更新为 error/stopped，工作台可见

### Requirement: 子路径代理访问

用户通过 `/p/{projectId}/...` 访问其项目的本地服务。

#### Scenario: HTTP 转发
- GIVEN 项目 A 运行在 localhost:4100
- WHEN 用户访问 `https://平台域名/p/{projectId}A/index.html`
- THEN Next.js 代理路由将请求（含 headers、body、query）转发到 localhost:4100 并原样返回响应

#### Scenario: WebSocket 升级（HMR）
- GIVEN 用户浏览器访问项目页面且该项目为 dev 模式
- WHEN 客户端发起 WebSocket Upgrade 请求
- THEN 代理建立隧道，HMR 热更新正常工作

#### Scenario: 项目未运行
- GIVEN 项目未启动或已停止
- WHEN 用户访问其 `/p/{projectId}/` 路径
- THEN 返回明确的"服务未运行"提示页（而非裸 502）

### Requirement: Nginx 外层转发

生产部署时，Nginx 在最外层对 `/p/` 做子路径转发到 Next.js，与既有前后端转发配置模式一致。

#### Scenario: 生产访问
- GIVEN Nginx 配置 `location /p/ { proxy_pass http://127.0.0.1:3000; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }`
- WHEN 用户经域名访问 `/p/{projectId}/`
- THEN 请求穿透 Nginx → Next.js 代理 → 项目服务，全链路可用（含 WebSocket）

### Requirement: 进程生命周期治理

#### Scenario: 孤儿进程清理
- GIVEN 服务器重启导致进程表与实际进程不一致
- WHEN 平台启动
- THEN 清理数据库中已无对应 pid 的进程记录，项目状态回写 stopped

#### Scenario: 停止服务
- GIVEN 项目运行中
- WHEN AI 调用 `stop_service` 或用户点击"停止"
- THEN 子进程树被终止（含子进程）、端口释放、状态更新
