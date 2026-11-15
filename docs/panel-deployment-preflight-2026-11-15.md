# 面板创建应用失败：配置预检与恢复修复

## 线上日志能够确认的事实

- 请求头构造出现 ByteString 错误，需要检查进入请求头的配置值；仅凭当前日志不能确定实际变量和值。
- 平台执行用户无法读取 `/root/.docker/config.json`，也无法访问 Docker daemon/socket。页面 HTTP 正常不代表工程隔离运行正常。
- 失败后创建“HTTP Header 编码检查器”偏离原需求。规格不存在不能证明原始需求丢失；原需求及讨论答案保存在平台 SQLite 中。

## 已完成的本地修复

1. 模型配置预检拒绝中文、内部空白及控制字符，不回显密钥。有效密钥 trim 后传给 provider，禁止靠编码改变鉴权值。
2. 用合成中文占位密钥复现 ByteString，并验证新预检在请求前拒绝。
3. Docker CLI 使用真实 UID 对应主目录（无 passwd 记录时回退系统可用目录），保留明确配置的 DOCKER_HOST/CONTEXT/CONFIG/TLS/CERT/XDG_RUNTIME_DIR。连接配置不自动进入生成应用。
4. 失败恢复上下文携带原始需求及已确认决定。早期失败且尚无 SPEC 时返回 GENERATION_RETRY_REQUIRED，保留原任务续跑入口，不再调用普通聊天模型初始化其他应用。
5. 错误展示区分请求头配置与工程运行权限，避免统一误报为“模型调用失败”。
6. 新增只读命令 `npm run diagnose:deployment`（在 app 下执行），输出用户、配置与隔离检查，不打印凭据、不修改权限。自带镜像复制诊断脚本；Docker 构建上下文排除独立 Next 构建目录。
7. 更新 `docs/deploy-docker.md` 的宝塔/1Panel 排障说明。

## 验证

- 259 项回归通过，0 失败、0 跳过。
- typecheck、lint、独立目录 Next 生产构建、git diff --check 通过。
- 本地只读诊断通过；合成非法密钥时退出码 1、返回 MODEL_CONFIGURATION_INVALID，且不输出该密钥。
- 本记录不声称已构建并部署新 Docker 镜像或修复用户线上服务器。

## 仍需完成的线上工作

用户已说明使用宝塔/1Panel 类面板，尚未确认是容器/Compose 还是 Node/PM2，也未提供脱敏的 user/environment/volumes 或实际诊断输出。因此暂不能选定 socket 用户组、原生隔离或路径/网络方案，更不能声称线上已恢复。

下一步：确认平台实际运行方式与身份，更新代码/镜像，以同一运行用户执行诊断，再按真实部署配置修复并重试原任务。Docker socket 权限、宿主路径一致性和 sibling 容器网络需要分别确认；不使用 chmod 777、自动提权或不隔离执行作为补丁。
