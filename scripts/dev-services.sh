#!/usr/bin/env bash
#
# 一键启停：Vite 前端、Node 主后端（backend/node）、LangGraph FastAPI（backend/langgraph）。
# ETL DAG 等仍由 Node 进程内生成并可选写入 AIRFLOW_HOME/dags。
#
# 用法:
#   ./scripts/dev-services.sh start|stop|restart|status
# 或在仓库根目录: npm run dev:restart  （等同 restart）
#
# 可选环境变量:
#   FRONTEND_PORT           默认 5173
#   BACKEND_PORT            Node 监听端口，默认 3001（与 vite /api 代理一致）
#   LANGGRAPH_PORT          LangGraph uvicorn 端口，默认 8001（与 vite /langgraph 代理一致）
#   VITE_LANGGRAPH_PROXY_TARGET  若单独运行 vite 且 LangGraph 非本机 8001，可在仓库根 .env 中设置
#
# PID 与日志目录: <repo>/.dev-pids/
#

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT/.dev-pids"
mkdir -p "$PID_DIR"

FRONTEND_PORT="${FRONTEND_PORT:-5173}"
BACKEND_PORT="${BACKEND_PORT:-3001}"
LANGGRAPH_PORT="${LANGGRAPH_PORT:-8001}"

NODE_BACKEND_DIR="$ROOT/backend/node"
LANGGRAPH_DIR="$ROOT/backend/langgraph"

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
  stop_one "langgraph"
  stop_one "node-backend"
  log "已全部停止。"
}

start_langgraph() {
  local p
  p=$(read_pid "langgraph")
  if is_running "$p"; then
    log "langgraph 已在运行 (pid=${p})，跳过。"
    return 0
  fi

  if [[ ! -d "$LANGGRAPH_DIR" ]]; then
    log "跳过 langgraph：目录不存在 ($LANGGRAPH_DIR)"
    return 0
  fi

  if ! command -v uv >/dev/null 2>&1 && [[ ! -x "$LANGGRAPH_DIR/.venv/bin/uvicorn" ]]; then
    log "跳过 langgraph：未找到命令 uv，且不存在 $LANGGRAPH_DIR/.venv/bin/uvicorn（请在 backend/langgraph 执行 uv sync）"
    return 0
  fi

  log "启动 langgraph (PORT=${LANGGRAPH_PORT})…"
  (
    cd "$LANGGRAPH_DIR"
    if [[ -f .env.development ]]; then
      set -a
      # shellcheck disable=SC1091
      source ./.env.development
      set +a
    fi
    export PORT="$LANGGRAPH_PORT"
    if command -v uv >/dev/null 2>&1; then
      exec uv run uvicorn app.main:app --reload --reload-dir app --host 127.0.0.1 --port "$PORT"
    else
      exec ./.venv/bin/uvicorn app.main:app --reload --reload-dir app --host 127.0.0.1 --port "$PORT"
    fi
  ) >>"$PID_DIR/langgraph.log" 2>&1 &
  echo $! >"$PID_DIR/langgraph.pid"
  log "langgraph pid=$(cat "$PID_DIR/langgraph.pid") 日志: $PID_DIR/langgraph.log"
}

cmd_start() {
  mkdir -p "$PID_DIR"

  local p

  p=$(read_pid "node-backend")
  if is_running "$p"; then
    log "node-backend 已在运行 (pid=${p})，跳过。"
  else
    if [[ ! -d "$NODE_BACKEND_DIR" ]]; then
      log "错误: Node 后端目录不存在: $NODE_BACKEND_DIR" >&2
      exit 1
    fi
    log "启动 node-backend (PORT=${BACKEND_PORT})…"
    (
      cd "$NODE_BACKEND_DIR"
      export PORT="$BACKEND_PORT"
      npm run dev >>"$PID_DIR/node-backend.log" 2>&1
    ) &
    echo $! >"$PID_DIR/node-backend.pid"
    log "node-backend pid=$(cat "$PID_DIR/node-backend.pid") 日志: $PID_DIR/node-backend.log"
  fi

  start_langgraph

  p=$(read_pid "vite")
  if is_running "$p"; then
    log "vite 已在运行 (pid=${p})，跳过。"
  else
    log "启动 vite (port=${FRONTEND_PORT})…"
    (
      cd "$ROOT"
      export VITE_LANGGRAPH_PROXY_TARGET="http://127.0.0.1:${LANGGRAPH_PORT}"
      npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT"
    ) >>"$PID_DIR/vite.log" 2>&1 &
    echo $! >"$PID_DIR/vite.pid"
    log "vite pid=$(cat "$PID_DIR/vite.pid") 日志: $PID_DIR/vite.log"
  fi

  log "完成。前端 http://127.0.0.1:${FRONTEND_PORT}/  ·  Node API http://127.0.0.1:${BACKEND_PORT}/  ·  LangGraph http://127.0.0.1:${LANGGRAPH_PORT}/"
}

cmd_status() {
  for name in node-backend langgraph vite; do
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
