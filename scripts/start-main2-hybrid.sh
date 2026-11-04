#!/usr/bin/env bash
# main-2 hybrid: run ./scripts/start-main2-hybrid.sh up [LAN_IP]
# rollback:       ./scripts/start-main2-hybrid.sh rollback
set -euo pipefail
cd "$(dirname "$0")/.."
action="${1:-up}"
bind_ip="${2:-127.0.0.1}"
case "$action" in up|status|rollback) ;; *) echo "Usage: $0 {up|status|rollback} [IPv4]" >&2; exit 2;; esac
if [[ "$bind_ip" == "0.0.0.0" || ! "$bind_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo "Use a concrete IPv4 address (127.0.0.1 for local only). Never 0.0.0.0." >&2
  exit 2
fi
[[ -f .env ]] || { echo "Missing .env; run scripts/setup-docker.sh without overwriting an existing .env." >&2; exit 2; }
command -v docker >/dev/null || { echo "Docker is missing" >&2; exit 2; }

files=(-f compose.yaml -f compose.nuxt-preview.yaml -f compose.nuxt-local-hybrid.yaml -f compose.main2-hybrid.yaml)
export FRONTEND_HOST_PORT=5174 FRONTEND_BIND_IP=127.0.0.1
export NUXT_LOCAL_GATEWAY_BIND_IP="$bind_ip" NUXT_LOCAL_GATEWAY_PORT=8083 NUXT_MAIN2_PORT=5173

case "$action" in
  status)
    docker compose "${files[@]}" ps
    ;;
  rollback)
    docker compose "${files[@]}" stop nuxt-local-gateway
    # Restore legacy host port from .env, without deleting containers or named volumes.
    env -u FRONTEND_HOST_PORT -u FRONTEND_BIND_IP \
      docker compose -f compose.yaml up -d --no-deps --force-recreate frontend
    echo "Legacy Vite restored. Database volumes untouched."
    ;;
  up)
    docker compose "${files[@]}" config --quiet
    # Recreate Vite on 5174 first: the gateway can then safely claim 5173.
    docker compose "${files[@]}" up -d --build frontend
    docker compose "${files[@]}" up -d --build backend frontend-nuxt frontend-legacy-preview nuxt-local-gateway
    docker compose "${files[@]}" ps
    ready=0
    for attempt in $(seq 1 30); do
      if curl -fsS --max-time 8 "http://$bind_ip:5173/servicios/transporte-maritimo" | grep -q 'service-landing-page' &&
         curl -fsS --max-time 8 "http://$bind_ip:5173/bienvenidos" | grep -q 'id="app"'; then
        ready=1
        break
      fi
      sleep 2
    done
    [[ "$ready" -eq 1 ]] || { echo "Gateway HTTP smoke failed; inspect compose logs (no automatic rollback)." >&2; exit 1; }
    echo "Primary:  http://$bind_ip:5173/"
    echo "Alternate: http://$bind_ip:8083/"
    echo "Vite dev: http://127.0.0.1:5174/"
    echo "Keep these development ports LAN-only. Do not expose to the Internet."
    ;;
esac
