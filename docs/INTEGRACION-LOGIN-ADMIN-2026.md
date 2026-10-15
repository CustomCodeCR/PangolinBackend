# Integración del nuevo diseño con backend, PostgreSQL y Docker

Esta rama corrige la integración de la interfaz recibida el 15 de octubre de 2026 sin descartar las tablas de cotizaciones del PR #6 ni el CRUD de itinerarios del PR #5.

## 1. ¿Qué datos se conservan?

El esquema SQL original sigue definiendo `quote_requests`, `quote_contacts`, `quote_land_details`, `quote_air_details`, `quote_maritime_details`, `quote_multimodal_details` e `itinerarios`. La nueva migración solo añade `auth_admin_user_audit`, `cms_news` y `cms_media`; utiliza `CREATE TABLE IF NOT EXISTS`, sin `DROP TABLE`, `TRUNCATE` ni borrado de cotizaciones. El SQL idempotente se aplica automáticamente **solo en Development**, cuando `Development__ApplySchema=true`. En otros entornos aplicar explícitamente tras respaldo.

> Las filas reales de PostgreSQL están en el volumen local de cada persona; GitHub conserva el código, **no** una copia de los registros. Hacer backup antes de actualizar y nunca ejecutar `docker compose down -v`.

## 2. Login de correo único

`POST /api/auth/request-otp` recibe ahora:

```json
{"correo":"persona@empresa.com"}
```

El servidor busca la cuenta habilitada en `usuarios` y deduce si es `cliente` (JWT role `client`) o `usuario` (JWT role `admin`). No se crea ninguna cuenta pública ni se acepta un rol elegido por el navegador. Para mantener compatibilidad con consumidores antiguos, temporalmente se sigue aceptando `tipoAcceso` y `codigoDynamics` en el formato anterior.

`POST /api/auth/verify-otp` conserva `challengeId` y `codigo`. Los JWT se entregan en cookie `HttpOnly`, quedan vinculados a una sesión revocable y no se almacenan en `localStorage`. Se mantiene la respuesta genérica para cuentas desconocidas, el límite por correo/IP y la expiración OTP. Ya no se obliga a utilizar solo Gmail: también funcionan direcciones corporativas **previamente registradas**.

Con `EMAIL_MODE=Smtp`, el OTP se envía a la dirección registrada. Con `EMAIL_MODE=LocalOutbox` en Development, el correo se genera en `backend/local-outbox/`, para pruebas aisladas.

## 3. Gestión de usuarios (solo JWT admin)

- `GET /api/admin/users?page=1&pageSize=50` devuelve `{users,total,page,pageSize,totalPages}`.
- `PATCH /api/admin/users/{id}` recibe `{"role":"administrador"|"cliente","activo":true|false}`.
- Un invitado no es una cuenta en base de datos y no puede ser asignado como rol.
- Se prohíbe modificar la cuenta administradora propia y desactivar o degradar al último administrador activo.
- Todo cambio real revoca las sesiones del usuario afectado y queda auditado en `auth_admin_user_audit`.
- No hay endpoints de registro público ni eliminación de usuarios.

## 4. Administración de contenido persistente

- `GET /api/content/news` es público y muestra **solo** noticias publicadas.
- `GET /api/admin/content/news`, `POST /api/admin/content/news`, `PUT /api/admin/content/news/{id}` y `DELETE /api/admin/content/news/{id}` requieren JWT admin.
- `GET /api/admin/content/media`, `POST /api/admin/content/media`, `PUT /api/admin/content/media/{id}` y `DELETE /api/admin/content/media/{id}` requieren JWT admin.
- Noticias y multimedia se guardan en PostgreSQL; la pantalla de noticias las consulta para todos los navegadores.
- Imágenes de hasta ~2.5 MB se aceptan como datos inline de desarrollo o URL HTTPS/`/images/`. Para producción conviene un almacén de objetos e imágenes con límite y moderación de recursos.
- La **previsualización** por `?previewRole=administrador` no otorga permiso de API. Sus cambios siguen siendo locales.

Nota: el contenido guardado en `localStorage` en versiones anteriores **no se migra automáticamente** a PostgreSQL. Si hay noticias locales que se quieran publicar para todos, se deben volver a guardar con una sesión administradora real o planificar una importación autorizada.

## 5. Cotizaciones e itinerarios

- Las cuatro opciones lógicas continúan: `Land` con FTL/LTL, `Air`, `Maritime` con FCL/LCL y `Multimodal` con país de entrada obligatorio.
- El nuevo diseño conserva cuatro tarjetas de cotización independientes: terrestre, aéreo, marítimo y multimodal; el backend utiliza las cuatro tablas de detalle correspondientes.
- `POST /api/quotes` solo permite `client` y conserva las cuatro tablas independientes del PR #6.
- El cliente no puede editar ni borrar cotizaciones.
- Los endpoints administrativos de itinerarios se mantienen protegidos por JWT `admin`.

## 6. Probar sin perder datos

### Construcciones y comprobaciones estáticas

```powershell
git status
git fetch origin
git switch fix/integracion-login-cotizaciones-panel
git pull --ff-only origin fix/integracion-login-cotizaciones-panel
python scripts/verify-integration.py
cd frontend
npm ci
npm run build
cd ..
docker compose up -d --build --force-recreate
curl.exe -i http://127.0.0.1:5000/api/health/ready
```

### Smoke test con una base de **pruebas**

Requiere `EMAIL_MODE=LocalOutbox` (con `Smtp` el script no podrá leer el OTP), esquema automático de Development y cuentas de demostración. Si existe `Env:EMAIL_MODE` en PowerShell puede tener prioridad sobre `.env`; comprobar la configuración del contenedor con `docker compose config`. No pegar secretos en tickets ni chats.

```powershell
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d login -f /tmp/SeedLocal.sql
python scripts/smoke-local.py
```

El smoke modifica temporalmente las cuentas **demo**, comprueba escritura y lectura de noticias/multimedia, crea cotizaciones de prueba en las cuatro modalidades y prueba el CRUD de itinerarios. No ejecutar contra la base de datos de producción. Tras terminar las pruebas, restaurar `EMAIL_MODE=Smtp` y recrear backend si se requieren OTP reales.

## 7. Validación

El Pull Request incluye GitHub Actions para `dotnet build`, `npm run build`, comprobaciones estáticas y E2E Docker. **No fusionar** hasta que pasen esas verificaciones y las pruebas manuales del equipo con cuentas cliente/administrador. El asistente GIO usa una respuesta local de respaldo cuando no se configura `OPENAI_API_KEY`, por lo que esa parte no requiere la clave para que funcione la web.
