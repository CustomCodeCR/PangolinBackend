#!/usr/bin/env bash
# Smoke real del gateway integrado: HTML Vue, JS compilado, autenticacion y Nuxt.
# Nunca usa sesiones ni secretos de producción.
set -euo pipefail
cd "$(dirname "$0")/.."
network="cf-hybrid-smoke"
base="http://127.0.0.1:18083"
cleanup() {
  for name in cf-hybrid-gateway cf-hybrid-nuxt cf-hybrid-vue cf-hybrid-fake-api cf-hybrid-ip-holder cf-hybrid-health-fixture; do
    docker rm -f "$name" >/dev/null 2>&1 || true
  done
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT
# Test-only liveness: strict HTTP 200 on the public root, with an absolute deadline.
# No database readiness or external network dependency is part of this probe.
nuxt_health_cmd='node -e '\''const http=require("node:http"); const timer=setTimeout(()=>process.exit(1),2000); const req=http.get("http://127.0.0.1:3000/",res=>{clearTimeout(timer);res.destroy();process.exit(res.statusCode===200?0:1)});req.on("error",()=>process.exit(1));'\'''
wait_health() {
  local container="$1" expected="$2" state
  for _ in $(seq 1 60); do
    state="$(docker inspect -f '{{.State.Health.Status}}' "$container")"
    if [[ "$state" == "$expected" ]]; then return 0; fi
    sleep 1
  done
  echo "FAIL expected health $expected for $container (last: $state)" >&2
  return 1
}
docker network create "$network" >/dev/null
# Exercise the same command in the real runtime image against a synthetic server.
# SIGUSR2 toggles 503/200 without restarting the process or publishing a port.
docker run -d --rm --name cf-hybrid-health-fixture --network none \
  --security-opt no-new-privileges:true --cap-drop ALL --read-only \
  --health-cmd "$nuxt_health_cmd" --health-interval 2s --health-timeout 3s --health-retries 2 \
  --entrypoint node cf-nuxt-preview-smoke -e '
    let status=503;
    process.on("SIGUSR2",()=>{status=status===503?200:503});
    require("node:http").createServer((req,res)=>{res.writeHead(status);res.end("fixture")}).listen(3000,"127.0.0.1");
  ' >/dev/null
wait_health cf-hybrid-health-fixture unhealthy
echo "PASS Nuxt health probe rejects HTTP 503"
fixture_started="$(docker inspect -f '{{.State.StartedAt}}' cf-hybrid-health-fixture)"
docker kill --signal=SIGUSR2 cf-hybrid-health-fixture >/dev/null
wait_health cf-hybrid-health-fixture healthy
test "$(docker inspect -f '{{.State.StartedAt}}' cf-hybrid-health-fixture)" = "$fixture_started"
docker kill --signal=SIGUSR2 cf-hybrid-health-fixture >/dev/null
wait_health cf-hybrid-health-fixture unhealthy
test "$(docker inspect -f '{{.State.StartedAt}}' cf-hybrid-health-fixture)" = "$fixture_started"
echo "PASS Docker health transitions unhealthy/healthy/unhealthy without restart"
docker rm -f cf-hybrid-health-fixture >/dev/null
docker run -d --rm --name cf-hybrid-fake-api --network "$network" --network-alias backend node:22-alpine node -e '
  require("http").createServer((req,res)=>{
    res.setHeader("Content-Type","application/json");
    if (req.url.startsWith("/api/auth/me")) { res.writeHead(401); return res.end(JSON.stringify({error:"No autenticado"})); }
    if (req.url.startsWith("/api/content/news")) return res.end("[]");
    if (req.url.startsWith("/api/content/site")) return res.end(JSON.stringify([
      {key:"shared.logo.media",mediaSrc:"/api/content/media/11111111-1111-1111-1111-111111111111/file",mediaKind:"Imagen"},
      {key:"home.about.media",mediaSrc:"/api/content/media/11111111-1111-1111-1111-111111111111/file",mediaKind:"Imagen"},
      {key:"home.hero.media",mediaSrc:"/api/content/media/11111111-1111-1111-1111-111111111111/file",mediaKind:"Imagen"},
      {key:"services.complementary.customs.media",mediaSrc:"/api/content/media/11111111-1111-1111-1111-111111111111/file",mediaKind:"Imagen"}
    ]));
    if (/^\/api\/content\/media\/[0-9a-f-]+\/file$/.test(req.url)) {
      res.setHeader("Content-Type","image/png");
      return res.end(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGPcyG/IwMDAxMDAwMDAAAAL9gD1Qc+05AAAAABJRU5ErkJggg==","base64"));
    }
    res.writeHead(404); res.end("{}");
  }).listen(5000,"0.0.0.0");
' >/dev/null
# Solo para la auditoría: Vue compilado y la vista híbrida desde el mismo host.
docker run -d --rm --name cf-hybrid-vue --network "$network" --network-alias frontend-legacy-preview \
  -p 127.0.0.1:18084:80 cf-legacy-preview-smoke >/dev/null
docker run -d --rm --name cf-hybrid-nuxt --network "$network" --network-alias frontend-nuxt \
  --security-opt no-new-privileges:true --cap-drop ALL --read-only \
  --health-cmd "$nuxt_health_cmd" --health-interval 2s --health-timeout 3s --health-retries 3 --health-start-period 15s \
  -e NUXT_CMS_API_BASE=http://backend:5000 cf-nuxt-preview-smoke >/dev/null
wait_health cf-hybrid-nuxt healthy
echo "PASS actual Nuxt HTTP liveness under read-only and restricted privileges"
docker exec cf-hybrid-nuxt cat /proc/1/status | awk '
  /^NoNewPrivs:/ { n = ($2 == 1) }
  /^CapEff:/ { e = ($2 ~ /^0+$/) }
  /^CapPrm:/ { p = ($2 ~ /^0+$/) }
  /^CapBnd:/ { b = ($2 ~ /^0+$/) }
  /^Uid:/ { u = ($2 != 0 && $3 != 0) }
  END { exit !(n && e && p && b && u) }
'
echo "PASS Nuxt runtime: non-root, no-new-privileges, no Linux capabilities"
# A non-root process would already be denied in /app by Unix ownership.
# Check an ordinarily writable /tmp path and require EROFS, not just EACCES.
test "$(docker inspect -f '{{.HostConfig.ReadonlyRootfs}}' cf-hybrid-nuxt)" = true
docker exec cf-hybrid-nuxt node -e '
  const fs = require("node:fs");
  const p = "/tmp/pangolin-readonly-fixture-" + process.pid;
  try {
    fs.writeFileSync(p, "synthetic fixture", { flag: "wx" });
    fs.unlinkSync(p);
    throw new Error("Unexpected writable root filesystem");
  } catch (e) {
    if (e.code !== "EROFS") throw e;
  }
'
echo "PASS Nuxt runtime read-only root filesystem: actual write rejected with EROFS"
docker run -d --rm --name cf-hybrid-gateway --network "$network" -p 127.0.0.1:18083:80 \
  -v "$PWD/deploy/nuxt-local-hybrid-gateway.conf:/etc/nginx/conf.d/default.conf:ro" \
  nginx:alpine@sha256:7fc0fb4af7bf006aeb31aea88069976060f8f0a0a86b667126742cc17f4e31ae >/dev/null
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
grep -q 'service-landing-page' /tmp/cf-hybrid-service.html
# El gateway híbrido debe entregar la imagen PNG real, no HTML de una ruta fallback.
curl -fsS --max-time 12 "$base/favicon.png" -o /tmp/cf-hybrid-favicon.png
cmp frontend/public/favicon.png /tmp/cf-hybrid-favicon.png || {
  echo "FAIL favicon de Castro Fallas no coincide en el gateway Nuxt" >&2
  exit 1
}
echo "PASS favicon Nuxt idéntico al PNG de marca"
# No basta con comprobar HTML: las vistas públicas y privadas, sus imágenes,
# el CMS publicado y los bundles Nuxt/Vue deben cargar bajo el MISMO origen.
for route in / /nosotros /servicios /noticias \
  /privacidad /terminos /cookies /licencias \
  /servicios/transporte-maritimo /servicios/transporte-terrestre \
  /servicios/transporte-aereo \
  /servicios/transporte-local /servicios/transporte-panama-costa-rica \
  /servicios/almacenamiento-fiscal \
  /servicios/agenciamiento-aduanal /servicios/consolidadora-de-carga \
  /bienvenidos /cotizaciones /cotizaciones/nuevo /tracking /itinerario \
  /administracion /administracion/cotizaciones-oficiales /admin/contenido /admin/usuarios; do
  curl -fsS --max-time 12 "$base$route" >/dev/null ||
    { echo "FAIL ruta híbrida: $route" >&2; exit 1; }
done
# Retired individual services must return real HTTP 404, not a fallback landing.
for route in /servicios/bodegaje-general /servicios/transporte-internacional; do
  status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 12 "$base$route")"
  [[ "$status" == "404" ]] || { echo "FAIL servicio retirado $route: HTTP $status" >&2; exit 1; }
done
# Las URLs corporativas no deben volver a aparecer por una ruta fallback del gateway.
for route in /empresas /empresas/aduanera-castro-fallas /empresas/neriteka /empresas/transporte-castro-fallas; do
  status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 12 "$base$route")"
  [[ "$status" == "404" ]] || { echo "FAIL empresa retirada $route: HTTP $status" >&2; exit 1; }
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
    # En la preview híbrida las cotizaciones oficiales son públicas.
    # Validar que el formulario real está visible, no solo un contenedor Vue.
    grep -q 'official-page' <<< "$html" && grep -q 'official-panel' <<< "$html" || {
      echo "FAIL cotizaciones públicas no muestran el formulario oficial" >&2
      echo "$html" | tail -c 1000 >&2
      exit 1
    }
  fi
  echo "PASS Chrome gateway: $page"
done
# Reproduce el 502 habitual de un docker compose up --build: Nuxt se
# recrea con nueva IP mientras Nginx permanece en ejecución. Debe recuperar
# su conexión sin reiniciar Nginx ni volver a enlazar las rutas.
old_nuxt_ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' cf-hybrid-nuxt)"
docker rm -f cf-hybrid-nuxt >/dev/null
# Ocupar la IP antigua para comprobar de verdad el cambio de DNS.
docker run -d --rm --name cf-hybrid-ip-holder --network "$network" \
  node:22-alpine node -e 'setInterval(()=>{},10000)' >/dev/null
docker run -d --rm --name cf-hybrid-nuxt --network "$network" --network-alias frontend-nuxt \
  --security-opt no-new-privileges:true --cap-drop ALL --read-only \
  --health-cmd "$nuxt_health_cmd" --health-interval 2s --health-timeout 3s --health-retries 3 --health-start-period 15s \
  -e NUXT_CMS_API_BASE=http://backend:5000 cf-nuxt-preview-smoke >/dev/null
wait_health cf-hybrid-nuxt healthy
echo "PASS actual Nuxt HTTP liveness under read-only and restricted privileges"
docker exec cf-hybrid-nuxt cat /proc/1/status | awk '
  /^NoNewPrivs:/ { n = ($2 == 1) }
  /^CapEff:/ { e = ($2 ~ /^0+$/) }
  /^CapPrm:/ { p = ($2 ~ /^0+$/) }
  /^CapBnd:/ { b = ($2 ~ /^0+$/) }
  /^Uid:/ { u = ($2 != 0 && $3 != 0) }
  END { exit !(n && e && p && b && u) }
'
echo "PASS Nuxt runtime: non-root, no-new-privileges, no Linux capabilities"
# A non-root process would already be denied in /app by Unix ownership.
# Check an ordinarily writable /tmp path and require EROFS, not just EACCES.
test "$(docker inspect -f '{{.HostConfig.ReadonlyRootfs}}' cf-hybrid-nuxt)" = true
docker exec cf-hybrid-nuxt node -e '
  const fs = require("node:fs");
  const p = "/tmp/pangolin-readonly-fixture-" + process.pid;
  try {
    fs.writeFileSync(p, "synthetic fixture", { flag: "wx" });
    fs.unlinkSync(p);
    throw new Error("Unexpected writable root filesystem");
  } catch (e) {
    if (e.code !== "EROFS") throw e;
  }
'
echo "PASS Nuxt runtime read-only root filesystem: actual write rejected with EROFS"
new_nuxt_ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' cf-hybrid-nuxt)"
[[ "$old_nuxt_ip" != "$new_nuxt_ip" ]] || {
  echo "FAIL la prueba no consiguió cambiar la IP de Nuxt" >&2
  exit 1
}
recovered=0
for _ in $(seq 1 60); do
  if curl -fsS --max-time 4 -o /tmp/cf-hybrid-recovered.html "$base/servicios/transporte-maritimo" 2>/dev/null && grep -q 'service-landing-page' /tmp/cf-hybrid-recovered.html; then
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
/tmp/cf-hybrid-selenium/bin/python scripts/test-nuxt-home-services-selenium.py "$base"
/tmp/cf-hybrid-selenium/bin/python scripts/test-nuxt-image-selenium.py "$base"
/tmp/cf-hybrid-selenium/bin/python scripts/test-nuxt-gio-selenium.py "$base"
/tmp/cf-hybrid-selenium/bin/python scripts/test-nuxt-private-parity.py "http://127.0.0.1:18084" "$base"
/tmp/cf-hybrid-selenium/bin/python scripts/test-nuxt-public-parity.py "http://127.0.0.1:18084" "$base"
echo "PASS SSR + Vue compilado + assets + API + login + cotizaciones + menús + CMS + paridad pública/privada"
