#!/usr/bin/env bash
# Validates the actual nginx production image; preview Vite does not model nginx HTTP statuses.
set -euo pipefail
cd "$(dirname "$0")/.."
port=18088
network=cf-seo-nginx-net
cleanup() {
  docker rm -f cf-seo-nginx cf-seo-dns-api >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker build -f frontend/Dockerfile -t cf-seo-nginx-test frontend
docker network create "$network" >/dev/null
# nginx.conf references the production "backend" hostname at nginx startup.
docker run -d --rm --name cf-seo-dns-api --network "$network" --network-alias backend nginx:alpine >/dev/null
docker run -d --rm --name cf-seo-nginx --network "$network" -p 127.0.0.1:$port:80 cf-seo-nginx-test >/dev/null
base="http://127.0.0.1:$port"
ready=0
for _ in $(seq 1 35); do
  if curl -sSf "$base/" >/dev/null; then ready=1; break; fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  docker logs cf-seo-nginx >&2
  echo 'ERROR: nginx production frontend did not become ready' >&2
  exit 1
fi
test_http() {
  local pathname="$1" status="$2" actual
  actual="$(curl --silent --output /dev/null --write-out '%{http_code}' "$base$pathname")"
  if [[ "$actual" != "$status" ]]; then
    echo "FAIL HTTP $pathname: wanted=$status got=$actual" >&2
    exit 1
  fi
  echo "PASS HTTP $status: $pathname"
}
for url in / /home /servicios /nosotros /noticias /privacidad /terminos /cookies /licencias \
  /bienvenidos /tracking /itinerario /cotizaciones /administracion /admin/contenido /admin/usuarios; do
  # nginx may canonicalize a directory by 301 first; curl -L checks final status and HTML.
  final="$(curl --location --silent --output /dev/null --write-out '%{http_code}' "$base$url")"
  if [[ "$final" != "200" ]]; then
    echo "FAIL HTTP known route $url: final=$final" >&2
    exit 1
  fi
  html="$(curl --location --silent "$base$url")"
  grep -q '<title>' <<< "$html" || { echo "No title: $url"; exit 1; }
  if [[ "$url" == "/tracking" || "$url" == "/itinerario" || "$url" == "/bienvenidos" || "$url" == "/cotizaciones" || "$url" == "/administracion" || "$url" == "/admin/"* ]]; then
    grep -q 'name="robots" content="noindex,nofollow"' <<< "$html" || { echo "Missing noindex: $url"; exit 1; }
    if grep -q 'rel="canonical"' <<< "$html"; then echo "Private canonical: $url"; exit 1; fi
  else
    grep -q 'name="robots" content="index,follow"' <<< "$html" || { echo "Missing index/follow: $url"; exit 1; }
    grep -q 'rel="canonical"' <<< "$html" || { echo "Missing canonical: $url"; exit 1; }
  fi
  echo "PASS nginx route: $url"
done
test_http "/nonexistent-route-seo-qa" 404
test_http "/nonexistent-route-seo-qa/deeper" 404
test_http "/404.html" 404
test_http "/robots.txt" 200
test_http "/sitemap.xml" 200
test_http "/images/logo.png" 200
test_http "/favicon.png" 200
test_http "/api/not-a-real-route" 404
curl --fail --silent "$base/sitemap.xml" | grep -q 'https://logisticacastrofallas.com/servicios'
curl --fail --silent "$base/robots.txt" | grep -q 'Sitemap: https://logisticacastrofallas.com/sitemap.xml'
echo 'PASS: nginx production HTTP routes, assets, sitemap, robots, 404, private noindex and canonical'
