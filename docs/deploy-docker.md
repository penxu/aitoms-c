# Docker 一键部署

平台是**单容器 + 本地数据卷**的有状态服务：`server.mjs` 会在容器内为用户项目启动 `next dev` / `next start` 子进程（4000–4999 端口），再通过 `/p/`、`/s/` 子路径反代对外，因此不能拆成多个无状态副本，也不能用纯静态托管。

## 前置条件

- Docker Engine 24+ 与 Compose v2.24+（`docker compose version` 能输出版本即可）
- 建议 2 核 4G 内存、20G 以上磁盘（构建用户项目时 `next build` 较吃内存）
- 服务器需要出网：拉取 npm 依赖、构建期下载字体（`next/font/google`）、以及访问模型接口

## 一键部署

```bash
git clone <你的仓库> atoms && cd atoms
./scripts/deploy.sh
```

脚本会依次完成：检查 Docker → 从 `.env.docker.example` 生成 `.env`（交互式询问 `OPENAI_API_KEY`）→ `docker compose build` → `docker compose up -d` → 轮询 `GET /api/health` 直到 `healthy` → 打印访问地址。

部署完成后访问 `http://<服务器IP>:3000`（端口由 `.env` 的 `APP_PORT` 决定）。

常用命令：

```bash
./scripts/deploy.sh --update     # git pull 后重建并重启
./scripts/deploy.sh --logs       # 跟踪日志
./scripts/deploy.sh --status     # 容器与健康状态
./scripts/deploy.sh --down       # 停止（数据保留）
./scripts/deploy.sh --no-build   # 直接使用本地镜像 / ATOMS_IMAGE 指定的远程镜像
```

手动等价于：

```bash
cp .env.docker.example .env   # 填写 OPENAI_API_KEY 等
docker compose up -d --build
curl -s localhost:3000/api/health
```

## 配置项（.env）

| 变量 | 说明 |
|---|---|
| `APP_PORT` | 宿主机映射端口，默认 3000 |
| `DATA_DIR` | 宿主机数据目录，挂载到容器 `/data`，默认 `./data` |
| `ATOMS_IMAGE` | 使用 GHCR 等远程镜像时填写，配合 `--no-build` |
| `OPENAI_API_KEY` | 必填；缺失时平台可启动，但生成/对话返回 503 配置提示 |
| `OPENAI_BASE_URL` | OpenAI 兼容接口地址，如 `https://api.deepseek.com/v1` |
| `CHAT_MODEL` / `SPEC_MODEL` / `PLAN_MODEL` / `BUILD_MODEL` / `REPAIR_MODEL` | 各用途模型名 |
| `PUBLIC_APP_ORIGIN` | 对外源地址（含协议、不含路径），用于交付页展示线上地址 |

容器内固定写入的路径：`WORKSPACE_ROOT=/data/projects`、`DATABASE_PATH=/data/atoms.db`、`TEMPLATE_ROOT=/templates`、缓存目录在 `/data/.template-cache`、`/data/.pnpm-store`。这些都可以在 `docker-compose.yml` 里覆盖，但不建议改到容器外未挂载的路径。

## 数据与备份

`/data` 同时承载平台库与用户工程，务必进备份策略：

```text
<DATA_DIR>/atoms.db                平台 SQLite（含 -wal/-shm，备份前建议停容器或使用 sqlite3 .backup）
<DATA_DIR>/projects/<id>/          用户项目源码（含 .git，每阶段自动提交）
<DATA_DIR>/.template-cache/        模板依赖缓存（可重建）
<DATA_DIR>/.pnpm-store/            pnpm 内容仓库（可重建）
```

迁移到新机器：复制整个 `DATA_DIR`（保持 `node` 用户可写，容器启动时会自动修正归属），带上同一个 `.env` 后执行 `./scripts/deploy.sh`。

## 域名与 HTTPS

容器把 3000 映射到宿主机，宿主 Nginx 直接复用 [app/deploy/nginx.conf](../app/deploy/nginx.conf)：upstream 指向 `127.0.0.1:3000` 即可。关键点是 `/p/` 必须透传 `Upgrade`/`Connection` 并关闭缓冲，否则用户项目的 HMR WebSocket 会断开。

```bash
sudo cp app/deploy/nginx.conf /etc/nginx/conf.d/atoms.conf
# 改 server_name 为你的域名后
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com      # 可选：签发证书
```

## 升级、回滚与排障

```bash
./scripts/deploy.sh --update                 # 常规升级
git checkout <上一个提交> && ./scripts/deploy.sh   # 代码回滚（数据不动）
docker compose logs -f --tail 200            # 容器日志
docker exec -it atoms node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.text().then(console.log))"
```

常见问题：

- **healthcheck 一直 unhealthy**：多为模型 key 未配置或 `/data` 无写权限；看 `docker logs atoms`，容器启动时会打印归属修正与错误。
- **构建过程 OOM**：`next build` 与用户项目构建并发时内存吃紧，给到 4G 或限制并发项目数。
- **生成时报 npm 安装失败**：容器需要能出网访问 npm registry（或配置私有 registry）。
- **`/p/<id>` 打开是 502**：用户项目子进程未启动，平台会按需拉起；确认容器内 4000–4999 未被占用。
- **端口冲突**：改 `.env` 的 `APP_PORT` 或 `PORT_RANGE_MIN/MAX` 后重启。

## CI/CD

`.github/workflows/docker.yml`：

- `checks`：`typecheck` / `lint` / `test:unit` / `next build`
- `image`：构建镜像并推送到 `ghcr.io/<owner>/<repo>`（PR 只构建不推送，使用 buildx 缓存）
- `deploy`：手动触发，勾选 `deploy` 后通过 SSH 在服务器执行 `./scripts/deploy.sh --update`

需要的 secrets：`SSH_HOST`、`SSH_USER`、`SSH_PRIVATE_KEY`、`DEPLOY_PATH`（服务器上仓库目录）。服务器需已按上文完成过一次部署。

## 安全提醒

公网暴露意味着任何人都能用你的模型 key 生成项目，并在你的服务器上执行生成的代码。上线前至少做一件事：

- 在 Nginx 上加访问口令：

```nginx
auth_basic           "Atoms";
auth_basic_user_file /etc/nginx/atoms.htpasswd;   # htpasswd -c 生成
```

- 或用云安全组 / 防火墙限制来源 IP，只对内网开放。

平台目前没有内置账号体系，单机部署也不承诺高可用；数据一致性以 SQLite + 本地卷为准。

## 宝塔 / 1Panel：页面能打开但创建应用失败

页面健康检查通过只说明平台 HTTP 与数据库可用，不等于模型凭据、构建隔离或浏览器工具链已可用。升级包含本次修复的代码/镜像后，以**平台实际运行用户**执行只读诊断：

```bash
# Node / PM2 项目：先进入仓库 app 目录
npm run diagnose:deployment

# 仓库自带容器（名称按实际调整，镜像中平台运行用户为 node）
docker exec --user node atoms sh -lc 'cd /app && npm run diagnose:deployment'
```

输出不包含 API Key 或 Docker 连接地址，只报告变量名、运行 UID/GID、隔离是否可用和配置错误分类。返回非零代表模型或选定执行后端未通过预检；`ready` 只代表这些检查通过，完整构建与发布仍需另行验收。

- **ByteString**：优先查看 `model` 检查。模型密钥不能包含中文占位、换行、内部空格。请替换为服务商真实密钥，不能通过 URL/Base64 编码“修复”密钥。修复面板的实际进程环境后重启/重新创建服务；仅在终端修改环境不会自动更新已运行的 PM2/容器。
- **`/root/.docker/config.json: permission denied`**：检查平台 UID 与 HOME 是否匹配。新版可信 Docker CLI 使用真实 UID 的用户目录；显式 `DOCKER_CONFIG` 仍必须指向该用户可读的配置目录。
- **Docker socket permission denied**：平台运行用户没有 daemon 访问权限，或配置的 rootless/context 端点不可用。需要由管理员针对实际运行身份配置 daemon 访问，并重启进程使身份/组生效。不要把 `chmod 777 docker.sock`、全容器 root 或关闭隔离作为通用修复。
- **面板容器里执行 Docker**：即使 socket 可连，兄弟容器挂载的工程、临时数据和 pnpm 路径还必须在宿主机存在且保持一致，代理也需要匹配网络。自带 Compose 使用 native 隔离，不是 socket 挂载方案。请提供脱敏的 user/environment/volumes 配置后再确定部署改法。
- **native 用户命名空间被禁用**：自带容器会拒绝不安全降级。应使用支持该隔离的运行时，或在宿主机运行 Node/PM2 平台进程，并配置可用的 native/Docker 后端；改环境变量并不能自动获得权限。

生成早期失败不会丢失 `generation_runs.requirement` 与已确认讨论答案。修复平台配置后使用原任务的阶段重试；缺少 SPEC 不表示应该把故障日志重新生成成一款诊断工具。已经误写的工程需要先保留源码，再按原始需求明确恢复，不能自动删除。
