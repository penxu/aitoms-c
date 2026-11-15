#!/bin/sh
# Atoms 容器入口：确保 /data 下各目录存在且属于 node 用户，然后降权启动。
# 只有在目录归属不对时才递归 chown，避免每次启动遍历整棵 node_modules 树。
set -eu

: "${WORKSPACE_ROOT:=/data/projects}"
: "${DATABASE_PATH:=/data/atoms.db}"
: "${TEMPLATE_CACHE_ROOT:=/data/.template-cache}"
: "${PNPM_STORE_DIR:=/data/.pnpm-store}"
export WORKSPACE_ROOT DATABASE_PATH TEMPLATE_CACHE_ROOT PNPM_STORE_DIR

if [ "$(id -u)" = "0" ]; then
  for dir in "$WORKSPACE_ROOT" "$TEMPLATE_CACHE_ROOT" "$PNPM_STORE_DIR" "$(dirname "$DATABASE_PATH")"; do
    mkdir -p "$dir"
    if [ "$(stat -c '%U' "$dir" 2>/dev/null || echo node)" != "node" ]; then
      echo "[atoms] 修正 $dir 归属为 node"
      chown -R node:node "$dir"
    fi
  done
  if [ "${WORKSPACE_EXECUTION_BACKEND:-native}" != "docker" ]; then
    if ! gosu node bwrap --unshare-user --unshare-pid --ro-bind / / -- /usr/bin/true; then
      echo "[atoms] 隔离预检失败：需要支持非特权用户命名空间的内核与容器运行时；拒绝退化为普通进程。详见 docs/execution-isolation.md" >&2
      exit 78
    fi
  fi
  exec gosu node "$@"
fi

if [ "${WORKSPACE_EXECUTION_BACKEND:-native}" != "docker" ]; then
  if ! bwrap --unshare-user --unshare-pid --ro-bind / / -- /usr/bin/true; then
    echo "[atoms] 隔离预检失败；请配置支持用户命名空间的运行时，拒绝不安全降级。" >&2
    exit 78
  fi
fi
exec "$@"
