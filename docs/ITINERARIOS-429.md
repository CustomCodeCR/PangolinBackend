# Mitigación de HTTP 429 en itinerarios y ubicaciones (main-2)

## Problema observado (12/11/2026)

En `/itinerario` y `/administracion` se recibían 429 en
`GET /api/itinerarios` y `GET /api/quotes/official/locations`.
Ambos endpoints compartían la política `auth` (20 peticiones/minuto y por IP
vista por ASP.NET). Un formulario sin transporte elegido podía lanzar ocho
peticiones al catálogo más una a itinerarios en cada carga, y varios visitantes
detrás de Nginx podían compartir la misma identidad de red.

## Corrección propuesta

- Las **lecturas públicas** de itinerarios y catálogos utilizan la política
  separada `public-read` (120 peticiones/minuto por partición). Autenticación
  mantiene `auth` (20/minuto); cotizaciones, tracking e IA mantienen sus cuotas.
- Las solicitudes rechazadas devuelven HTTP **429** con `Retry-After` en
  segundos. El frontend no debe reintentar automáticamente durante ese plazo.
  El período de espera del listado se conserva en la pestaña aunque se pulse F5.
- `GET /api/itinerarios/locations` reúne las modalidades FCL/LCL/FTL/LTL
  desde el catálogo oficial, con dos solicitudes (origen y destino) en lugar
  de ocho al abrir el filtro.
- `itineraryLocations.ts` conserva el catálogo público en caché de pestaña
  durante cinco minutos, deduplica consultas simultáneas y respeta un período
  de enfriamiento ante 429. La caché contiene solo nombres públicos, nunca
  credenciales, precios ni datos de clientes.
- Los usuarios autenticados con sesión validada tienen una partición propia
  para las lecturas públicas. Los visitantes anónimos utilizan la dirección
  de origen de la conexión o la dirección verificada en una cadena de proxies.
- La interfaz de itinerarios muestra el error transitorio *dentro* del resumen,
  preserva filtros y ofrece reintento manual. Otros errores siguen distinguiéndose.

## Identificación segura de la dirección real

Por seguridad no se confía en `X-Forwarded-For` enviado libremente por el
navegador. `RateLimitClientKey` solo lo consulta si la dirección TCP del
**salto inmediato** coincide con una IP exacta configurada en
`RateLimiting:TrustedProxyIps` (por ejemplo,
`RateLimiting__TrustedProxyIps__0`). Luego recorre la cadena de derecha a
izquierda hasta el primer salto **no confiable**. Una cabecera falsa a la
izquierda de ese salto no cambia la identidad de limitación.

**Despliegue real en Argos:** el workflow de imágenes usa
`deploy/docker-compose.images.yml` (no `compose.production.yaml`). Ese
Compose expone opcionalmente `PANGOLIN_RATE_LIMIT_TRUSTED_PROXY_IP_0/1` hacia
`RateLimiting__TrustedProxyIps__0/1`, **vacíos por defecto**. Añadir estas
variables al repositorio no activa confianza de proxies en producción.

**Inspección de solo lectura del 12/11/2026:** en la red `dhole`,
`seo-gateway` se resuelve hacia `frontend` en `172.18.0.40`,
y `frontend` hacia `backend` en `172.18.0.35`. El túnel
`cloudflared` corre con `--token` (gestionado remotamente); los logs
mencionan destinos `localhost:80` y `localhost:8180`, pero no determinan
qué hostname apunta a cada uno. **No se ha verificado de extremo a extremo**
la procedencia fiable del IP del visitante: no asumir que leer XFF devuelve
la IP pública correcta. Traefik podría ser otra capa de entrada.

**Configuración opcional de nombres Docker:** la política admite
`RateLimiting:TrustedProxyHostnames` con nombres de servicio exactos
(p. ej. `frontend` o `seo-gateway`, solo después de confirmar que son
saltos confiables). Solo acepta nombres internos de una etiqueta y direcciones
privadas resueltas por DNS, con caché de 5 segundos. En el Compose de imágenes
se exponen las variables
`PANGOLIN_RATE_LIMIT_TRUSTED_PROXY_HOST_0/1/2`,
**vacías por defecto**, además de la lista de IPs exactas. Nunca utilizar
`*.dhole`, una subred completa, la IP pública del visitante o nombres
controlados por clientes. Si el DNS de Docker deja de resolver, no se debe
confiar en un XFF no autenticado. Esta opción elimina el problema de fijar
IPs cambiantes, **pero no demuestra ni soluciona sola** el salto previo
Cloudflare Tunnel / Traefik.

**Pendiente antes de habilitarlo en producción:** verificar el último salto
TCP visto por backend, identificar la cadena completa hasta el borde confiable
y probar intentos de cabeceras falsas desde una ruta no confiable. Las
direcciones Docker observadas son efímeras, no se deben fijar sin un mecanismo
seguro de actualización ni confiar en una red Docker completa. Si no puede
verificarse la cadena, mantener vacíos los ajustes y conservar el límite
compartido para anónimos, con mitigación de tráfico y mensaje 429.

**Ajuste pendiente del operador de despliegue:** verificar las IP reales de los
saltos Nginx/proxy/Cloudflare en la topología activa y añadir solo los proxies
confiables necesarios. Las direcciones de contenedores pueden cambiar en cada
recreación; no copiar IPs de desarrollo como valores de producción. Sin esta
configuración, los visitantes anónimos seguirán agrupándose por la IP visible
para el backend, pero ahora **no** comparten la cuota de autenticación, y se
reducen las solicitudes repetidas. No habilitar una confianza global en XFF
ni abrir el puerto del backend a Internet.

## QA antes de fusionar o desplegar

1. Confirmar PR #201 fusionada, compilar Vue y .NET, ejecutar pruebas de frontend
   y verificar que las rutas públicas siguen siendo públicas y las escrituras
   continúan protegidas por `admin`.
2. Con DevTools, comprobar que primera carga de /itinerario realiza solo dos consultas de catálogo,
   que una recarga dentro de 5 minutos reutiliza la caché y que cambiar
   transporte no genera solicitudes duplicadas.
3. Inducir un 429 **solo en un entorno local controlado**: verificar
   `Retry-After`, mensaje accesible y reintento manual; no bombardear producción.
4. Probar dos clientes con distintas IP detrás del proxy **correctamente
   configurado**. Comprobar particiones independientes sin confiar en un XFF
   falsificado enviado desde un cliente directo.
5. Confirmar que /administracion, /cotizaciones, /tracking, OTP y uploads
   conservan permisos. Confirmar no regresiones en modo oscuro/móvil/inglés.
6. Observar métricas 429 en producción después de la aprobación y desplegar
   primero en una ventana supervisada, con plan de rollback.

No modifica PostgreSQL, MongoDB, Redis, MinIO, Cloudflare, Dhole ni la web
pública durante el desarrollo de esta PR.
