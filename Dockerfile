# syntax=docker/dockerfile:1
#
# Atoms 平台镜像（单容器）
#
# 工程命令必须经 bubblewrap 原生隔离。容器运行时须支持非特权用户命名空间；
# 不支持时入口预检拒绝启动，不能退化为普通子进程。详见 docs/execution-isolation.md。
#
# 构建：docker build -t atoms-platform:local .
# 运行：见 docker-compose.yml 或 scripts/deploy.sh

FROM node:22-bookworm-slim AS deps
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# better-sqlite3 优先用预编译包，缺预编译时回退本地编译
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY app/ ./
# 构建缓存与运行无关，先删掉；再裁掉开发依赖，减小最终镜像
RUN npm run build \
  && rm -rf .next/cache \
  && npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    WORKSPACE_EXECUTION_BACKEND=native \
    CHROMIUM_PATH=/usr/bin/chromium \
    WORKSPACE_ROOT=/data/projects \
    DATABASE_PATH=/data/atoms.db \
    TEMPLATE_ROOT=/templates \
    TEMPLATE_CACHE_ROOT=/data/.template-cache \
    PNPM_STORE_DIR=/data/.pnpm-store \
    PORT_RANGE_MIN=4000 \
    PORT_RANGE_MAX=4999

# git 用于工程版本；bubblewrap 执行隔离；chromium 用于浏览器验收；编译工具供 native 依赖安装
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates gosu bubblewrap chromium python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data /templates \
  && chown -R node:node /data

WORKDIR /app

COPY --from=builder --chown=node:node /app ./
# 工程模板：脚手架按需复制到 /data/projects/<id>，镜像里不带 node_modules
COPY --chown=node:node templates /templates

COPY --chown=root:root --chmod=755 deploy/entrypoint.sh /usr/local/bin/atoms-entrypoint
# 只读部署诊断，与本地 npm run diagnose:deployment 使用相同相对路径。
COPY --chown=root:root --chmod=644 scripts/diagnose-deployment.mjs /scripts/diagnose-deployment.mjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/atoms-entrypoint"]
CMD ["node", "server.mjs"]
