# Pangolin en AlmaLinux: SOLO imagenes Docker mediante GitHub Actions

## Regla operacional (obligatoria)
- Nunca instalar el repositorio ni usar `git clone`, `dotnet publish`, `npm build` o `docker build` en AlmaLinux.
- El trabajo `publish` corre en `ubuntu-latest` (runner administrado por GitHub), compila Docker y publica dos imagenes versionadas en GHCR.
- El trabajo `deploy` corre en el runner `[self-hosted,linux,x64,dhole]`, NO hace checkout, solo descarga un archivo de CONFIGURACION Compose, hace `docker pull`, `docker compose up -d --no-build` y pruebas de salud.
- Nunca copiar secretos reales a GitHub ni imprimirlos en los logs.
- NO ejecutar `docker compose down -v`; no reutilizar volumenes PostgreSQL de Dhole.

## Confirmado del servidor el 21/10/2026
- AlmaLinux, Docker root `/home/docker-data`; / con 57 GB libres, /home con 1.4 TB libres.
- Red Docker: `dhole`; prefijo Traefik: `prod`.
- Fennec actual: `website` en `/opt/dhole/docker-compose.services.yml`.
- Host principal: `logisticacastrofallas.com`; www: `www.logisticacastrofallas.com`.

## 1. Configuracion MINIMA en servidor (no contiene codigo de aplicacion)
Crear `/opt/dhole/pangolin.env` usando la lista de variables de `deploy/pangolin.env.example`.
La plantilla esta en GitHub para consultar desde otra computadora; NO descargar el repositorio en el servidor.

```bash
sudo install -m 600 -o root -g root /dev/null /opt/dhole/pangolin.env
sudoedit /opt/dhole/pangolin.env
```

El usuario del runner self-hosted debe poder LEER este archivo sin exponer las credenciales; asignar un grupo restringido si el runner no corre como root y otorgar 0640, no 0644. No ejecutar el trabajo deploy hasta que el archivo exista y sea legible por el runner.

Variables imprescindibles: `PANGOLIN_POSTGRES_PASSWORD`, `AUTH_OTP_PEPPER`, `AUTH_JWT_SIGNING_KEY`, `PUBLIC_ORIGIN=https://logisticacastrofallas.com`, `PANGOLIN_LOCAL_PORT=8180`, `PANGOLIN_TRAEFIK_ENABLED=false`, y configuracion `EMAIL_MODE=Graph` (o SMTP) con credenciales reales.

Crear dos valores DISTINTOS con 64 hexadecimales (`openssl rand -hex 32`) para OTP y JWT. Usar una nueva clave para la base de datos de Pangolin. No reutilizar `POSTGRES_PASSWORD` ni las llaves JWT de Dhole.

El scope de Microsoft Graph Mail.Send debe incluir el buzon indicado en `GRAPH_FROM`; si la app de correo de Dhole tiene alcance exclusivamente sobre otro buzon, aprovisionar el permiso correcto, no ampliar accesos sin aprobacion.

## 2. Ejecutar GitHub Actions (todavia sin cambiar el dominio)
Abrir `PangolinBackend → Actions → Pangolin - Build GHCR and Deploy Images → Run workflow`, rama `main`.

Seleccionar:
- `deploy=true`: publicar y desplegar ambas imagenes.
- `image_tag` vacio: utilizar las imagenes versionadas del commit en curso.

**La base de datos y el esquema se crean automaticamente en el primer despliegue** cuando el volumen dedicado esta vacio. No hay que marcar una opcion de inicializacion ni cargar scripts en el servidor. En los siguientes despliegues se conserva el volumen, se verifica la presencia del esquema y no se borra informacion.

La automatizacion publica:
- `ghcr.io/customcodecr/pangolinbackend/frontend:sha-<12digitos>`
- `ghcr.io/customcodecr/pangolinbackend/backend:sha-<12digitos>`

Publica tambien `:latest` para cada imagen. En produccion despliega el tag de commit, nunca necesita compilar en AlmaLinux. GitHub Container Registry puede crear paquetes inicialmente privados; el flujo usa `GITHUB_TOKEN` (`packages: write/read`), y los paquetes deben permitir el acceso de este repositorio.

El `deploy` descarga solo `docker-compose.images.yml` como artefacto en el directorio TEMPORAL del runner; ese archivo es infraestructura, no codigo fuente. No hay copias de `backend/` ni `frontend/` en el servidor realizadas por este workflow.

El Compose crea un PostgreSQL 16 exclusivo para Pangolin, con base `login`, usuario `pangolin` y volumen persistente `pangolin-production_postgres_data`. No usa la base de datos de Dhole. En el primer arranque y SOLO si no hay tablas en `public`, el workflow lee `AuthSchema.sql` y `OfficialQuotesSchema.sql` del contenedor del backend y los ejecuta en una sola transaccion. Si las tablas ya existen, no aplica SQL: comprueba las entidades principales y falla sin destruir datos cuando detecta un esquema incompleto. No ejecuta semillas de Development. Los cambios futuros de SQL sobre bases pobladas requieren migraciones revisadas y respaldos.

## 3. Validacion antes del cambio
Con `PANGOLIN_TRAEFIK_ENABLED=false`, Fennec debe permanecer en produccion.

```bash
ss -lnt | grep ':8180 ' || true
curl -i http://127.0.0.1:8180/api/health/ready
curl -I http://127.0.0.1:8180/home/
docker ps --filter label=com.docker.compose.project=pangolin-production
```

Si 8180 ya esta ocupado ANTES del primer despliegue, elegir otro `PANGOLIN_LOCAL_PORT` libre.

El backend debe confirmar `ready`; si devuelve 503 revisar migraciones, PostgreSQL y logs. Probar despues por el dominio real: login OTP con correo real, permisos admin, noticias, comentarios, itinerarios, cotizaciones V2, SignalR, cookies Secure, archivos multimedia (si S3 esta configurado), HTTPS, modo oscuro y movil.

NOTA: la prueba `localhost` valida disponibilidad, NO verifica la cookie segura HTTPS ni la integracion publica de Cloudflare.

## 4. Cutover Fennec -> Pangolin
Solo despues de pruebas satisfactorias y copia de respaldo:
1. Respaldar `/opt/dhole/docker-compose.services.yml`.
2. Modificar la version FUENTE de DholeSystem para retirar `website` de los despliegues normales (por ejemplo usando `profiles: [fennec-legacy]`). No confiar solo en detener el contenedor, pues un deploy posterior podria reactivarlo. Coordinar tambien el workflow de `FennecWeb` que despliega `website` automaticamente.
3. Detener UNICAMENTE Fennec (`website`) mediante Compose de Dhole, nunca detener el proyecto completo.
4. Cambiar `PANGOLIN_TRAEFIK_ENABLED=true` en `/opt/dhole/pangolin.env`.
5. Volver a ejecutar el mismo workflow con `deploy=true`. Traefik debera servir `logisticacastrofallas.com` y redirigir www hacia el origen canonico.
6. Confirmar salud, sesion, envios Graph y CDN/Cloudflare.

**No activar ambos routers Fennec y Pangolin para el mismo Host simultaneamente**: produce enrutamiento ambiguo.

## 5. Despliegues futuros y rollback
- Cada push a `main` en rutas `backend/**`, `frontend/**` o `deploy/**` publica nuevas imagenes y **tambien ejecuta el trabajo de despliegue** (si la configuracion privada del runner existe y es valida). Mantener `PANGOLIN_TRAEFIK_ENABLED=false` mientras Fennec este activo; el deploy inicial solo quedara accesible en localhost.
- Se puede ejecutar el workflow manualmente con `deploy=true` para repetir o verificar la instalacion.
- No habilitar Pangolin en Traefik hasta detener el router Fennec y desactivar su workflow de redeploy.
- Para volver a una version anterior de la aplicacion, ejecutar `workflow_dispatch` con `deploy=true` e `image_tag=sha-<12digitos-del-commit-anterior>`. Las migraciones de datos no se revierten automaticamente.
- Para emergencia: deshabilitar router Pangolin, restaurar `website` y su router de Fennec y repetir pruebas. No borrar volumenes.

## Limites existentes del proyecto
El repositorio principal ya tenia `compose.production.yaml`, que utiliza `build:` para una instalacion independiente. **NO USAR ESE ARCHIVO EN ALMALINUX**; usar exclusivamente `deploy/docker-compose.images.yml` gestionado por el workflow. La CI de pruebas puede compilar en runners GitHub. Los servicios multimedia requieren S3 y las cotizaciones oficiales siguen desactivadas hasta validar catalogos. El despliegue no presupone que la instalacion ya esta funcionando en el servidor.
