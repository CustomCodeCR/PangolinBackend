# Despliegue Nuxt SSR — Pangolin en producción

## Qué despliega cada rama

- `main`: el workflow `.github/workflows/pangolin-images.yml` construye y publica imágenes inmutables en GHCR (`frontend`, `backend`, `nuxt`), despliega los servicios en el runner `dhole`, prueba Nuxt como canary, y solo entonces activa el gateway en el dominio **WWW**.
- `main-2`: revisiones, pruebas y compilación Nuxt, sin despliegue a producción.
- `logisticacastrofallas.com` **sin WWW** permanece en Fennec; no modificar su enrutamiento ni reclamar la raíz a espaldas de Fennec.

## Enrutamiento

`https://www.logisticacastrofallas.com`:
- Nuxt SSR/SSG: inicio, servicios, noticias, nosotros, sitemap, robots y páginas públicas.
- SPA Vue existente: login, cotizaciones, tracking, itinerario, administración y documentos legales.
- Backend .NET/SignalR existente: peticiones `/api/*`, incluidas las autenticadas.

El servicio `seo-gateway` utiliza un router Traefik dedicado `*-pangolin-nuxt-www` con prioridad 1100. El router del frontend Vue permanece con prioridad 1000 para revertir el tráfico.

## Salvaguardas automáticas

1. Compilación de imagen Nuxt: si falla, el job `publish` detiene el despliegue.
2. Se valida el entorno privado y las credenciales existentes sin mostrarlas en los logs, además del backup SQL previo.
3. Nuevas imágenes y configuración se descargan en el runner `self-hosted,linux,x64,dhole`.
4. Gateway y Nuxt se levantan primero con `PANGOLIN_NUXT_TRAEFIK_ENABLED=false`: WWW permanece en Vue.
5. Canary de HTTP en `127.0.0.1:8183` (o puerto `PANGOLIN_HYBRID_LOCAL_PORT`): HTML SSR, canonical y schema, robots/sitemap, H1 y rutas antiguas.
6. Si todo pasa, se activa el router Nuxt **solo para WWW**. Si falla la comprobación de Traefik, el pipeline desactiva el router Nuxt y Vue sigue siendo el fallback.

## Archivos persistentes

El job copia la configuración a `$HOME/pangolin-release/` en el runner de producción para que Docker pueda reiniciar contenedores sin depender del directorio temporal de GitHub Actions:
- `docker-compose.images.yml`
- `nuxt-hybrid-gateway.conf`
- `current-tag` (etiqueta del último release validado)

Las imágenes se obtienen de GHCR; no se construye Nuxt ni se descarga el repositorio completo en el servidor.

## Rollback de WWW

En el runner Dhole, usar el mismo usuario con acceso a Docker:

```bash
cd "$HOME/pangolin-release"
export PANGOLIN_IMAGE_TAG="$(cat current-tag)"
export PANGOLIN_GATEWAY_CONFIG_PATH="$HOME/pangolin-release/nuxt-hybrid-gateway.conf"
export PANGOLIN_NUXT_TRAEFIK_ENABLED=false
export PANGOLIN_TRAEFIK_ENABLED=true
docker compose --env-file /opt/dhole/.env -f "$HOME/pangolin-release/docker-compose.images.yml" -p pangolin-production up -d --no-build --no-deps seo-gateway
```

Esto desactiva el router Nuxt y deja el router Vue activo; no modifica PostgreSQL, JWT, Redis ni Fennec. Verificar con `curl -H "Host: www.logisticacastrofallas.com" http://127.0.0.1/`.

## Seguimiento SEO/GEO/AEO/AIO

Después del deploy, verificar `https://www.logisticacastrofallas.com/robots.txt`, `sitemap.xml`, canonical, Search Console, Bing Webmaster Tools y logs de Cloudflare para `OAI-SearchBot`. Publicar contenido original, mejorar la presencia pública de las marcas del grupo y verificar citas en motores de respuesta. Permitir rastreadores no garantiza aparición en ChatGPT.

**El dominio raíz no cambia**: para consolidar resultados de Google y evitar duplicidad, acordar después el host canónico único con el equipo de Fennec y aplicar redirecciones sin interrumpir la aplicación.
