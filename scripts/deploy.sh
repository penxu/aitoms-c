#!/usr/bin/env bash
# Atoms 平台一键部署（Docker Compose）
#
#   ./scripts/deploy.sh              # 首次部署 / 部署当前代码
#   ./scripts/deploy.sh --update     # git pull 后重新构建并滚动重启
#   ./scripts/deploy.sh --logs       # 跟踪容器日志
#   ./scripts/deploy.sh --status     # 查看容器与健康状态
#   ./scripts/deploy.sh --down       # 停止容器（保留数据）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"
ENV_EXAMPLE=".env.docker.example"
MODE="deploy"
SKIP_BUILD="false"

for arg in "$@"; do
  case "$arg" in
    --update) MODE="update" ;;
    --no-build) SKIP_BUILD="true" ;;
    --logs) MODE="logs" ;;
    --status) MODE="status" ;;
    --down) MODE="down" ;;
    -h | --help)
      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "未知参数：$arg（用 --help 查看用法）" >&2
      exit 1
      ;;
  esac
done

log() { printf '\033[36m[atoms]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[atoms]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[31m[atoms]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- 依赖检查 ----------
command -v docker >/dev/null 2>&1 || fail "未找到 docker。Linux 请先安装 Docker Engine（含 compose 插件）。"
docker info >/dev/null 2>&1 || fail "Docker 守护进程未运行或当前用户无权限（可尝试 sudo，或把用户加入 docker 组）。"
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  fail "未找到 docker compose。"
fi

ensure_env() {
  if [ ! -f "$ENV_FILE" ]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    log "已根据 $ENV_EXAMPLE 生成 $ENV_FILE"
  fi

  local key
  key="$(grep -E '^OPENAI_API_KEY=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
  if [ -z "$key" ]; then
    if [ -t 0 ]; then
      printf '请输入 OPENAI_API_KEY（直接回车可跳过，之后再填 %s）：' "$ENV_FILE"
      local input
      read -rs input || true
      printf '\n'
      if [ -n "$input" ]; then
        if grep -qE '^OPENAI_API_KEY=' "$ENV_FILE"; then
          # BSD/GNU sed 兼容写法
          sed -i.bak "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=$input|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
        else
          printf 'OPENAI_API_KEY=%s\n' "$input" >>"$ENV_FILE"
        fi
        log "已写入 OPENAI_API_KEY"
      fi
    else
      warn "OPENAI_API_KEY 为空：平台能启动，但生成/对话会返回 503 配置提示。"
    fi
  fi
}

compose() {
  if [ -f "$ENV_FILE" ]; then
    "${COMPOSE[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
  else
    "${COMPOSE[@]}" -f "$COMPOSE_FILE" "$@"
  fi
}

read_env() {
  local name="$1" fallback="$2"
  local value
  value="$(grep -E "^${name}=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- || true)"
  printf '%s' "${value:-$fallback}"
}

print_access() {
  local port origin
  port="$(read_env APP_PORT 3000)"
  origin="$(read_env PUBLIC_APP_ORIGIN '')"
  echo
  log "部署完成"
  if [ -n "$origin" ]; then
    log "访问地址：$origin"
  fi
  log "本机访问：http://localhost:$port   （健康检查：http://localhost:$port/api/health）"
  log "数据目录：$ROOT/$(read_env DATA_DIR './data')"
  log "查看日志：./scripts/deploy.sh --logs"
}

wait_healthy() {
  local port status i
  port="$(read_env APP_PORT 3000)"
  log "等待健康检查通过…"
  for i in $(seq 1 60); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' atoms 2>/dev/null || echo missing)"
    case "$status" in
      healthy)
        log "容器状态：healthy"
        return 0
        ;;
      unhealthy)
        warn "容器状态 unhealthy，最近日志："
        docker logs --tail 40 atoms || true
        return 1
        ;;
      missing)
        warn "容器未创建，最近日志："
        compose logs --tail 40 || true
        return 1
        ;;
    esac
    sleep 2
  done
  warn "健康检查超时（2 分钟），最近日志："
  docker logs --tail 40 atoms || true
  return 1
}

case "$MODE" in
  logs)
    exec compose logs -f --tail 200
    ;;
  status)
    compose ps
    docker inspect --format '健康状态：{{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' atoms 2>/dev/null || true
    exit 0
    ;;
  down)
    compose down --remove-orphans
    log "已停止（数据目录保留）"
    exit 0
    ;;
  update)
    if [ -d .git ]; then
      log "拉取最新代码"
      git pull --ff-only
    else
      warn "当前目录不是 git 仓库，跳过 git pull"
    fi
    MODE="deploy"
    ;;
esac

ensure_env

image="$(read_env ATOMS_IMAGE '')"
if [ "$SKIP_BUILD" = "true" ]; then
  if [ -n "$image" ]; then
    log "跳过构建，拉取镜像 $image"
    compose pull
  else
    log "跳过构建，直接使用本地镜像"
  fi
else
  log "构建镜像（首次包含依赖安装与 next build，耗时数分钟）"
  compose build --pull
fi

log "启动容器"
compose up -d --remove-orphans

if wait_healthy; then
  print_access
else
  fail "启动未通过健康检查，请检查日志：./scripts/deploy.sh --logs"
fi
