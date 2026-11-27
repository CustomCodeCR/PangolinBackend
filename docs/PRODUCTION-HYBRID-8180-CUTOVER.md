# Corte supervisado: gateway híbrido Nuxt en el puerto local 8180

> **Estado:** preparación para revisión, no ejecuta ningún cambio en el servidor.
> **Alcance:** únicamente `www.logisticacastrofallas.com` servido por Pangolin en Argos/Dhole.
> El dominio sin WWW y Fennec deben permanecer intactos.

## Contexto comprobado el 5 de noviembre de 2026

- `https://www.logisticacastrofallas.com/` sigue entregando los bundles Vue/Vite.
- La petición pública con token único apareció en `pangolin-production-frontend-1`, no en `seo-gateway`. La prueba local mostró lo contrario.
- `127.0.0.1:80` (Traefik) y `127.0.0.1:8183` entregaron Nuxt correctamente.
- `cloudflared.service` está activo y utiliza gestión remota. Sus logs mencionaron `localhost:8180` y `localhost:80`, pero **no prueban la ruta actual de WWW**.
- No hay autorización ni acceso al panel Cloudflare. Este procedimiento **no presupone** un origen concreto; lo verifica por comportamiento.

## Objetivo y alcance de la PR

Conservar el frontend Vue compilado dentro de Docker para rutas privadas y bundles `/assets/*`, y permitir que el gateway Nuxt ocupe el **mismo puerto local 8180** que hoy utiliza Vue. Los valores por defecto de Compose **no cambian** al fusionar la PR.

| Modo | Vue legacy (solo loopback) | Gateway híbrido (solo loopback) | Nuxt directo |
| --- | --- | --- | --- |
| Actual | `127.0.0.1:8180` | `127.0.0.1:8183` | `127.0.0.1:8182` |
| Opt-in después del corte | `127.0.0.1:8184` | `127.0.0.1:8180` | `127.0.0.1:8182` |

El gateway envía páginas públicas a Nuxt SSR, pantallas privadas y `/assets/*` al frontend Vue, y las APIs de la aplicación al backend a través del proxy existente. No se elimina Vue, no se mueven bases de datos y no se expone ningún puerto por `0.0.0.0`.

## Revisión antes de fusionar

1. Comprobar el workflow `Backend and frontend integration`, incluido `python3 scripts/test-production-hybrid-port-plan.py` en CI. La prueba renderiza Compose con credenciales ficticias y **no modifica Docker**.
2. Verificar `deploy/nuxt-hybrid-gateway.conf`: `/assets/*` de Vue se envía a legacy, y `/_nuxt/*` y las páginas públicas siguen llegando a Nuxt.
3. Revisar el funcionamiento de inicio, noticias, servicios, login, OTP, cotizaciones, administración, tracking, itinerarios y SignalR. Probar usuarios autorizados de forma supervisada, sin compartir cookies ni OTP.
4. Recordar que un merge a `main` sobre `deploy/**` dispara automáticamente el pipeline de imágenes y despliegue. **Eso no activa el cambio de puerto**, pero sí publica esta versión del gateway. No fusionar sin aprobar esa publicación.
5. Verificar que existen acceso de consola a Argos, copia de seguridad de la configuración del operador y responsable disponible para el rollback. No tocar Fennec.

## Comprobaciones previas al corte (solo lectura)

Ejecutar en Argos, **no en Windows**, con permisos de Docker:

```bash
docker ps --filter label=com.docker.compose.project=pangolin-production \
  --format '{{.Names}} | {{.Ports}}'
curl -fsS --max-time 10 http://127.0.0.1:8183/ | grep -Eq '/_nuxt/|__NUXT_DATA__'
curl -fsS --max-time 10 http://127.0.0.1:8183/cotizaciones | grep -q '/assets/index-'
```

Comprobar también que el JS privado existe por el gateway actual, con el asset exacto extraído del HTML, **sin** suponer que un HTTP 200 de inicio garantiza que login o cotizaciones funcionan.

Comparar pública y local con una URL de diagnóstico distinta para confirmar el comportamiento actual. Los logs del proxy deben estar configurados para registrar el token; la ausencia del token no demuestra la ausencia de tráfico.

Identificar el archivo Compose desplegado y el `nuxt-hybrid-gateway.conf` real que está montado. El pipeline guarda su configuración persistente en `$HOME/pangolin-release` del usuario **del runner**, que puede no coincidir con el `$HOME` de una sesión SSH.

```bash
docker inspect pangolin-production-seo-gateway-1 \
  --format '{{range .Mounts}}{{if eq .Destination "/etc/nginx/conf.d/default.conf"}}{{.Source}}{{end}}{{end}}'
```

No imprimir ni compartir `/opt/dhole/.env`, los tokens del túnel ni la configuración de credenciales.

## Activación supervisada, nunca automática

**Solo tras aprobación explícita y una ventana de mantenimiento**, confirmar primero que el tráfico WWW realmente depende del listener local 8180. De lo contrario esta maniobra podría no resolver la ruta pública.

1. Respaldar de forma privada y con permisos restrictivos la configuración `/opt/dhole/.env` y registrar los valores anteriores de `PANGOLIN_LOCAL_PORT` y `PANGOLIN_HYBRID_LOCAL_PORT`. Nunca subir el respaldo a GitHub.
2. Establecer en `/opt/dhole/.env`: `PANGOLIN_LOCAL_PORT=8184` y `PANGOLIN_HYBRID_LOCAL_PORT=8180`. Mantener intactos el resto de variables y secretos.
3. Preparar las mismas variables de entorno usadas por el workflow, especialmente el tag inmutable, el archivo montado `PANGOLIN_GATEWAY_CONFIG_PATH` y los flags de Traefik. **No dejar que Compose use sus valores `false` por defecto al recrear servicios**.
4. Ejecutar `docker compose config --quiet` sobre el Compose de producción y el archivo de entorno, y comprobar que los puertos resultantes son únicos y limitados a `127.0.0.1`. La salida completa de `config` puede contener secretos; no compartirla.
5. Recrear **solo** `frontend` con la nueva asignación 8184 para liberar 8180, y luego recrear **solo** `seo-gateway` para que ocupe 8180. No ejecutar `down`, `down -v`, `up --build` ni recrear PostgreSQL. Esta secuencia puede producir una breve interrupción del sitio público.
6. Verificar inmediatamente `http://127.0.0.1:8180/` y `https://www.logisticacastrofallas.com/` con señales `/_nuxt/`; probar `/cotizaciones`, sus `/assets/*` y la API de salud. El `200` por sí solo no valida la migración.
7. Confirmar que el dominio **sin** WWW continúa funcionando como antes, con Fennec. Si WWW sigue en Vue o cualquier ruta importante falla, revertir inmediatamente.

La activación no modifica Cloudflare, pero **no puede garantizarse sin una comprobación real después del corte**: el túnel puede tener otra regla o destino gestionado remotamente.

## Reversión supervisada

Restaurar los valores de puertos anteriores en el archivo de entorno privado: `PANGOLIN_LOCAL_PORT=8180` y `PANGOLIN_HYBRID_LOCAL_PORT=8183` (o los valores previos registrados).

Con el mismo tag, archivo Compose, configuración del gateway y flags de Traefik que estaban activos:

1. Recrear **primero `seo-gateway`**, que libera 8180 y vuelve a 8183.
2. Recrear **después `frontend`**, que vuelve a publicar 8180.
3. Comprobar HTTP público, login, cotizaciones y logs; conservar los volúmenes y la base de datos intactos.

Esta reversión de puertos no es lo mismo que desactivar el router Nuxt de Traefik; comprobar ambas rutas según el incidente. La configuración del túnel externo no se altera.

## Persistencia tras nuevos despliegues

El pipeline de `main` utiliza `/opt/dhole/.env` y los puertos de `deploy/docker-compose.images.yml`. Por ello los valores opt-in deben permanecer en ese archivo **solo después de un corte exitoso**. El workflow relee `PANGOLIN_HYBRID_LOCAL_PORT` para el canary. Si alguien restaura esos valores sin coordinarlo, el siguiente despliegue podría devolver el puerto 8180 a Vue.

**Criterio de cierre:** la URL pública WWW muestra Nuxt SSR en páginas públicas, Vue compilado en privadas, y el dominio raíz/Fennec no sufrió cambios. Sin esa verificación, el trabajo permanece preparado pero no activado.
