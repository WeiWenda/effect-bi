#!/usr/bin/env bash
#
# 一键启停：Vite 前端、Node 主后端（ETL DAG 由后端进程内生成并可选写入 AIRFLOW_HOME/dags）。
#
# 用法:
#   ./scripts/dev-services.sh start|stop|restart|status
# 或在仓库根目录: npm run dev:restart  （等同 restart）
#
# 可选环境变量:
#   FRONTEND_PORT   默认 5173
#   BACKEND_PORT    Node 监听端口，默认 8000（与 vite.config.ts 里 /api proxy 一致；若用 3001 请 export BACKEND_PORT=3001 并改 proxy）
#
# PID 与日志目录: <repo>/.dev-pids/
#

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT/.dev-pids"
mkdir -p "$PID_DIR"

FRONTEND_PORT="${FRONTEND_PORT:-5173}"
BACKEND_PORT="${BACKEND_PORT:-3001}"
log() { echo "[dev-services] $*"; }

is_running() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
  local name="$1"
  local f="$PID_DIR/${name}.pid"
  if [[ -f "$f" ]]; then
    tr -d ' \n\r\t' <"$f"
  else
    echo ""
  fi
}

stop_one() {
  local name="$1"
  local f="$PID_DIR/${name}.pid"
  if [[ ! -f "$f" ]]; then
    return 0
  fi
  local pid
  pid=$(tr -d ' \n\r\t' <"$f" || true)
  if [[ -z "$pid" ]]; then
    rm -f "$f"
    return 0
  fi
  if is_running "$pid"; then
    log "停止 ${name} (pid=${pid})…"
    kill "$pid" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      is_running "$pid" || break
      sleep 0.2
    done
    if is_running "$pid"; then
      log "强制结束 ${name} (pid=${pid})…"
      kill -9 "$pid" 2>/dev/null || true
    fi
  else
    log "清理 ${name} 的过期 pid 文件"
  fi
  rm -f "$f"
}

cmd_stop() {
  log "停止全部服务…"
  stop_one "vite"
  stop_one "node-backend"
  log "已全部停止。"
}

cmd_start() {
  mkdir -p "$PID_DIR"

  local p

  p=$(read_pid "node-backend")
  if is_running "$p"; then
    log "node-backend 已在运行 (pid=${p})，跳过。"
  else
    log "启动 node-backend (PORT=${BACKEND_PORT})…"
    (
      cd "$ROOT/backend"
      export PORT="$BACKEND_PORT"
      npm run dev >>"$PID_DIR/node-backend.log" 2>&1
    ) &
    echo $! >"$PID_DIR/node-backend.pid"
    log "node-backend pid=$(cat "$PID_DIR/node-backend.pid") 日志: $PID_DIR/node-backend.log"
  fi

  p=$(read_pid "vite")
  if is_running "$p"; then
    log "vite 已在运行 (pid=${p})，跳过。"
  else
    log "启动 vite (port=${FRONTEND_PORT})…"
    (
      cd "$ROOT"
      npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT"
    ) >>"$PID_DIR/vite.log" 2>&1 &
    echo $! >"$PID_DIR/vite.pid"
    log "vite pid=$(cat "$PID_DIR/vite.pid") 日志: $PID_DIR/vite.log"
  fi

  log "完成。前端 http://127.0.0.1:${FRONTEND_PORT}/  ·  Node API http://127.0.0.1:${BACKEND_PORT}/"
}

cmd_status() {
  for name in node-backend vite; do
    local pid
    pid=$(read_pid "$name")
    if [[ -z "$pid" ]]; then
      echo "$name: 未启动"
    elif is_running "$pid"; then
      echo "$name: 运行中 pid=${pid}"
    else
      echo "$name: pid 文件过期 (was ${pid})"
    fi
  done
}

case "${1:-}" in
  start)
    cmd_start
    ;;
  stop)
    cmd_stop
    ;;
  restart)
    cmd_stop
    sleep 0.5
    cmd_start
    ;;
  status)
    cmd_status
    ;;
  *)
    echo "用法: $0 start|stop|restart|status" >&2
    exit 1
    ;;
esac
