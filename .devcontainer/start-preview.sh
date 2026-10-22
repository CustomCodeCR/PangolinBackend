#!/usr/bin/env bash
# Runs only in the isolated Codespaces preview branch; no backend or production deployment.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/frontend"

if [[ ! -x node_modules/.bin/vite ]]; then
  echo "Installing preview dependencies..."
  npm ci
fi

if curl --silent --fail --max-time 3 http://127.0.0.1:5173/ > /dev/null; then
  echo "Castro Fallas preview already available at http://127.0.0.1:5173/"
  exit 0
fi

echo "Starting Castro Fallas preview on port 5173..."
nohup npm run dev -- --host 0.0.0.0 --port 5173 > /tmp/castrofallas-vite-preview.log 2>&1 < /dev/null &
for attempt in {1..20}; do
  if curl --silent --fail --max-time 2 http://127.0.0.1:5173/ > /dev/null; then
    echo "Preview ready. Open PORTS > 5173 > Open in Browser."
    exit 0
  fi
  sleep 1
done
echo "Preview failed to start; latest Vite log:"
tail -n 80 /tmp/castrofallas-vite-preview.log || true
exit 1
