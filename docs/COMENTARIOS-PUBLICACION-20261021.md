# Comentarios persistentes y moderados

El panel **Administración > Comentarios** guarda en PostgreSQL mediante rutas protegidas por JWT administrador. Las vistas públicas ven exclusivamente los comentarios publicados y no incluyen borradores.

## API

- `GET /api/content/comments`: pública; solo publicados, máximo 100 registros recientes.
- `GET /api/admin/content/comments`: admin, incluye borradores.
- `POST /api/admin/content/comments`: admin, crear.
- `PUT /api/admin/content/comments/{id}`: admin, editar y publicar/retirar.
- `DELETE /api/admin/content/comments/{id}`: admin, eliminar.
- Campos: `author` (1-100), `section` (0-100), `message` (1-1200), `published` (boolean).

Los cambios emiten eventos `comments-admin` para el panel y `comments` para el público cuando afectan una entrada publicada. En previsualización sin administrador real los datos son locales, no se publican.

## Esquema SQL y despliegue

El archivo `backend/Database/AuthSchema.sql` crea idempotentemente `public.cms_comments`. El Docker Compose local usa `ASPNETCORE_ENVIRONMENT=Development` y `Development__ApplySchema=true`, por lo que crea la tabla antes de la comprobación de disponibilidad, sin borrar datos existentes. En instalaciones de producción **la tabla no se crea automáticamente**: antes de desplegar esta versión, ejecutar el bloque `CREATE TABLE IF NOT EXISTS public.cms_comments` y su índice del mismo archivo mediante el procedimiento de migraciones aprobado, con respaldo y verificación. `/api/health/ready` verifica la nueva tabla y responderá `503` si no existe. Fusionar la PR en GitHub no ejecuta por sí solo la migración ni despliega producción.

## Pruebas

1. Compilar frontend y backend. Verificar que el navegador no tenga errores Vue y que el backend arranque con el nuevo esquema.
2. Ingresar como administrador y crear un comentario con `published=false`. Confirmar su presencia en el panel y ausencia en `GET /api/content/comments` y en la página de inicio.
3. Editar el comentario y publicarlo. Confirmar que aparece desde otro navegador y sobrevive reinicios.
4. Retirarlo a borrador. Confirmar que desaparece de público y permanece en administración.
5. Republicar y eliminar; verificar la eliminación en ambos listados.
6. Comprobar `401/403` en `POST/PUT/DELETE` sin credenciales de administrador, `400` para campos vacíos o demasiado largos y `404` para identificadores inexistentes.
7. Probar ventanas de escritorio/móvil y ambos temas; comprobar que no se altera la publicación de Noticias.
8. Confirmar recepción de eventos `comments` y `comments-admin` cuando SignalR esté conectado.
9. Ejecutar `scripts/smoke-local.py` contra una instalación de pruebas con LocalOutbox y cuentas de demostración; incluye CRUD de comentarios, aislamiento de borradores, campos inválidos y autorización admin/cliente/invitado.

Los comentarios antiguos guardados en el almacenamiento local del navegador no se importan automáticamente; esto evita exponer contenido que nunca fue moderado en el servidor.
