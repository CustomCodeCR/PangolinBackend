# Despliegue Nuxt SSR — Pangolin en producción

## Qué despliega cada rama

- `main`: el workflow `.github/workflows/pangolin-images.yml` construye y publica imágenes inmutables en GHCR (`frontend`, `backend`, `nuxt`), despliega los servicios en el runner `dhole`, prueba Nuxt como canary, y solo entonces activa el gateway en el dominio **WWW**.
- `main-2`: revisiones, pruebas y compilación Nuxt, sin despliegue a producción.
- `logisticacastrofallas.com` **sin WWW** permanece en Fennec; no modificar su enrutamiento ni reclamar la raíz a espaldas de Fennec.

## Política vigente de dos dominios independientes (2026-11-10)

La dirección confirmó que Castro Fallas **mantendrá por ahora las dos webs**. La posible unificación o redirección requiere decisión posterior del jefe; **no** forma parte del lanzamiento de `main-2`.

- `https://www.logisticacastrofallas.com` se sigue publicando en **Dhole** desde `main`.
- `https://logisticacastrofallas.com` se sigue sirviendo desde **Fennec** y **no** se modifica su router, DNS, infraestructura ni despliegue.
- Los dos sitios pueden seguir respondiendo **HTTP 200**. Para contenido idéntico, ambos deben declarar el `rel="canonical"` a la URL correspondiente con **WWW**, que debe tener canonical autorreferencial, ser indexable y aparecer en el sitemap preferido. Esto **no** exige una redirección 301.
- Las páginas privadas (`/administracion`, `/tracking`, `/bienvenidos`, etc.) permanecen excluidas según su naturaleza; nunca marcar páginas públicas importantes como `noindex` para resolver duplicados.
- Asegurar enlaces HTML visibles a las páginas comerciales, especialmente guías de servicios, y enlaces a `/` en lugar de `/home` desde la navegación pública.
- El informe de Search Console registra `https://logisticacastrofallas.com/noticias` como **Soft 404**, último rastreo 2026-10-25; el estado **no** se declara resuelto por un `200` actual o por mejorar `main-2`. Comparar HTML útil de ambos sitios y solicitar prueba en vivo después de verificar la causa.
- El informe también contiene páginas comerciales **Descubierta: actualmente sin indexar**. La preparación SSR, el sitemap y los enlaces facilitan el rastreo, pero **no garantizan la indexación** y esta solo podrá revisarse nuevamente cuando Google haya rastreado la nueva versión publicada.
- **Bloqueo de publicación:** no fusionar ni desplegar sin corregir defectos técnicos verificables, revisar backup/canary/rollback y obtener autorización expresa de producción. El sitio actual sin WWW no se actualiza automáticamente al fusionar `main`.

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

## Reversión compatible con cotizaciones de invitados (2026-11-09)

**Importante:** el nuevo backend permite crear solicitudes oficiales sin iniciar sesión.
`official_quote_requests.cliente_id` y `usuario_id` son nullable en la migración aditiva.
El backend previo a esta versión mapea ambos campos a `Guid` no anulables;
si existen solicitudes anónimas podría fallar al recuperar registros completos.
No asumir que revertir todas las imágenes a la última etiqueta antigua es inocuo.

### Decisión según el alcance del incidente

1. **Solo falla Nuxt, SEO o la interfaz pública:** revertir el router de Nuxt para WWW al frontend legacy
   (procedimiento de la sección anterior); mantener el backend nuevo y la base sin modificar.
   Esto **no** revierte cambios del backend, cotizaciones ni migraciones.
2. **Falla solo una función de frontend:** evaluar desplegar temporalmente una imagen frontend anterior
   compatible con el backend nuevo. Confirmar el estado de `VITE_OFFICIAL_QUOTES_ENABLED`
   y las rutas; no eliminar solicitudes ni revertir la base de datos.
3. **Se plantea volver al backend anterior:** **detener la reversión** hasta comprobar si existen
   solicitudes de invitados. Consulta de solo lectura sobre la BD `pangolin` (usuario autorizado,
   sin compartir credenciales ni resultados que incluyan datos personales):

   ```sql
   SELECT COUNT(*) AS solicitudes_invitadas
   FROM public.official_quote_requests
   WHERE cliente_id IS NULL OR usuario_id IS NULL;
   ```

   - Resultado **mayor que 0**: NO desplegar la imagen de backend anterior sin preparar y verificar
     una variante compatible con columnas nullable (o una solución correctiva en la nueva versión).
     Conservar los datos y continuar la recuperación con revisión de backend/DB.
   - Resultado **0**: el riesgo concreto de materialización de filas nulas no se presenta;
     aun así realizar preflight, revisar las demás diferencias de API y validar login/quoting/CMS
     antes de retroceder el backend.
4. **Restauración de PostgreSQL:** el respaldo `pg_dump -Fc` del pipeline está destinado a
   recuperación de desastre. **Nunca restaurarlo automáticamente** para revertir un cambio visual:
   una restauración completa eliminaría cotizaciones, noticias u otras escrituras posteriores al backup.
   Si una restauración completa fuera imprescindible, planificar previamente una conservación/reconciliación
   de los datos creados desde la copia, con autorización de operaciones.

### Condiciones antes de fusionar a producción

- Verificar el preflight del workflow de publicación: catálogo oficial público HTTP 200 con `items`,
  itinerarios públicos HTTP 200, rutas privadas HTTP 401/403.
- Comprobar antes del despliegue que `cliente_id` y `usuario_id` están marcados `IS_NULLABLE=YES`.
- Revisar la etiqueta inmutable de la versión actual y confirmar los pasos de rollback del router de WWW.
- No confundir el rollback automático de Nuxt con un rollback total: el pipeline actual activa
  primero el backend/frontend y **solo revierte el router Nuxt** ante fallo en la conmutación WWW.
- Realizar pruebas reales autorizadas de autenticación, GIO, cotización y seguimiento sin crear
  solicitudes ficticias en producción. Si hay incertidumbre, conservar la PR en borrador.
