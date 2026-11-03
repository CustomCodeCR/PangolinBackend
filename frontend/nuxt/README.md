# Pangolin público — Nuxt 4 SSR / SSG (migración progresiva)

Este directorio es un **frontend Nuxt 4 real** con SSR y prerenderizado. Se introdujo sin sustituir a ciegas la SPA existente, para conservar administración, tracking, cotizaciones, autenticación y SignalR.

## Alcance funcional de esta etapa
- Nuxt renderiza en servidor Inicio, Nosotros, Servicios y las cuatro guías de servicios, con enlaces visibles, H1, contenido especializado y metadatos.
- Las noticias usan SSR desde la API pública .NET `GET /api/content/news`, con `Article` JSON-LD, canonical y sitemap dinámico.
- `robots.txt` permite `OAI-SearchBot` sin exigir permitir a `GPTBot` para entrenamiento.
- El contenido principal se entrega en HTML, no en placeholders llenados por JS.
- Los componentes privados de la SPA existente **todavía no han sido portados**. La migración completa de diseño, CMS editorial interactivo y rutas privadas requiere integración y pruebas adicionales.

## Ejecución de desarrollo
Desde `frontend/nuxt`:
```sh
npm install
NUXT_CMS_API_BASE=http://localhost:5000 npm run dev
```
El build de Docker reutiliza imágenes en `frontend/public/images` y las guías en `frontend/seo/service-landings.json`.

## Preview en servidor sin afectar producción
```sh
docker compose -f compose.production.yaml -f compose.nuxt-preview.yaml --env-file .env.production up -d --build frontend-nuxt
```
Se expone solo en `127.0.0.1:8082` (o `NUXT_PREVIEW_PORT`). No modifica el puerto del frontend actual ni el proxy HTTPS. Publicar después de comprobar paridad visual y funcional, hashes de assets, 200/301/404, integridad de cookies, Cloudflare, CSR privado y eventos SignalR.

## Validaciones antes del cambio del reverse proxy
```sh
npm run build
npm run check
curl -is http://127.0.0.1:8082/servicios/almacenamiento-fiscal | head -n 30
curl -is http://127.0.0.1:8082/robots.txt
curl -is http://127.0.0.1:8082/sitemap.xml
curl -is http://127.0.0.1:8082/noticias
```
Además comprobar todas las rutas con JavaScript desactivado, respuestas ante CMS caído, PWA si aplica, navegación móvil y crawler de Google. El endpoint público de noticias debe seguir devolviendo solo publicadas; no se exponen APIs administrativas a Nuxt.

## Google y ChatGPT
Después de desplegar: verificar dominio canónico y redirects `/home`/`www`, enviar sitemap en Search Console y Bing, revisar indexación y eventos WAF de OAI-SearchBot. No existe mecanismo que garantice que ChatGPT mencione a la empresa: la elegibilidad exige páginas públicas rastreables, contenido útil y autoridad de fuentes externas.

Fuentes:
- https://nuxt.com/docs/4.x/guide/concepts/rendering
- https://developers.openai.com/api/docs/bots
