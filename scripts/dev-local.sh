#!/usr/bin/env bash
# Start the Next.js dev server AND the local Grounded-SAM detection service
# together (npm run dev:local). The Python service is torn down when this
# script exits, so a single Ctrl-C stops both.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DETECT_DIR="$ROOT/local-detect"
UVICORN="$DETECT_DIR/.venv/bin/uvicorn"
PORT="${LOCAL_DETECT_PORT:-8000}"
NEXT_PORT="${NEXT_PORT:-3000}"

# Kill anything still listening on a port (e.g. a uvicorn left over from a
# previous session that didn't exit cleanly). SIGTERM first, SIGKILL if needed.
free_port() {
  local port="$1" pids
  pids="$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true)"
  [[ -z "$pids" ]] && return 0
  echo "⚠ port $port in use (pid $pids) — killing"
  kill $pids 2>/dev/null || true
  for _ in {1..10}; do
    lsof -ti "tcp:$port" -sTCP:LISTEN >/dev/null 2>&1 || return 0
    sleep 0.3
  done
  echo "  still alive, sending SIGKILL"
  kill -9 $(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null) 2>/dev/null || true
}

if [[ ! -x "$UVICORN" ]]; then
  echo "✖ local-detect venv not found at $UVICORN" >&2
  echo "  Set it up first (see local-detect/README.md):" >&2
  echo "    cd local-detect && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt" >&2
  exit 1
fi

free_port "$PORT"
free_port "$NEXT_PORT"

echo "▶ starting Grounded-SAM detection service on :$PORT"
( cd "$DETECT_DIR" && exec "$UVICORN" server:app --host 0.0.0.0 --port "$PORT" ) &
PY_PID=$!

cleanup() {
  [[ -n "${_stopped:-}" ]] && return; _stopped=1
  echo ""
  echo "■ stopping detection service (pid $PY_PID)"
  kill "$PY_PID" 2>/dev/null || true
  wait "$PY_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Next.js in the foreground; when it exits (or Ctrl-C), cleanup tears down Python.
cd "$ROOT"
"$ROOT/node_modules/.bin/next" dev
