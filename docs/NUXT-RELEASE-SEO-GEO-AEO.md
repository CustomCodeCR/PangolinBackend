# Rollout Nuxt híbrido con diseño Pangolin original

## Arquitectura
- `frontend`: Vue/Vite actual, conserva el backend y todos los flujos privados.
- `frontend-nuxt`: SSR/SSG para Inicio, Nosotros, Servicios, guías y Noticias.
- `seo-gateway`: enruta rutas públicas a Nuxt y privadas a la SPA original.
- No cambia automáticamente el host HTTPS ni la configuración Cloudflare.

## Levantar preview sin cambiar el host público
```bash
docker compose --env-file .env.production \
  -f compose.production.yaml \
  -f compose.nuxt-preview.yaml \
  -f compose.nuxt-hybrid.yaml \
  up -d --build frontend frontend-nuxt seo-gateway
```
El router híbrido queda en 127.0.0.1:8083. La web anterior mantiene 127.0.0.1:8080.

## Verificaciones obligatorias antes de cambiar upstream
1. `curl -i -H 'Host: www.logisticacastrofallas.com' http://127.0.0.1:8083/` retorna 200 con contenido HTML y el diseño original.
2. Rutas `/nosotros`, `/servicios`, cuatro guías, `/noticias` y cada artículo publicado: HTML con H1, schema y canonical correctos sin JS.
3. `/home` devuelve 301 hacia la canónica y `/sitemap.xml`, `/robots.txt` devuelven 200.
4. `/bienvenidos`, `/cotizaciones`, `/tracking`, `/itinerario` y `/administracion` conservan sesión y permisos. Probar login, logout, SignalR, cotizar y admin.
5. Revisar en navegadores móvil/desktop ambos temas e idiomas. Comparar capturas con producción.
6. Verificar que las noticias del CMS no publicadas o vencidas no aparezcan en sitemap o URL pública.
7. Revisar Cloudflare Security Events y Google Search Console URL Inspection.
8. Ejecutar pruebas con una respuesta 404 real en páginas inexistentes.
9. Confirmar que el origin de seguridad y cookies autorizadas corresponde al dominio final.
10. Con las comprobaciones aprobadas, actualizar el reverse proxy HTTPS del host desde 127.0.0.1:8080 a 127.0.0.1:8083 y dejar el upstream antiguo para rollback.

## Rollback inmediato
Volver a cambiar el upstream HTTPS a 127.0.0.1:8080. No se modifican datos ni la configuración de PostgreSQL, Redis, JWT o Dynamics.

## Importante
La aprobación de CI es una condición necesaria, no suficiente para cambiar producción: hay que probar con el CMS y las credenciales reales del entorno, sin compartir secretos. No se garantiza posición en Google ni cita en ChatGPT: Search Console, Bing, rastreo real OAI-SearchBot y autoridad pública deben medirse tras la publicación.
