#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

export PORT=30128
if command -v cygpath >/dev/null 2>&1; then
  export DATA_DIR="$(cygpath -m "$ROOT_DIR/.test-data")"
else
  export DATA_DIR="$ROOT_DIR/.test-data"
fi
export NEXT_DIST_DIR=".next-test"
export NODE_ENV=development

echo "======================================================="
echo "  9Router (Isolated Dev Instance)"
echo "======================================================="
echo "  Port:      http://127.0.0.1:$PORT"
echo "  Dashboard: http://127.0.0.1:$PORT/dashboard/prompt-injection"
echo "  Data Dir:  $DATA_DIR"
echo "  Original:  Port 20128 (Safe & Untouched)"
echo "======================================================="

npx next dev --port "$PORT" --hostname 127.0.0.1
