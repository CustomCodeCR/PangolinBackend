# Castro Fallas · desarrollo colaborativo (Vue + .NET + PostgreSQL)

Proyecto con login **Cliente / Usuario / Invitado**, OTP por correo, cotizador, globo 3D y diseño web. Se puede utilizar **sin instalar PostgreSQL, .NET ni Node.js** en el equipo anfitrión: Docker Compose crea los 3 servicios. Código adaptable para subir a un **repositorio GitHub privado**.

> Esta configuración es solo para **desarrollo local**. Los puertos se publican exclusivamente en `127.0.0.1`, la cookie HTTP no lleva `Secure` y la API arranca con `Development`. **No publicar este Compose a Internet ni usarlo en producción** sin preparar HTTPS, migraciones gestionadas, secretos y controles de seguridad específicos.

## 1. Antes de empezar

- Instalar [Docker Desktop](https://docs.docker.com/desktop/) (Windows/macOS) o Docker Engine + Compose plugin (Linux).
- Iniciar Docker Desktop. No hacen falta Node.js, .NET ni un PostgreSQL local para ejecutar esta versión.
- Descargar y descomprimir el proyecto **o clonarlo desde GitHub**.
- Abrir PowerShell o una terminal dentro de la carpeta que contiene `compose.yaml` (esta carpeta).

Si aún tenés corriendo la versión antigua en dos terminales (`npm run dev` y `dotnet run`), detenela con `Ctrl+C` **antes de usar los mismos puertos**. Docker usará por defecto `5173`, `5000` y `5433` (PostgreSQL usa `5432` dentro de Docker).

## 2. Windows PowerShell — primer arranque

```powershell
.\scripts\setup-docker.ps1
# Si PowerShell bloquea scripts, utilizar esta alternativa sin modificar políticas:
# powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-docker.ps1

docker compose config
# Configura tres servicios y guarda los datos de PostgreSQL en un volumen.
docker compose up -d --build
docker compose ps
```

**No compartás la salida de `docker compose config`**: puede mostrar valores privados de `.env`.

Para Mac/Linux:

```bash
bash scripts/setup-docker.sh
docker compose up -d --build
docker compose ps
```

El script crea `.env` con dos secretos aleatorios. No se sobrescribe un `.env` existente. `.env` y los correos OTP locales **no se suben a Git**.

| Qué es | Dirección en tu PC |
|---|---|
| Web Vue | http://127.0.0.1:5173 |
| API .NET / diagnóstico | http://127.0.0.1:5000/api/health/ready |
| PostgreSQL para DBeaver | host `127.0.0.1`, puerto `5433`, base `login`, usuario `postgres`, contraseña `POSTGRES_PASSWORD` de `.env` |

**Dentro de Docker**, el backend accede a `Host=postgres;Port=5432`, **no** a `localhost`. Vite envía `/api` a `http://backend:5000` por la red de Compose. Si aparece `"postgres":"ok"` y `"status":"ready"` en el diagnóstico, el backend ya habla con la base.

## 3. Preparar cuentas de demostración

La API aplica `backend/Database/AuthSchema.sql` cuando inicia en `Development`: crea/adapta las tablas `clientes`, `usuarios`, `otp_challenges`, `otp_rate_limits`, `auth_sessions`, `quote_requests` sin borrar registros preexistentes. No crea usuarios demo automáticamente.

Para agregar una empresa y dos cuentas ficticias:

```powershell
docker compose exec postgres psql -U postgres -d login -f /tmp/SeedLocal.sql
```

- **Usuario**: `demo.usuario@castrofallas.test`.
- **Cliente**: `demo.cliente@castrofallas.test`, Dynamics `DYN001`.
- **Invitado**: entra sin OTP, sin permisos para registrar cotizaciones.

El modo predeterminado `EMAIL_MODE=LocalOutbox` crea archivos `.eml` dentro de `backend/local-outbox/` **en tu propia computadora**. Abrí el correo más reciente, copiá el código y verificá el ingreso. **No hay envío real** a correos externos en ese modo. El archivo contiene un OTP temporal y no debe subirse a GitHub.

Para habilitar correo real, editá **solo tu `.env` privado** y cambiá:

```dotenv
EMAIL_MODE=Smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_TLS=StartTls
SMTP_FROM=cuenta-que-envia@gmail.com
SMTP_USERNAME=cuenta-que-envia@gmail.com
SMTP_PASSWORD=CONTRASENA_DE_APLICACION
```

La contraseña de aplicación debe ser de esa misma cuenta con 2FA y autorización SMTP. **No es la contraseña normal de Gmail.** Al cambiar el `.env`:

```powershell
docker compose up -d --force-recreate --no-deps backend
```

> `.env` viaja al contenedor como variables de entorno. Los antiguos `dotnet user-secrets` de Windows **no se copian automáticamente a Docker** y ya no se necesitan aquí. El backend no lee el `appsettings.Development.json` del PC por encima de estas variables: las variables del contenedor tienen prioridad.

## 4. Trabajar todos los días

```powershell
# Encender los servicios
 docker compose up -d

# Ver errores de la API / OTP
 docker compose logs -f backend

# Ver logs de Vue
 docker compose logs -f frontend

# Actualizar imágenes de desarrollo tras cambios de Dockerfile/dependencias
 docker compose up -d --build

# Detener servicios sin borrar la base
 docker compose down
```

Los archivos de `frontend/` y `backend/` están montados como volúmenes de trabajo: **al guardar código en VS Code, Vite actualiza la web y `dotnet watch` recompila la API**. Para cambios de código normalmente no hay que reconstruir.

Si agregás paquetes npm, corré dentro del frontend para actualizar `package.json` y `package-lock.json`:

```powershell
docker compose exec frontend npm install nombre-del-paquete
```

Cuando un compañero descargue cambios de dependencias, puede reconstruir el frontend sin tocar PostgreSQL:

```powershell
docker compose up -d --build --force-recreate --renew-anon-volumes --no-deps frontend
```

**Nunca usar `docker compose down -v`** si querés conservar datos; `-v` elimina el volumen nombrado de PostgreSQL. No borres manualmente contenedores, imágenes ni volúmenes para actualizar archivos.

## 5. GitHub para todo el equipo

Este paquete incluye `.gitignore`, `.env.example` (sin secretos), `.github/workflows/ci.yml` (comprueba compilaciones en PR), `compose.yaml`, Dockerfiles y documentación. Usar un repositorio **privado** por el código y el contexto empresarial.

**Crear un repositorio nuevo** desde la carpeta del proyecto, una sola vez (crear antes el repositorio vacío en GitHub):

```powershell
git init
git branch -M main
git add .
git status --short
git commit -m "Proyecto base Docker y OTP"
git remote add origin https://github.com/ORGANIZACION/REPOSITORIO.git
git push -u origin main
```

Comprobar que en `git status --short` **NO aparezca `.env`, archivos `.eml`, credenciales, volcados `.dump` ni `node_modules`**. Si se publicaron secretos antes, revocarlos/cambiarlos: agregarlos después a `.gitignore` no elimina copias que ya existan en el historial.

**Cualquier colaborador autorizado** ejecuta:

```powershell
git clone https://github.com/ORGANIZACION/REPOSITORIO.git
cd REPOSITORIO
.\scripts\setup-docker.ps1
docker compose up -d --build
```

Para intercambiar cambios: crear una rama, `git add`, `git commit`, `git push` y abrir **Pull Request**. Revisar y aprobar antes de fusionar a `main`; `git pull` en cada PC actualiza el código, **no los datos PostgreSQL**. Cada participante tiene su propia base y sus propias credenciales.

## 6. Si necesitás migrar tu base PostgreSQL LOCAL existente

**Esto es opcional**: si querés conservar los usuarios y cotizaciones ya registrados en el servidor local `localhost:5432`, primero hacé un backup. No confundas ambas bases: después de instalar Docker, en DBeaver el contenedor se ve en **puerto 5433**, mientras que tu PostgreSQL anterior continúa en **5432**.

1. **Antes de arrancar el backend Docker**, asegurate de que el Docker PostgreSQL tenga un volumen nuevo/vacío. Si ya cargaste datos importantes en Docker, **no importes sobre ellos**: respaldá y planificá una reconciliación.
2. Desde PowerShell, con `pg_dump` del PostgreSQL local instalado y disponible, en la raíz del proyecto:

```powershell
New-Item -ItemType Directory -Force .backup
pg_dump -h 127.0.0.1 -p 5432 -U postgres -d login -F c -f .backup\login-local.dump
```

3. Iniciá **solo PostgreSQL de Docker**:

```powershell
docker compose up -d postgres
$pgContainer = docker compose ps -q postgres
docker cp .backup\login-local.dump "${pgContainer}:/tmp/login-local.dump"
docker compose exec postgres pg_restore -U postgres -d login --no-owner --no-acl /tmp/login-local.dump
```

4. Solo si `pg_restore` terminó sin errores, iniciá API y frontend:

```powershell
docker compose up -d --build
```

5. Abrí DBeaver en `127.0.0.1:5433`, base `login`, y verificá las tablas/registros. **No elimines tu base local anterior** hasta validar los datos y guardar respaldos. Si el dump procede de una versión anterior, `AuthSchema.sql` se aplica al arrancar la API en modo desarrollo. `pg_dump` y `pg_restore` deben ser compatibles con las versiones de PostgreSQL origen/destino.

Si no tenés `pg_dump` en PATH, en Windows suele estar en `C:\Program Files\PostgreSQL\VERSION\bin\pg_dump.exe` o puede exportarse desde la opción Backup de DBeaver cuando las herramientas cliente estén configuradas. Un dump contiene datos personales: **no subirlo al repo**.

## 7. Notas de seguridad y producción

- Puertos mapeados **solo a 127.0.0.1**; este Compose es para desarrollo de cada integrante. No abrir ni reenviar esos puertos por Internet.
- OTP de prueba `LocalOutbox` solo funciona en `Development`. Para un despliegue real usar correo autenticado, TLS y un remitente verificado.
- PostgreSQL persiste en volumen `postgres_data`. No sincronizar ni compartir el volumen entre miembros del equipo.
- En producción usar HTTPS, cookie `Secure=true`, secretos externos, backups y migraciones aplicadas de forma controlada. Evitar que `Development:ApplySchema` corra automáticamente allí.
- El sistema distingue `cliente` y `usuario` con `tipo_acceso` y usa sesión de servidor. Para roles adicionales o panel administrativo hay que implementar autorizaciones también en .NET, no solo ocultar enlaces en Vue.
- Si conviven la app antigua local y la de Docker usando el mismo dominio `127.0.0.1`, sus cookies `cf_session` pueden interferir. Usá una sola o limpiá las cookies locales.

El proyecto original sin Docker todavía puede ejecutarse con los procedimientos de `GUIA-LOCAL-LOGIN.md`, pero para el equipo se recomienda Docker Compose como flujo principal.
#   P a n g o l i n B a c k e n d  
 