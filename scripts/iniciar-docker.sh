#!/usr/bin/env bash
# Linux/macOS. Conserva .env y los datos persistentes de Docker.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
command -v docker >/dev/null || { echo 'Falta Docker.' >&2; exit 1; }
./scripts/setup-docker.sh
docker compose config --quiet
docker compose up -d --build
port="$(sed -nE 's/^[[:space:]]*BACKEND_HOST_PORT[[:space:]]*=[[:space:]]*([0-9]+)[[:space:]]*$/\1/p' .env | tail -1)"
port="${port:-5000}"
url="http://127.0.0.1:${port}/api/health/ready"
for attempt in $(seq 1 60); do
  if curl --fail --silent --show-error --max-time 4 "$url" 2>/dev/null | grep -q '"status":"ready"'; then
    docker compose ps
    echo "OK: PostgreSQL y API conectados ($url)."
    exit 0
  fi
  sleep 2
done
docker compose ps
echo "ERROR: API no confirmo la base de datos en $url; revisa docker compose logs --tail=100 postgres backend" >&2
echo 'NO usar docker compose down -v: borraria datos.' >&2
exit 1
