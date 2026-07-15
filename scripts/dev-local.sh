#!/usr/bin/env bash
# Start the Next.js dev server AND the local Grounded-SAM detection service
# together (npm run dev:local). The Python service is torn down when this
# script exits, so a single Ctrl-C stops both.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DETECT_DIR="$ROOT/local-detect"
UVICORN="$DETECT_DIR/.venv/bin/uvicorn"
PORT="${LOCAL_DETECT_PORT:-8000}"

if [[ ! -x "$UVICORN" ]]; then
  echo "✖ local-detect venv not found at $UVICORN" >&2
  echo "  Set it up first (see local-detect/README.md):" >&2
  echo "    cd local-detect && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt" >&2
  exit 1
fi

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
