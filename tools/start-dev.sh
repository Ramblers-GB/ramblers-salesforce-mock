#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${PORT:-8080}"
HMR_PORT="${HMR_PORT:-24678}"
ENV_FILE="${ENV_FILE:-.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "error: $ENV_FILE not found. Copy .env.example to .env and fill it in." >&2
  exit 1
fi

free_port() {
  local port="$1"
  local pids
  pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "freeing port $port (pids: $pids)"
    kill $pids 2>/dev/null || true
    sleep 1
    pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
    if [ -n "$pids" ]; then
      echo "  still listening — sending SIGKILL"
      kill -9 $pids 2>/dev/null || true
      sleep 1
    fi
  fi
}

free_port "$PORT"
free_port "$HMR_PORT"

export PORT
export PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-http://localhost:$PORT}"

echo "starting ramblers-salesforce-mock on http://localhost:$PORT (env: $ENV_FILE)"
exec pnpm exec tsx watch --env-file="$ENV_FILE" src/server.ts
