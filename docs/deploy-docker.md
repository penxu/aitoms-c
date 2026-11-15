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
