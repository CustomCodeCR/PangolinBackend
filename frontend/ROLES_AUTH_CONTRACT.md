# Contrato de autenticación y administración (frontend + .NET)

El servidor es la única autoridad para cuentas, roles y sesiones. La interfaz Vue 3 solo adapta navegación y formularios; **no concede permisos**.

## Roles

| PostgreSQL (`usuarios.tipo_acceso`) | JWT (`role`) | Vue (`AppRole`) |
|---|---|---|
| `cliente` | `client` | `cliente` |
| `usuario` | `admin` | `administrador` |
| Sin sesión | Sin token | `invitado` |

`invitado` **no es un rol asignable** en la tabla `usuarios`. No se permite registro público.

## Acceso por OTP y correo único

1. Vue envía `POST /api/auth/request-otp` con `{ "correo": "persona@empresa.com" }`.
2. .NET determina automáticamente el rol mediante una cuenta habilitada en `usuarios`; las cuentas no registradas reciben el mensaje genérico sin emitir un OTP.
3. El backend envía el OTP vía SMTP o lo deposita en LocalOutbox **solo en Development**. Mantiene límites por IP/correo y caducidad de cinco minutos.
4. Vue envía `POST /api/auth/verify-otp` con `{ "challengeId": "...", "codigo": "123456" }`.
5. El backend verifica el OTP de un solo uso, emite JWT en cookie `HttpOnly` y crea sesión revocable en PostgreSQL.
6. `GET /api/auth/me` devuelve un objeto con `correo`, `usuarioId`, `clienteId`, `role` y datos de empresa; Vue normaliza `admin/client` a `administrador/cliente`.
7. `POST /api/auth/logout` revoca la sesión y limpia la cookie.

No se exige Gmail; el usuario debe introducir el correo previamente registrado. No almacenar JWT en localStorage. El backend sigue aceptando temporalmente el formato antiguo `tipoAcceso/codigoDynamics` para integraciones existentes.

## Administración de cuentas

`GET /api/admin/users?page=1&pageSize=50` devuelve:
```json
{
  "users": [
    {
      "id": "UUID",
      "correo": "persona@empresa.com",
      "nombre": "Empresa",
      "role": "cliente",
      "activo": true,
      "createdAt": "2026-10-15T00:00:00"
    }
  ],
  "total": 1, "page": 1, "pageSize": 50, "totalPages": 1
}
```

`PATCH /api/admin/users/{id}` recibe `{ "role": "cliente|administrador", "activo": true|false }`.
Estas rutas requieren `admin` en la API. No se permite modificar el propio usuario ni dejar al sistema sin administradores activos. Los cambios se auditan en `auth_admin_user_audit` y revocan las sesiones existentes del usuario modificado.

## Contenido y cotizaciones

- `/administracion` y sus rutas anteriores requieren rol `administrador`. El CRUD de itinerarios existente conserva su política `admin`.
- Noticias y multimedia publicadas se guardan en `cms_news` y `cms_media`; se gestionan mediante `/api/admin/content/news` y `/api/admin/content/media`.
- La vista Noticias lee `GET /api/content/news` y muestra solo publicaciones habilitadas.
- Las cotizaciones se crean con `POST /api/quotes` solo como `client`, sin rutas públicas de edición. Hay cuatro modalidades: terrestre, aérea, marítima y multimodal, cada una con su tabla PostgreSQL independiente.
- El modo desarrollo `?previewRole=administrador` solo permite previsualización visual. Nunca obtiene permisos del backend ni modifica datos de cuentas reales.

## Pruebas

Consulta [guía de integración](../docs/INTEGRACION-LOGIN-ADMIN-2026.md). Se requiere compilación .NET/Vue y smoke con PostgreSQL de pruebas antes de hacer merge.
