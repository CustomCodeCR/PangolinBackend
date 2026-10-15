# Contrato frontend: roles, acceso y OTP

Este documento describe lo que espera el frontend para que backend pueda conectar autenticación y permisos. Los nombres de rutas/API son la propuesta que usa el código; si backend ya tiene otra convención, se adapta el frontend cuando recibamos esa especificación.

## Roles

- `invitado`: persona sin sesión. Puede navegar el contenido público y abrir cotizaciones, pero no ver Carga internacional/seguimiento ni Itinerario y no puede registrar una cotización.
- `cliente`: sesión validada por OTP y rol asignado desde la base de datos. Puede ver el sitio completo, Carga internacional, Itinerario y cotizar.
- `administrador`: rol asignado en la base de datos. Tiene todas las vistas de cliente y un botón **Administración**, con Contenido y Usuarios.

El frontend nunca manda un rol elegido por la persona durante el login. La ruta y el menú cambian con el usuario devuelto por `/api/auth/me`. Las comprobaciones del frontend son presentación y navegación; cada endpoint protegido también debe autorizar el rol en backend.

## Sesión OTP

1. `POST /api/auth/request-otp` recibe `{ "correo": "persona@gmail.com" }`. Backend valida que sea Gmail y una cuenta habilitada, aplica límites de frecuencia y envía el código.
2. Responde `{ "challengeId": "...", "message": "..." }`. El código debe vencer y ser de un solo uso.
3. `POST /api/auth/verify-otp` recibe `{ "challengeId": "...", "codigo": "123456" }`. Al validar, crea una sesión segura y obtiene el rol desde la base de datos.
4. `GET /api/auth/me` responde `{ "id": "...", "correo": "...", "nombre": "...", "role": "cliente" }` o `role: "administrador"`. Se aceptan también las claves `rol` y `tipoAcceso`; el frontend normaliza `admin`/`administrador` y `client`/`cliente`.
5. `POST /api/auth/logout` invalida la sesión.

Preferencia de integración: cookie de sesión `HttpOnly`, `Secure` en producción y `SameSite` adecuado. No hace falta que el navegador descifre tokens para decidir permisos. Si backend entrega un JWT, el servidor debe verificar firma, expiración y permisos; leer su contenido desde frontend no lo vuelve confiable. No guardar tokens de sesión en `localStorage`.

Respuestas esperadas: `401` sin sesión, `403` sin permisos y errores JSON sin datos sensibles. Las rutas de administración y sus APIs deben exigir el rol administrador. Backend valida Gmail también; la regla HTML del formulario no es una barrera de seguridad.

## Administración de usuarios

- `GET /api/admin/users` devuelve `{ "users": [{ "id": "...", "correo": "...", "nombre": "...", "role": "cliente", "activo": true, "createdAt": "..." }] }`.
- `PATCH /api/admin/users/{id}` recibe `{ "role": "cliente|administrador|invitado", "activo": true }` y actualiza el registro solo después de autorizar administrador.
- Backend debe impedir que una cuenta modifique su propio acceso de forma que deje el sistema sin administradores y auditar cambios de rol/estado.

## Contenido e itinerarios

La pantalla `/admin/contenido` conserva su editor actual, que hoy guarda en `localStorage`. Para publicar esos cambios y compartirlos, backend debe exponer endpoints autenticados de lectura y escritura para noticias, multimedia e itinerarios. WebSocket solo notifica que algo cambió; el frontend vuelve a consultar la API para obtener los datos. Hasta que exista esa API, el editor local no sincroniza entre dispositivos.

## Prueba del frontend en desarrollo

Para revisar las vistas sin simular una sesión real, Vite permite previsualización solo en `import.meta.env.DEV` mediante `?previewRole=invitado`, `?previewRole=cliente` o `?previewRole=administrador`. La interfaz marca la previsualización y la pantalla de usuarios no envía cambios en ese modo. La previsualización se elimina del build publicado y no concede permisos a las APIs.

Ejemplos en desarrollo:

- `http://localhost:5173/home` muestra invitado.
- `http://localhost:5173/tracking?previewRole=cliente` muestra la vista de cliente.
- `http://localhost:5173/admin/contenido?previewRole=administrador` muestra el editor de contenido.
- `http://localhost:5173/admin/usuarios?previewRole=administrador` muestra el diseño de gestión de usuarios; la lista requiere la API real.

## Implementación real en backend (actualización 2026-10-15)

La API se adaptó al contrato de correo único: `POST /api/auth/request-otp` admite `{correo}` y deduce el tipo real de usuario de PostgreSQL. No restringe a `@gmail.com`: cualquier correo **registrado y habilitado** puede recibir OTP según `EMAIL_MODE`. El contrato antiguo con `tipoAcceso` y `codigoDynamics` permanece temporalmente compatible.

El backend conserva las convenciones internas existentes: `tipo_acceso='usuario'` produce claim JWT `admin`, y `tipo_acceso='cliente'` produce `client`. El frontend normaliza esas dos etiquetas a `administrador` y `cliente`. **Invitado no es un rol asignable a una cuenta real**, sino ausencia de sesión.

Ya se implementaron `GET /api/admin/users` (paginado) y `PATCH /api/admin/users/{id}` (solo role administrador/cliente y estado). Revocación de sesiones, bloqueo de modificaciones sobre uno mismo, último administrador protegido y auditoría en PostgreSQL. Las rutas administrativas requieren JWT válido, independientemente de la previsualización local.

Noticias y multimedia del panel disponen de APIs persistentes; el editor solo escribe al servidor si hay sesión real `admin`. Detalle en [docs/INTEGRACION-LOGIN-ADMIN-2026.md](../docs/INTEGRACION-LOGIN-ADMIN-2026.md).
