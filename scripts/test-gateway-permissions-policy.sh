#!/usr/bin/env bash
# Isolated HTTP test with fake upstreams. No real backend or published service.
set -euo pipefail
tmp="$(mktemp -d)"
net="pangolin-policy-$RANDOM-$$"
cleanup() {
  docker rm -f "$net-gateway" "$net-vue" "$net-nuxt" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
cat >"$tmp/upstream.conf" <<'NGINX'
server {
  listen 80;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  location / { return 200 "fake Vue"; }
}
NGINX
cat >"$tmp/nuxt.conf" <<'NGINX'
server {
  listen 3000;
  location = /missing { return 404; }
  location / { return 200 "fake Nuxt"; }
}
NGINX
docker network create "$net" >/dev/null
docker run -d --name "$net-vue" --network "$net" --network-alias frontend \
  -v "$tmp/upstream.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine@sha256:7fc0fb4af7bf006aeb31aea88069976060f8f0a0a86b667126742cc17f4e31ae >/dev/null
docker run -d --name "$net-nuxt" --network "$net" --network-alias frontend-nuxt \
  -v "$tmp/nuxt.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine@sha256:7fc0fb4af7bf006aeb31aea88069976060f8f0a0a86b667126742cc17f4e31ae >/dev/null
docker run -d --name "$net-gateway" --network "$net" -p 127.0.0.1::80 \
  -v "$PWD/deploy/nuxt-hybrid-gateway.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine@sha256:7fc0fb4af7bf006aeb31aea88069976060f8f0a0a86b667126742cc17f4e31ae >/dev/null
addr="$(docker port "$net-gateway" 80/tcp)"
ready=0
for i in $(seq 1 30); do
  if curl -fsS --max-time 2 "http://$addr/" >/dev/null; then ready=1; break; fi
  sleep 1
done
test "$ready" = 1
for route in / /servicios /api/public-news /cotizaciones /api/example /home /missing; do
  headers="$(curl -sS --max-time 5 -D - -o /dev/null "http://$addr$route" | tr -d '\r')"
  case "$route" in
    /home) expected=301 ;;
    /missing) expected=404 ;;
    *) expected=200 ;;
  esac
  grep -Eq "^HTTP/[0-9.]+ $expected " <<< "$headers"
  test "$(grep -ic '^Permissions-Policy:' <<< "$headers")" = 1
  grep -Fqi 'Permissions-Policy: camera=(), microphone=(), geolocation=()' <<< "$headers"
  echo "PASS: $route HTTP $expected with exactly one permissions policy"
done
