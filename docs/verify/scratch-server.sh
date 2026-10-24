#!/usr/bin/env bash
# A seeded scratch server for browser checks: never the real DATA_DIR.
# start: build (unless SKIP_BUILD=1), seed a fresh DATA_DIR, serve the API and SPA on $PORT. stop: kill it and remove its files.
# FIXED_NOW (an ISO instant) pins the clock of the seed and the server (docs/verify/fixed-clock.mjs); ROOT and PORT let several run at once and CI use its own folder.
cd "$(dirname "$0")/../.." || exit 1
TMP=${BPHS_TMP:-${TMPDIR:-/tmp}} # where scratch files go
mkdir -p "$TMP"
ROOT=${ROOT:-$TMP/bphs-qa-tasks}   # snap Firefox can't read /tmp: for tasks-smoke, set BPHS_TMP to a folder under $HOME
CLOCK=(--import ./docs/verify/fixed-clock.mjs)
PORT=${PORT:-3388}

stop() {
  [ -f "$ROOT/pid" ] && kill "$(cat "$ROOT/pid")" 2>/dev/null
  for _ in $(seq 20); do curl -sf "http://localhost:$PORT/api/health" >/dev/null || break; sleep 0.5; done
  rm -rf "$ROOT"
}

case "${1:-}" in
  start)
    stop
    # Something else on the port would answer the health check below and pass for this server.
    curl -sf "http://localhost:$PORT/api/health" >/dev/null && { echo "something else is already answering on :$PORT"; exit 1; }
    mkdir -p "$ROOT/data"
    [ "${SKIP_BUILD:-0}" = 1 ] || bun run build >"$ROOT/build.log" 2>&1 || { echo "build failed: $ROOT/build.log"; exit 1; }
    DATA_DIR="$ROOT/data" node "${CLOCK[@]}" --env-file-if-exists=.env server/seed.ts >"$ROOT/seed.log" 2>&1 || { echo "seed failed: $ROOT/seed.log"; exit 1; }
    SERVE_WEB=true PORT=$PORT DATA_DIR="$ROOT/data" nohup node "${CLOCK[@]}" --env-file-if-exists=.env server/index.ts >"$ROOT/server.log" 2>&1 &
    pid=$!
    echo $pid >"$ROOT/pid"
    for _ in $(seq 40); do kill -0 $pid 2>/dev/null || { echo "server exited: $ROOT/server.log"; exit 1; }; curl -sf "http://localhost:$PORT/api/health" >/dev/null && { echo "scratch server on :$PORT"; exit 0; }; sleep 0.5; done
    echo "server did not answer: $ROOT/server.log"; exit 1 ;;
  stop) stop; echo "scratch server stopped" ;;
  *) echo "usage: $0 start|stop"; exit 2 ;;
esac
