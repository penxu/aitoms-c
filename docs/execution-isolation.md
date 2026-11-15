# 工程执行隔离与部署

新项目先通过文件操作完成工程骨架、规格、计划与源码生成，不在这些阶段初始化执行后端或执行 Git。运行验证阶段才准备隔离环境并安装依赖；成功后提交 Git。环境准备失败保留源码，可仅重试运行验证，不报告可用的新预览。已经运行于独立快照的旧预览继续保留；历史根目录预览仍须在改写源文件前完成安全迁移。

生成工程、安装脚本、构建和开发/生产进程都必须经过执行后端。`WORKSPACE_EXECUTION_BACKEND=auto` 优先使用 macOS `sandbox-exec` / Linux `bubblewrap`，实际启动探测失败后使用 Docker。没有可用后端时明确拒绝执行；`native` 和 `docker` 分别强制指定后端。环境采用白名单，平台模型凭据不会自动传给工程；业务环境只接受平台显式传入值。

## Linux 主机

推荐在支持非特权用户命名空间的 Linux 主机运行平台进程。安装 `bubblewrap`、`git`、`chromium`、`python3`、`make` 和 `g++`，使用普通用户运行；设 `WORKSPACE_EXECUTION_BACKEND=native`。宿主内核及安全策略需要允许该普通用户创建用户/挂载/PID命名空间。执行层会实际启动探测；仅安装 bwrap 可执行文件并不等于隔离可用。

Dockerfile 包含这些工具及 Chromium，保留运行期 TypeScript AST 依赖。Compose 使用 native 后端，入口在降权后预检 bwrap。Docker 默认 seccomp、AppArmor 或宿主用户命名空间限制可能使预检失败。这种情况下平台拒绝启动。部署者需要选择并审查支持非特权嵌套用户命名空间的运行时；本仓库不会自动设置 `privileged`、`SYS_ADMIN` 或 `seccomp=unconfined`。当前 Compose 不是在任意默认 Docker 安全策略下即开即用的承诺。

## 本机 Docker 后端

先启动可信的本机 Docker daemon。首次使用时平台异步初始化固定工具链镜像：基于 `node:22-bookworm-slim` 安装 git、Python 和 C++，后续按 Dockerfile 内容哈希与不可变镜像 ID 复用；不需用户手动 build。初始化为进程内单例，等待期间事件循环与任务心跳继续运行，取消请求可中止当前任务等待。构建只发送空上下文及内置 Dockerfile，不发送平台源码或凭据。平台进程需具备自己的 Docker CLI 连接权限；生成工程容器不挂 Docker socket，也不继承 Docker 或平台环境。`WORKSPACE_EXECUTION_BACKEND=docker` 可强制使用此后端，镜像由 `WORKSPACE_CONTAINER_IMAGE` 设置并按实际不可变镜像 ID 执行。

每条命令只挂载当前工程、显式数据目录及只读的固定 pnpm package。工程以普通 UID/GID 运行；容器根文件系统只读，删除 Linux capabilities，禁止提权，限制 PID、内存和 CPU。服务端口只发布到宿主 `127.0.0.1`，容器内绑定 `0.0.0.0`。容器 CID 文件及工程标签用于取消、退出和重启后的清理，不能只终止 Docker CLI。

平台对 Docker daemon 的访问是可信控制面权限。给平台容器挂载宿主 Docker socket 会扩大平台进程的宿主控制能力，不能把这种部署称作自动安全。默认 Compose 不这样配置。远程 daemon、不同路径的 daemon 或把平台放进另一个容器时还需要独立设计挂载路径、网络代理和控制面权限，本实现不会默默假定这些条件成立。

缓存按实际 package.json、pnpm lockfile、目标 Node 版本、平台架构、执行后端和不可变镜像 ID 区分，macOS native 依赖不能直接供 Linux 容器使用。依赖脚本只在隔离中运行；无预编译二进制时镜像需要 Python/C++ 工具链。默认自动派生的工具链镜像提供 Python/C++；自定义镜像需要自行提供 git 与编译工具。

默认 `GENERATION_VERIFICATION_MODE=preview`：安装依赖并完成必要类型检查后，用 `next dev --webpack` 启动隔离预览，不执行 `next build` 或全站生产预渲染。生成流程、聊天启动/刷新、候选验证和最终预览使用一致的开发模式，即使有旧 BUILD_ID 也不切回生产服务。检查真实 HTTP 首页，Chromium 和业务脚本不阻断预览。首页须返回完整 HTML，跳转限制在同一应用内。报告标记生产构建 skipped，仅声明开发预览通过。

需要生产构建和完整验收时显式设 `GENERATION_VERIFICATION_MODE=full`，并设置 `CHROMIUM_PATH=/usr/bin/chromium`。该模式浏览器工具缺失应报告未验证，不能把静态 HTTP 检查当成浏览器验收通过。正式 release 发布始终单独执行生产构建，不受默认开发预览模式影响。
