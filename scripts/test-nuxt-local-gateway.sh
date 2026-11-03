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
    if (/^\/api\/content\/media\/[0-9a-f-]+\/file$/.test(req.url)) {
      res.setHeader("Content-Type","image/png");
      return res.end(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nAAAAABJRU5ErkJggg==","base64"));
    }
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
# No basta con comprobar HTML: las vistas públicas y privadas, sus imágenes,
# el CMS publicado y los bundles Nuxt/Vue deben cargar bajo el MISMO origen.
for route in / /nosotros /servicios /noticias /empresas \
  /empresas/aduanera-castro-fallas /empresas/neriteka /empresas/transporte-castro-fallas \
  /privacidad /terminos /cookies /licencias \
  /servicios/transporte-maritimo /servicios/transporte-terrestre \
  /servicios/transporte-aereo /servicios/transporte-internacional \
  /servicios/transporte-local /servicios/transporte-panama-costa-rica \
  /servicios/almacenamiento-fiscal /servicios/bodegaje-general \
  /servicios/agenciamiento-aduanal /servicios/consolidadora-de-carga \
  /bienvenidos /cotizaciones /cotizaciones/nuevo /tracking /itinerario \
  /administracion /administracion/cotizaciones-oficiales /admin/contenido /admin/usuarios; do
  curl -fsS --max-time 12 "$base$route" >/dev/null ||
    { echo "FAIL ruta híbrida: $route" >&2; exit 1; }
done
for picture in frontend/public/images/*; do
  [[ -f "$picture" ]] || continue
  name="${picture##*/}"
  content_type="$(curl -fsS --max-time 12 -o /dev/null -w '%{content_type}' "$base/images/$name")" ||
    { echo "FAIL imagen pública: $name" >&2; exit 1; }
  [[ "$content_type" == image/* ]] ||
    { echo "FAIL tipo de imagen $name: $content_type" >&2; exit 1; }
done
# Las imágenes elegidas por CMS se sirven desde .NET, no desde Nitro.
media_type="$(curl -fsS -o /dev/null -w '%{content_type}' \
  "$base/api/content/media/11111111-1111-1111-1111-111111111111/file")"
[[ "$media_type" == image/png* ]] || { echo "FAIL proxy de imágenes CMS" >&2; exit 1; }
nuxtjs="$(grep -oE '/_nuxt/[^"]+\.js' /tmp/cf-hybrid-service.html | head -n 1 || true)"
if [[ -n "$nuxtjs" ]]; then
  curl -fsS "$base$nuxtjs" >/dev/null || { echo "FAIL chunk de Nuxt $nuxtjs" >&2; exit 1; }
fi
echo "PASS páginas públicas/privadas, imágenes locales y del CMS"
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
# Reproduce el 502 habitual de un docker compose up --build: Nuxt se
# recrea con nueva IP mientras Nginx permanece en ejecución. Debe recuperar
# su conexión sin reiniciar Nginx ni volver a enlazar las rutas.
docker rm -f cf-hybrid-nuxt >/dev/null
docker run -d --rm --name cf-hybrid-nuxt --network "$network" --network-alias frontend-nuxt \
  -e NUXT_CMS_API_BASE=http://backend:5000 cf-nuxt-preview-smoke >/dev/null
recovered=0
for _ in $(seq 1 60); do
  if curl -fsS --max-time 4 "$base/servicios/transporte-maritimo" | grep -q 'service-detail-page'; then
    recovered=1
    break
  fi
  sleep 1
done
[[ "$recovered" == 1 ]] || {
  echo "FAIL el gateway queda en 502 después de recrear Nuxt" >&2
  docker logs cf-hybrid-gateway >&2
  exit 1
}
echo "PASS recuperación después de recrear Nuxt sin reiniciar Nginx"
python3 -m venv /tmp/cf-hybrid-selenium
/tmp/cf-hybrid-selenium/bin/pip install --disable-pip-version-check --quiet selenium==4.38.0
/tmp/cf-hybrid-selenium/bin/python scripts/test-nuxt-menu-selenium.py "$base"
echo "PASS SSR + Vue compilado + assets + API + login + cotizaciones + menús responsive"
