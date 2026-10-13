# Actualizar `main` de GitHub y conectar Docker a PostgreSQL automáticamente

**Repositorio destino:** `https://github.com/CustomCodeCR/PangolinBackend`, rama `main`.
**Tipo de entorno:** desarrollo LOCAL en Docker Desktop / Windows. No publicar los puertos directamente en Internet.

## 1. Antes de actualizar

- Abrir Docker Desktop, comprobar que el motor está encendido y que Git está instalado.
- Extraer este ZIP en una carpeta nueva (por ejemplo `C:\proyectos\CastroFallas`).
- Si ya hay base de datos, **no borrar volúmenes**: conservar la instalación de Docker Desktop. El Compose mantiene `name: castrofallas`, por lo que reutiliza `castrofallas_postgres_data` si ya existe.
- Si tenías un `.env` funcionando (contraseña PostgreSQL, SMTP), **copiarlo de la instalación anterior** a la raíz de la nueva carpeta. No crear otro con otra contraseña sobre la misma base antigua.
- Hacer un respaldo antes de cambiar SQL o sustituir una instalación existente.

## 2. Iniciar Docker y comprobar la conexión

Desde PowerShell **dentro de la carpeta que contiene `compose.yaml`**:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\scripts\iniciar-docker.ps1
```

El script crea el `.env` **solo si no existe**, compila los servicios y comprueba de verdad `GET /api/health/ready` para confirmar que se puede leer PostgreSQL. No guarda secretos en GitHub.

- Web: http://127.0.0.1:5173
- API: http://127.0.0.1:5000/api/health/ready (debe devolver `"status":"ready"` y `"postgres":"ok"`)
- PostgreSQL en DBeaver: `127.0.0.1:5433`, base `login`, usuario `postgres`, contraseña del `.env` original/generado.

### Arranque automático cada vez que enciendas el equipo

`compose.yaml` usa `restart: unless-stopped` en **los cinco servicios**. Con **Docker Desktop → Settings → General → Start Docker Desktop when you sign in** activado, Docker los puede reiniciar automáticamente al iniciar sesión en Windows. No hace falta ejecutar de nuevo el script diariamente; solo para construir/aplicar cambios nuevos o resolver problemas. Si detuviste manualmente los contenedores, ejecutá `docker compose up -d`.

Dentro de Docker el backend se conecta a `postgres:5432`, **no** a `localhost:5433`. La API comprueba/aplica el esquema de desarrollo en arranque y vuelve a intentar una conexión temporalmente indisponible. Los datos persisten en volúmenes con nombre.

## 3. Publicar esta entrega en GitHub `main`

Desde la misma carpeta y con sesión de GitHub iniciada en Git Credential Manager:

```powershell
.\scripts\publicar-main.ps1
```

El script clona primero la versión actual de `main`, superpone los archivos de esta entrega y hace `commit` + `push` normal, **sin `--force`**. Respeta archivos que solo existan en el remoto, pero **reemplaza los archivos con el mismo nombre** por los de este ZIP. No incluye `.env`, claves ni compilados. Requiere permisos de escritura en `CustomCodeCR/PangolinBackend` y tener configurado `git config user.name` / `git config user.email`.

Si GitHub tiene protección de rama o hubo otro push, el push puede ser rechazado; seguir el flujo de revisión/PR del repositorio. No forzar la rama para saltarse la protección.

## 4. Comandos útiles

```powershell
docker compose ps
docker compose logs --tail=100 postgres backend
docker compose up -d --build
docker compose restart backend
curl.exe http://127.0.0.1:5000/api/health/ready
```

**Nunca ejecutar `docker compose down -v`** al actualizar: eliminaría datos guardados. Si necesitás detener los servicios sin borrar los volúmenes, usar `docker compose down` (sin `-v`), o `docker compose stop`.

### Si no conecta a la base de datos

1. Ejecutar `docker compose ps` y confirmar que `postgres` esté `healthy`.
2. Si Postgres aparece `unhealthy` y el volumen existía, comparar la contraseña de `.env` con la que realmente estaba configurada cuando se creó la base. Cambiar `.env` no cambia la contraseña interna ya guardada.
3. Revisar `docker compose logs --tail=100 postgres backend`; no compartir contraseñas, tokens ni códigos OTP.
4. Confirmar que no haya conflicto con los puertos 5000, 5173 y 5433. Cambiarlos en `.env` si hiciera falta.

**Importante:** `EMAIL_MODE=LocalOutbox` sirve para desarrollo sin enviar códigos reales; para OTP por correo configurar SMTP en `.env` con credenciales privadas. La pantalla de itinerarios todavía no tiene API de persistencia: la creación de la tabla no significa que la interfaz guarde itinerarios.
