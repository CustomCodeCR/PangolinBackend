# Guía técnica — autenticación Castro Fallas local

## 1. Mapa del sistema

```text
Navegador: http://127.0.0.1:5173
    │   POST /api/auth/request-otp, /api/auth/verify-otp
    ▼
Vite dev server (proxy /api/*)
    │   http://127.0.0.1:5000
    ▼
Backend .NET 10 (solo localhost)
    ├── PostgreSQL 127.0.0.1:5432 — DB login
    │     clientes, usuarios, otp_challenges,
    │     otp_rate_limits, auth_sessions, quote_requests
    │
    └── Email:Mode=LocalOutbox → backend/local-outbox/*.eml
            (simulación local; NO entrega a Gmail)
```

**No se utiliza Docker, Redis ni MongoDB en esta variante.** DBeaver se conecta **al mismo PostgreSQL** que el backend. Las credenciales no se almacenan en Vue. `appsettings.Development.json` contiene valores no secretos, mientras que `dotnet user-secrets` conserva la conexión con contraseña y el secreto HMAC. En producción, usá un gestor de secretos y HTTPS.

## 2. Qué se mantiene de tu SQL

La tabla `clientes` conserva: `uuid` UUID, `nombre` VARCHAR(500), `codigo_dynamics` TEXT UNIQUE, `created_at`, `updated_at`, `deleted_at`, `last_login_at` TIMESTAMP y `status` BOOLEAN.

La tabla `usuarios` conserva: `uuid`, `correo` VARCHAR(255) UNIQUE, `created_at`, `updated_at`, `deleted_at`, `status`, `cliente_id` UUID FK a clientes. Además se agregan **dos campos** si no existen: `last_login_at` TIMESTAMP y `tipo_acceso` VARCHAR(20), que puede ser `'usuario'` o `'cliente'`. El invitado no se almacena como usuario.

El SQL `backend/Database/AuthSchema.sql` usa `CREATE TABLE IF NOT EXISTS` y `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`; mantiene los datos existentes. No ejecuta `DROP TABLE`. **Hacé una copia de seguridad antes de migraciones**, especialmente si ya hay cotizaciones.

Tablas técnicas:

| Tabla | Qué guarda | Privacidad/validez |
|---|---|---|
| `otp_challenges` | UUID, usuario, rol, HMAC del código, intentos, emisión, expiración, uso | Código jamás guardado en claro; 5 min, 5 intentos, uso único |
| `otp_rate_limits` | SHA-256 del correo normalizado, ventana y contador de solicitudes | 3 por 15 min y espera de 60 s entre solicitudes |
| `auth_sessions` | Hash SHA-256 del token, usuario, rol, expiración y revocación | Token solo en cookie HttpOnly; 8 horas |
| `quote_requests` | Datos del cotizador, identificadores del usuario y empresa | Solo se puede consultar cotización de la misma empresa |

`created_at`, `updated_at` y `last_login_at` originales continúan siendo `TIMESTAMP WITHOUT TIME ZONE`. Para OTP y sesiones se utiliza `TIMESTAMPTZ` (instantes UTC). Un trigger mantiene `updated_at` al editar registros en DBeaver.

## 3. Conectar desde DBeaver, paso a paso

1. Abrí DBeaver → New Database Connection → **PostgreSQL**.
2. Si PostgreSQL está instalado localmente: **Host `127.0.0.1`, Port `5432`, Database `login`, Username `postgres`, Password la de tu PostgreSQL**. Si ya tenés una conexión configurada, usá esos mismos valores en el script de configuración.
3. Si no existe la base `login`, conectate a la DB administrativa `postgres` y ejecutá `CREATE DATABASE "login";`. Abrí después el editor apuntando a la nueva DB. En DBeaver **no uses** `\c login` (ese comando pertenece a psql).
4. Al arrancar la API en `Development`, `Development:ApplySchema=true` aplica el SQL idempotente. En DBeaver actualizá **Schemas → public → Tables**.
5. Ejecutá manualmente `backend/Database/SeedLocal.sql` para crear una empresa `DYN001` y las cuentas de demostración. No hay registro público de usuarios.

Consultas útiles (en la DB `login`):

```sql
SELECT current_database(), current_user;
SELECT uuid, nombre, codigo_dynamics, status FROM clientes;
SELECT u.correo, u.tipo_acceso, u.status, c.nombre, c.codigo_dynamics
  FROM usuarios u JOIN clientes c ON c.uuid = u.cliente_id;
SELECT uuid, attempts, expires_at, used_at FROM otp_challenges ORDER BY created_at DESC LIMIT 5;
SELECT usuario_id, created_at, expires_at, revoked_at FROM auth_sessions ORDER BY created_at DESC LIMIT 5;
```

Crear manualmente otra cuenta compatible con las tablas:

```sql
INSERT INTO clientes (nombre, codigo_dynamics)
VALUES ('Empresa adicional', 'EMP002')
ON CONFLICT (codigo_dynamics) DO NOTHING;

INSERT INTO usuarios (correo, cliente_id, tipo_acceso, status)
SELECT 'otro@ejemplo.com', uuid, 'usuario', TRUE
FROM clientes WHERE codigo_dynamics='EMP002'
ON CONFLICT (correo) DO NOTHING;
```

Si no creaste `tipo_acceso` aún, iniciá la API con el script antes de ejecutar ese `INSERT`.

## 4. Flujo de autenticación paso a paso

**Solicitud:** formulario Vue envía `{ tipoAcceso, correo, codigoDynamics? }` a `/api/auth/request-otp`. .NET valida la sintaxis y limita llamadas por IP con rate limiter de ASP.NET. PostgreSQL controla el límite por hash de correo mediante un `INSERT ... ON CONFLICT DO UPDATE` atómico, para no depender de Redis.

**Identidad:** la API busca `usuarios` + `clientes` activos, no eliminados. Para rol `usuario` utiliza correo; para `cliente` requiere correo de usuario autorizado + código Dynamics coincidente. Para direcciones inexistentes, la API devuelve un mensaje genérico, sin confirmar si el correo está registrado.

**Generación y entrega:** se genera un valor aleatorio de 6 dígitos. Solo se persiste `HMAC-SHA256(pepper, challengeId + código)`, válido cinco minutos. Códigos anteriores quedan inutilizados. En modo `LocalOutbox`, un `.eml` se guarda en disco, **no se envía a la dirección real**. Con `Email:Mode=Smtp`, la API lo envía mediante MailKit y TLS a un SMTP configurado.

**Verificación:** `/api/auth/verify-otp` toma un bloqueo transaccional `SELECT ... FOR UPDATE`, comprueba fecha, estado, intentos y hash en tiempo constante. Consume el OTP una única vez. Registra sesión con token aleatorio de 32 bytes; su hash queda en PostgreSQL y el token se entrega en una cookie `HttpOnly`, `SameSite=Strict`, ocho horas. Con HTTPS en producción activá `Auth:SecureCookie=true`.

**Autorización:** `/api/auth/me` valida cookie y estado actual de usuario/cliente. `/api/quotes` exige sesión y almacena `ClienteId`, `UsuarioId`. Una consulta de cotización de otra empresa devuelve 404. **Invitado** entra al Home, pero no recibe sesión autenticada ni puede solicitar cotizaciones.

**Salida:** `/api/auth/logout` revoca la sesión en PostgreSQL y borra la cookie.

## 5. Envío de correos reales (opcional, posteriormente)

El modo de demostración está definido en `backend/appsettings.Development.json`:

```json
"Email": { "Mode": "LocalOutbox" }
```

Para enviar OTP reales, cambiá a `"Mode": "Smtp"` y elegí un servidor SMTP autorizado (con TLS). En `backend/appsettings.Development.json` podés declarar `Smtp:Host`, `Smtp:Port`, `Smtp:Tls`, `Smtp:From`. Guardá **`Smtp:Username` y `Smtp:Password` en User Secrets**, nunca en Git. Ejemplo de comandos:

```bash
dotnet user-secrets set --project backend 'Smtp:Username' 'usuario-smtp'
dotnet user-secrets set --project backend 'Smtp:Password' 'CONTRASEÑA_O_TOKEN_PRIVADO'
```

Para servicios SMTP públicos normalmente se utiliza `Port=587` y `Tls=StartTls`; los valores exactos dependen de tu proveedor. `Smtp:From` debe ser una dirección permitida por el proveedor. **No confundás el puerto SMTP con PostgreSQL (`5432`)**. `None` solo es aceptado en desarrollo para un servidor SMTP en localhost. Para un Gmail real, un buzón local no basta: hace falta un proveedor habilitado y credenciales de correo válidas.

## 6. Diagnóstico de errores

| Síntoma | Diagnóstico y solución |
|---|---|
| API no inicia | Ejecutá `./scripts/iniciar-backend.sh`; debe existir la base `login` y una conexión guardada por `configurar-local.sh` |
| HTTP 500/503 solicitud OTP | Leé error y `traceId` en DevTools y la terminal .NET; `python3 scripts/check-local.py` distingue fallos de BD/proxy |
| HTTP 429 | Límite por IP o correo: esperá 60 s o hasta 15 min, **no borres registros para evitar el límite** |
| HTTP 200 pero no aparece `.eml` | Verificá que `usuarios.tipo_acceso`, estado y `cliente_id` coincidan con lo elegido; se responde genéricamente a cuentas inexistentes |
| Error 401 al verificar | Código mal copiado, vencido, ya usado o más de cinco intentos |
| `/api/health/ready` = 503 | Falta conexión, columna o tabla; revisá el detalle en la terminal backend |
| DBeaver ve registros pero login no | Compará `Host`, `Port`, `Database`, `Username` en ambas conexiones. **DBeaver no es la base de datos; PostgreSQL sí.** |
| La API responde pero Vite no | Verificá Vite en `:5173`, API en `:5000` y el proxy en `frontend/vite.config.ts` |

El frontend y los archivos OTP solo se sirven **en localhost**; no los publiques en Internet. Antes de producción: correo real, HTTPS, cookies Secure, revisión de permisos y gestión de migraciones, configuración de proxy confiable, copias de seguridad y pruebas automatizadas reales.

## 7. Qué se comprobó y qué queda pendiente

Se revisó la estructura del proyecto, se prepararon scripts de diagnóstico y una prueba de extremo a extremo (`scripts/smoke-local.py`), pero la ejecución de esta prueba **requiere PostgreSQL, .NET 10 y la instalación npm en tu propia computadora**. El ZIP no incluye una base PostgreSQL ya levantada ni credenciales privadas.
