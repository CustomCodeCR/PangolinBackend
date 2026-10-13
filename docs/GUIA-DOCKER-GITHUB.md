# Guía técnica · de local a Docker y GitHub

## Arquitectura

```text
Navegador http://127.0.0.1:5173
  └─ Vite (frontend en contenedor)
      ├─ sirve componentes Vue, assets `/images/*` y hot reload
      └─ /api/* → http://backend:5000 (proxy, red de Compose)
                       └─ ASP.NET Core en contenedor
                            ├─ POST /api/auth/request-otp
                            ├─ POST /api/auth/verify-otp
                            ├─ GET /api/auth/me
                            ├─ POST /api/auth/logout
                            ├─ POST/GET /api/quotes
                            └─ PostgreSQL host=postgres puerto=5432
                               └─ volumen persistente postgres_data
```

En el **host Windows** la base está en `127.0.0.1:5433`. La palabra `postgres` solo resuelve entre contenedores de la misma red Docker. Las IP internas pueden cambiar, por eso se utiliza el nombre de servicio y no direcciones fijas.

## Qué archivos nuevos se agregaron

| Archivo | Función |
|---|---|
| `compose.yaml` | Levanta Postgres + API + Vue; define puertos locales, healthcheck y volúmenes |
| `.env.example` | Plantilla sin secretos, se copia como `.env` (privado) |
| `scripts/setup-docker.ps1` | Genera `.env` y dos secretos aleatorios en Windows |
| `scripts/setup-docker.sh` | Lo mismo en Linux/macOS |
| `backend/Dockerfile.dev` | SDK .NET 10, `dotnet watch` para recarga de la API |
| `frontend/Dockerfile.dev` | Node 22, `npm ci`, Vite para desarrollo |
| `frontend/vite.config.ts` | Proxy configurable según dónde está corriendo el frontend |
| `.github/workflows/ci.yml` | Compilación de frontend y backend en push/PR |
| `.gitignore`, `.dockerignore` | Evitan subir/copiar secretos y artefactos de compilación |

## Diferencias entre configuraciones locales y Docker

| Configuración | Ejecutado fuera de Docker | Ejecutado en Docker |
|---|---|---|
| Base `Host` | `127.0.0.1` | `postgres` |
| Base `Port` | `5432` | `5432` internamente, publicado como `5433` |
| Frontend API proxy | `127.0.0.1:5000` | `backend:5000` |
| Credenciales privadas | `dotnet user-secrets` en el host | `compose.yaml` lee el `.env` privado |
| OTP demo | `backend/local-outbox/*.eml` | Mismo directorio del HOST por volumen bind |
| Recarga código | `npm run dev` / `dotnet run` | Vite / `dotnet watch` dentro de contenedores |

La contraseña `POSTGRES_PASSWORD` del `.env` solo se usa al inicializar **por primera vez** un volumen nuevo de PostgreSQL. Editarla después **NO cambia la contraseña interna de una base ya inicializada**. Conservá `.env` y el volumen o realizá un cambio de contraseña en la propia base si fuese necesario.

## Diagnóstico rápido

```powershell
docker compose ps
docker compose logs --tail 60 postgres
docker compose logs --tail 60 backend
docker compose logs --tail 60 frontend
```

- `Bind for 127.0.0.1:5173 failed`: otro Vite ocupa el puerto. Paralo o cambia `FRONTEND_HOST_PORT` en `.env`.
- `Bind for 127.0.0.1:5000 failed`: dotnet local antiguo sigue encendido; parar o cambiar `BACKEND_HOST_PORT`.
- Error de login 503 y `email_unavailable`: revisar `EMAIL_MODE`, `SMTP_*` y logs API; para pruebas puede dejarse `LocalOutbox`.
- Respuesta HTTP 401 para `/api/auth/me`: sesión no iniciada, expirada o revocada.
- `FATAL: password authentication failed`: contraseña en `.env` distinta de la persistida en el volumen; no eliminar el volumen para intentar corregirla.
- Si Vite entrega 404 al `/api/...`: comprobar `VITE_API_PROXY_TARGET=http://backend:5000` y que API esté iniciada.

## Flujos de desarrollo

1. Una persona crea una rama y edita el frontend en VS Code. Los cambios se reflejan automáticamente en su Docker.
2. Si necesita esquema nuevo, modifica `backend/Database/AuthSchema.sql` y lo prueba en una **base de desarrollo**; no hace cambios destructivos sin backups.
3. Crea commit y Pull Request. GitHub Actions intenta compilar Vue y .NET y el equipo revisa.
4. Tras fusionar, cada integrante hace `git pull` para recibir los archivos de código. No se sobrescriben automáticamente las bases de los otros.
5. Para desplegar una app compartida en servidor real, preparar un stack **separado** con frontend compilado, reverse proxy HTTPS, cookies seguras, control de acceso y backups. Este Docker Compose es de desarrollo, no una receta de producción.
