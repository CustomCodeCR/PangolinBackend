# Integración WebSocket backend JJ

La API expone `GET /ws` con Upgrade WebSocket, en el mismo origen que `/api`. El backend envía eventos tras guardar cambios correctamente. No acepta avisos enviados por el navegador.

Formato: `{"type":"data-changed","eventId":"UUID","resource":"itinerarios","timestamp":"2026-10-15T20:00:00Z"}`.

Recursos: `itinerarios` para usuarios registrados, `quotes` solo para el ClienteId que creó la cotización, `news` público, `media` solo para administradores. La sesión se comprueba usando la cookie JWT existente al conectar. Las conexiones duran como máximo cinco minutos para revalidar la sesión en cada reconexión. No se envían datos de negocio en el mensaje.

Vite usa un proxy de WebSocket hacia ASP.NET Core. `VITE_WS_URL` mantiene la compatibilidad con pruebas externas. No se necesitan cambios en las bases de datos ni un nuevo contenedor. La memoria de sockets es local al proceso: más de una instancia requerirá un mecanismo pub/sub.

## Pruebas de aceptación

1. Ejecutar `dotnet build` y `npm run build` en sus respectivos directorios.
2. Abrir dos pestañas con sesión de administrador, comprobar Network > WS > `/ws`.
3. Crear, actualizar y eliminar itinerarios. La otra pestaña debe actualizar el listado y conservar los filtros.
4. Crear una cotización de cliente; únicamente sockets del mismo cliente deben recibir evento `quotes`.
5. Crear o editar una noticia publicada: la página pública abierta como invitado debe refrescar mediante `/api/content/news`.
6. Intentar enviar `data-changed` desde el navegador: el servidor debe cerrar el socket. No debe afectar ningún dato.
7. Cerrar sesión, renovar conexión y comprobar que no se reciben eventos privados.
8. Repetir las pruebas CRUD existentes con Docker Compose y los scripts de integración.

Los avisos pueden perderse durante desconexiones. El frontend vuelve a consultar REST después de reconectar. En producción se requiere HTTPS/WSS y un reverse proxy que soporte Upgrade.
