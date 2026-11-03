#!/usr/bin/env bash
# Smoke real del gateway integrado: HTML Vue, JS compilado, autenticacion y Nuxt.
# Nunca usa sesiones ni secretos de producción.
set -euo pipefail
cd "$(dirname "$0")/.."
network="cf-hybrid-smoke"
base="http://127.0.0.1:18083"
cleanup() {
  for name in cf-hybrid-gateway cf-hybrid-nuxt cf-hybrid-vue cf-hybrid-fake-api; do
    docker rm -f "$name" >/dev/null 2>&1 || true
  done
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker network create "$network" >/dev/null
docker run -d --rm --name cf-hybrid-fake-api --network "$network" --network-alias backend node:22-alpine node -e '
  require("http").createServer((req,res)=>{
    res.setHeader("Content-Type","application/json");
    if (req.url.startsWith("/api/auth/me")) { res.writeHead(401); return res.end(JSON.stringify({error:"No autenticado"})); }
    if (req.url.startsWith("/api/content/news")) return res.end("[]");
    if (req.url.startsWith("/api/content/site")) return res.end("{}");
    res.writeHead(404); res.end("{}");
  }).listen(5000,"0.0.0.0");
' >/dev/null
docker run -d --rm --name cf-hybrid-vue --network "$network" --network-alias frontend-legacy-preview cf-legacy-preview-smoke >/dev/null
docker run -d --rm --name cf-hybrid-nuxt --network "$network" --network-alias frontend-nuxt \
  -e NUXT_CMS_API_BASE=http://backend:5000 cf-nuxt-preview-smoke >/dev/null
docker run -d --rm --name cf-hybrid-gateway --network "$network" -p 127.0.0.1:18083:80 \
  -v "$PWD/deploy/nuxt-local-hybrid-gateway.conf:/etc/nginx/conf.d/default.conf:ro" \
  nginx:1.27-alpine >/dev/null
ready=0
for _ in $(seq 1 50); do
  if curl -fsS "$base/servicios/transporte-maritimo" >/tmp/cf-hybrid-service.html 2>/dev/null; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != 1 ]]; then
  docker logs cf-hybrid-gateway >&2
  docker logs cf-hybrid-nuxt >&2
  echo "FAIL gateway Nuxt no responde" >&2
  exit 1
fi
grep -q 'service-detail-page' /tmp/cf-hybrid-service.html
curl -fsS "$base/cotizaciones?servicio=Maritime" >/tmp/cf-hybrid-quote.html
grep -q 'id="app"' /tmp/cf-hybrid-quote.html
jsasset="$(grep -oE '/assets/index-[^"]+\.js' /tmp/cf-hybrid-quote.html | head -n 1)"
if [[ -z "$jsasset" ]]; then echo "FAIL HTML de cotizaciones no referencia JS compilado" >&2; exit 1; fi
curl -fsS "$base$jsasset" >/tmp/cf-hybrid-quote.js
grep -q 'vue' /tmp/cf-hybrid-quote.js || test -s /tmp/cf-hybrid-quote.js
status="$(curl -s -o /dev/null -w '%{http_code}' "$base/api/auth/me")"
test "$status" = "401"
chrome="$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)"
if [[ -z "$chrome" ]]; then echo "FAIL Chrome no disponible para validar SPA" >&2; exit 1; fi
for page in "bienvenidos" "cotizaciones?servicio=Maritime"; do
  html="$("$chrome" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage \
    --no-first-run --disable-extensions --disable-background-networking \
    --virtual-time-budget=12000 --dump-dom "$base/$page" 2>/tmp/cf-hybrid-chrome-errors.log)"
  if [[ "$page" == bienvenidos ]]; then
    grep -q 'login-screen' <<< "$html" || { echo "FAIL login vacío" >&2; exit 1; }
  else
    grep -q 'quote-access-status--blocked' <<< "$html" || {
      echo "FAIL cotizaciones en blanco o sin control de sesión" >&2
      echo "$html" | tail -c 1000 >&2
      exit 1
    }
  fi
  echo "PASS Chrome gateway: $page"
done
python3 -m venv /tmp/cf-hybrid-selenium
/tmp/cf-hybrid-selenium/bin/pip install --disable-pip-version-check --quiet selenium==4.38.0
/tmp/cf-hybrid-selenium/bin/python scripts/test-nuxt-menu-selenium.py "$base"
echo "PASS SSR + Vue compilado + assets + API + login + cotizaciones + menús responsive"
