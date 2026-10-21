# Primer despliegue en servidor: guía de comprobación

> Estado: candidato de despliegue, **NO validado todavía en un servidor real**.
> No ejecutar este procedimiento sobre bases existentes sin respaldo y revisión del responsable.
> `compose.yaml` es para desarrollo. **Usar `compose.production.yaml` en el servidor.**

## 0. Lo que debe confirmar el encargado

- Permiso SSH a la máquina, sistema operativo y versión, cuenta con acceso autorizado a Docker.
- DNS de `logisticacastrofallas.com` y control de certificados HTTPS.
- Espacio de disco para imágenes y volúmenes, RAM/CPU y política de copias de seguridad.
- Firewall externo e interno: **solo** el proxy HTTPS debe quedar público (normalmente TCP 80/443).
- Proveedor de correo SMTP o Graph real y cuentas empresariales registradas.
- Catálogo de cotizaciones oficiales aprobado. Está incompleto; se mantiene desactivado en esta primera entrega.
- No se han auditado certificados, proveedor SMTP, DNS, reglas del servidor ni compatibilidad del kernel con MongoDB.

## 1. Verificar acceso SSH y si Docker puede crear redes (solo lectura)

Desde un equipo autorizado, solicitar la dirección al administrador; **no hay IP confirmada en este repositorio**:

```bash
ssh usuario@servidor
id
uname -a
docker --version
docker compose version
docker info --format '{{.ServerVersion}}'
docker network ls
docker network inspect bridge
ss -ltn
df -h
free -h
```

Si aparece `permission denied`, el administrador debe autorizar acceso al socket Docker.
**No agregar usuarios al grupo docker por cuenta propia**: equivale en la práctica a acceso privilegiado.
Para comprobar creación y borrado de una red *solo tras autorización en el servidor*:

```bash
docker network create cf-preflight-temporal
docker network inspect cf-preflight-temporal
docker network rm cf-preflight-temporal
```

Estas tres instrucciones no deben utilizar nombres de redes existentes.
El stack de producción crea su propia red privada `castrofallas-production_default`
al ejecutar Compose. Ningún puerto de PostgreSQL, Redis o MongoDB se publica al host.

## 2. Preparar una copia del repositorio y secretos

Para revisar esta propuesta antes de integrar:
```bash
git clone https://github.com/CustomCodeCR/PangolinBackend.git
cd PangolinBackend
git switch chore/first-deploy-hardening-20261021
```
**Tras aprobación y fusión**, el encargado debe usar `main`, con un `git pull --ff-only origin main`.

Crear un archivo **solo en el servidor**, fuera de Git:
```bash
cp .env.production.example .env.production
chmod 600 .env.production
openssl rand -hex 32   # Generar un valor nuevo para AUTH_OTP_PEPPER
openssl rand -hex 32   # Generar otro para AUTH_JWT_SIGNING_KEY
openssl rand -hex 24   # Generar otro para POSTGRES_PASSWORD
```
Reemplazar los tres campos, fijar `PUBLIC_ORIGIN=https://logisticacastrofallas.com`
(o el dominio HTTPS definitivo) y configurar `EMAIL_MODE=Smtp` o `Graph` con credenciales válidas.
Cada comando de OpenSSL muestra un secreto: evitar historiales, capturas y registros de terminal;
usar el gestor de secretos del servidor cuando exista.
**Nunca** reutilizar `.env` de desarrollo; `EMAIL_MODE=LocalOutbox` está prohibido en producción.

```bash
python3 scripts/preflight-production.py .env.production
docker compose --env-file .env.production -f compose.production.yaml config --quiet
```
Si falta un valor, resolverlo antes de iniciar. El chequeo no conecta a servicios externos.

## 3. PostgreSQL: aplicar esquema inicial explícitamente

**Servidor nuevo y volumen vacío únicamente.** El modo `Production` NO crea tablas automáticamente:

```bash
docker compose --env-file .env.production -f compose.production.yaml up -d postgres redis
docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U postgres -d login < backend/Database/AuthSchema.sql
docker compose --env-file .env.production -f compose.production.yaml exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U postgres -d login < backend/Database/OfficialQuotesSchema.sql
```
No ejecutar `SeedLocal.sql` ni los scripts `OfficialQuotes*Locations.sql` de Development
en producción. El catálogo definitivo debe importarse y aprobarse por separado.
Si existen datos, hacer primero copia con `pg_dump` (en ubicación restringida), planificar
migración y validar compatibilidad de tablas antes de ejecutar SQL.

## 4. Crear contenedores de aplicación y comprobar la red interna

```bash
docker compose --env-file .env.production -f compose.production.yaml up -d --build backend frontend
docker compose --env-file .env.production -f compose.production.yaml ps
docker network inspect castrofallas-production_default
curl -i http://127.0.0.1:8080/api/health/ready
curl -I http://127.0.0.1:8080/home/
```

La respuesta `/api/health/ready` debe indicar `ready`; un fallo de esquema
o conexión a PostgreSQL impide continuar.
El frontend Nginx envía `/api/` y SignalR al servicio `backend:5000`.
Redis se comprueba con el healthcheck del contenedor.
MongoDB es una auditoría opcional: `--profile audit` y
`MONGO_CONNECTION_STRING=mongodb://mongo:27017` solo tras verificar CPU/kernel.
Archivos en almacenamiento S3/MinIO requieren proveedor y credenciales válidas por separado.

## 5. Exposición pública y HTTPS

El frontend se publica **solo en 127.0.0.1:8080**, para un proxy HTTPS en el host.
Un ejemplo mínimo de Caddy, **solo si el servidor usa Caddy y DNS apunta correctamente**:

```caddyfile
logisticacastrofallas.com {
    reverse_proxy 127.0.0.1:8080
}
```

El responsable debe instalar y configurar el proxy, certificados, renovación, firewall
y DNS. No abrir `5000`, `5432`, `6379` ni `27017` a Internet.
Validar HTTPS, WebSockets (`/api/hubs/updates`), cookies `Secure`, prueba de login
OTP por correo real y escritura/lectura aislada de cotizaciones y CMS.
`Security__PublicOrigin` valida el origen exacto HTTPS al pasar por el proxy
sin confiar en cabeceras `X-Forwarded-*` provenientes del navegador.

## 6. Aceptación, recuperación y límites

- Probar login cliente/admin, restauración de sesión y salida, comentarios y noticias,
  itinerarios, cotizaciones V2, traducciones, subida multimedia (si hay S3), SignalR y
  acceso móvil antes de abrir a público. No dar por corregido el menú móvil sin prueba visual.
- Revisar logs sin compartir OTP, variables ni secretos:
  `docker compose --env-file .env.production -f compose.production.yaml logs --tail=100 backend frontend`.
- Activar respaldo externo periódico, probar restauración, limitar acceso SSH y preparar
  reversión de imagen/commit antes de actualizar.
- **No** ejecutar `docker compose down -v` ni borrar `postgres_data`. Hacer copia antes de cualquier migración.
- CI y compilaciones son condiciones necesarias, pero **no equivalen a una prueba en el servidor**.

### Reversión de aplicación

Si el nuevo código falla, volver a un commit anterior revisado y reconstruir
solo `frontend` y `backend`, conservando los volúmenes. La base de datos
requiere una estrategia de migración compatible y respaldos, no un rollback ciego.

### Fuera de alcance de esta preparación

Cambios visuales para bloquear zonas, cambios de permisos de páginas, finalización de
catálogos reales y aprobación de producción por el encargado. `main` no se modifica
hasta la revisión y fusión autorizadas.
