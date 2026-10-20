# Acceso a solicitudes oficiales de cotización

Implementado en `backend/Endpoints/OfficialQuoteEndpoints.cs`.

- **Administrador autenticado** (rol JWT `admin`, asociado a `usuarios.tipo_acceso = 'usuario'`):
  puede **consultar y gestionar** todas las solicitudes oficiales sin asignaciones manuales.
- **Cliente autenticado**: puede consultar únicamente solicitudes creadas por su propio usuario
  mediante `GET /api/quotes/official/{id}`. No tiene acceso a la bandeja administrativa.
- **Autorización para Dhole**: sigue siendo independiente. Solo un administrador con
  `official_quote_permissions.can_authorize = TRUE` puede autorizar o rechazar.
  No existe una llamada ni integración de envío a Dhole.
- Los permisos se verifican **en la API** en cada operación. El frontend solo
  adapta los controles a las capacidades que devuelve `/api/admin/quotes/official/permissions/me`.
- La tabla `official_quote_permissions` continúa existiendo para asignar expresamente
  la autorización futura; los valores `can_view` y `can_manage` preexistentes no se
  usan como barreras para administradores válidos.

## Verificación sugerida

1. Iniciar sesión como administrador sin registro de permisos y consultar
   `GET /api/admin/quotes/official/permissions/me`.
   Debe dar `canView=true`, `canManage=true`, `canAuthorize=false`.
2. Confirmar que ese administrador puede ver la bandeja y registrar una revisión,
   con evento histórico.
3. Confirmar que la misma cuenta **no** puede autorizar para Dhole (HTTP 403).
4. Confirmar que un administrador con autorización explícita sí puede autorizar.
5. Confirmar que el cliente recibe HTTP 403 en rutas administrativas y que un
   usuario no puede consultar una solicitud de otro usuario por identificador.

Ninguno de estos pasos requiere borrar registros ni modificar `main`.
