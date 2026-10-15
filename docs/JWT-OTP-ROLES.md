# OTP + JWT + roles de acceso

## Contrato de autenticación

- Invitado: navegación pública sin JWT. No existe cuenta ni claim `guest`.
- `usuarios.tipo_acceso = cliente` -> claim JWT `role: client`.
- `usuarios.tipo_acceso = usuario` -> claim JWT `role: admin`.
- `admin_type` queda reservado para la siguiente etapa: actualmente no está almacenado ni se usa para autorizar.
- Los roles se deciden **solo desde PostgreSQL**, nunca desde un campo manipulable enviado por Vue.
- **Revisar cuentas existentes de tipo `usuario` antes de activar esta versión**: todas tendrán rol administrativo.

## Flujo

1. `POST /api/auth/request-otp` valida los datos y envía el código de un solo uso con vencimiento de 5 minutos.
2. `POST /api/auth/verify-otp` consume el código bajo transacción y firma un JWT HS256 de 8 horas con `sub`, `jti`, `client_id`, `role`, `iss`, `aud`, `nbf`, `exp`.
3. El servidor entrega el JWT como cookie `cf_session` (`HttpOnly`, `SameSite=Strict`, `Secure` en producción). **No devolver el JWT en JSON ni guardarlo en localStorage**.
4. `GET /api/auth/me` devuelve la identidad a Vue, incluidos `role` (`client` o `admin`) y `adminType: null`.
5. Cada endpoint protegido verifica la firma, expiración, audiencia y emisor. Además, PostgreSQL confirma que el hash del JWT corresponde a una sesión activa, no revocada y vinculada a un usuario/cliente habilitados.
6. `POST /api/auth/logout` revoca el hash en `auth_sessions` y elimina la cookie. Una recarga del navegador **no** ejecuta logout.
7. `GET/POST /api/quotes` y `GET /api/itinerarios` requieren sesión con rol `client` o `admin`. Los futuros endpoints administrativos deben exigir la política `admin`, además de controles por recurso.

## Requisitos de configuración (obligatorios)

La firma JWT usa una **clave nueva independiente del pepper del OTP**: `Auth:JwtSigningKey`, un secreto de 32 bytes generado aleatoriamente y codificado en 64 caracteres hexadecimales. No registrar ni subir este valor.

**Docker, .env ya existente:** los scripts de primera instalación no reemplazan tu `.env`. Agregar manualmente, sin cambiar las contraseñas anteriores:

```dotenv
AUTH_JWT_SIGNING_KEY=<64 caracteres hexadecimales aleatorios>
```

En Linux/macOS podés generar el valor localmente con `openssl rand -hex 32`. En Windows podés generar un secreto seguro de 32 bytes con herramientas criptográficas del sistema. No copiar el valor generado a commits, issues ni conversaciones.

**Docker, instalación nueva:** `scripts/setup-docker.ps1` o `scripts/setup-docker.sh` generan automáticamente la clave en `.env`, además de los secretos existentes. `compose.yaml` la transmite como `Auth__JwtSigningKey`.

**.NET local sin Docker:** `scripts/configurar-local.sh` genera la clave como dotnet user-secret. En instalaciones ya configuradas donde no desees sobrescribir credenciales ni rotar el pepper OTP, solo agregar `Auth:JwtSigningKey` a los user-secrets existentes.

No se requieren cambios de esquema SQL. Se reutiliza `auth_sessions`: `token_hash` ahora contiene SHA-256 del JWT firmado.

## Compatibilidad y seguridad

- Las cookies de sesión opaca anteriores dejan de autenticar después de desplegar esta versión. Se requiere un nuevo OTP.
- Cambiar `Auth:JwtSigningKey` invalida los JWT emitidos previamente.
- Un JWT firmado contiene claims **legibles**, no datos secretos; no agregar códigos OTP o información privada innecesaria.
- El frontend puede ocultar elementos por rol, pero debe ser el **backend** quien autorice todas las operaciones.
- Los roles administrativos NO se deben asignar según parámetros del frontend. La compatibilidad `usuario -> admin` se aplica en servidor.
- A futuro se puede separar token de acceso corto y refresh token rotativo. Esta versión conserva 8 horas y revocación inmediata en PostgreSQL para mantener el comportamiento actual.

## Validación

1. Configurar el secreto de firma JWT antes de iniciar la API.
2. Ejecutar `python scripts/smoke-local.py` en Development con `LocalOutbox`, base inicializada y datos de demo.
3. Verificar que `/api/auth/me` devuelve `role: admin` al entrar con un usuario tipo `usuario`, y `role: client` con `cliente`.
4. Verificar que sin cookie los endpoints protegidos responden 401.
5. Confirmar recarga de página sin cerrar sesión y logout con revocación.
6. Ejecutar `dotnet build backend/CastroFallas.MiniQuote.Api.csproj` y `cd frontend && npm ci && npm run build` en el entorno de desarrollo.

**Esta guía no constituye una verificación de compilación ni del despliegue de producción.**
