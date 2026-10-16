# Actualizaciones en tiempo real · PangolinBackend

Rama de desarrollo: `feature/signalr-live-updates-20261016`.
No fusionar sin verificar la PR, el smoke de SignalR y los navegadores.

## Qué cambia

Se usa SignalR integrado en ASP.NET Core 10 bajo `/api/hubs/updates`.
El navegador usa el cliente `@microsoft/signalr` ya incluido en npm.
Vite reenvía `/api` con WebSocket Upgrade al backend. No se abre el
puerto 8081; `frontend/websocket-server.cjs` queda como experimento de
desarrollo, **sin utilizar en el arranque de la web**.

El Hub no expone métodos para que un navegador anuncie cambios. El backend
publica notificaciones exclusivamente **después** de guardar en PostgreSQL.
Los mensajes contienen solo `type: data-changed`, `resource`, `eventId`,
`timestamp`. No transportan datos personales ni textos privados.

| Evento | Alcance | Acción del navegador |
| --- | --- | --- |
| `site` | Todos | Recarga `GET /api/content/site`, solo contenido publicado |
| `news` | Todos | Recarga `GET /api/content/news`, solo noticias publicadas |
| `site-admin` | Administradores | Recarga borradores CMS sin sobrescribir formularios |
| `news-admin` | Administradores | Recarga listado de noticias |
| `media` | Administradores | Recarga biblioteca |
| `itineraries` | Clientes y administradores autenticados | Actualiza búsqueda/administración |
| `users` | Administradores | Recarga gestión de usuarios |
| `quotes` | Grupo personal del admin o grupo de empresa del cliente | Revalida cotización actual |

El acceso por sesión utiliza la cookie HttpOnly `cf_session`, validada
contra PostgreSQL al conectar. No se envían JWT en la URL ni en el JavaScript.
Para cotizaciones, el backend separa administradores por `UsuarioId` y
clientes por `ClienteId`. Una notificación NO concede permiso sobre la API:
las consultas siguen autenticadas, protegidas y comprobadas por la sesión.

## Reconciliación

SignalR prefiere WebSocket y puede caer a otros transportes. Tras reconectar,
al volver a la pestaña o al recuperar la red, se emite el evento local
`sync` y Vue recarga los recursos relevantes. Este evento **no viaja al
servidor**. Los formularios del administrador mantienen las entradas
sin guardar; las listas y vistas publicadas se sincronizan por separado.

La notificación es un acelerador, **no una fuente de verdad ni una cola duradera**.
Si no hay conexión, las API siguen funcionando y la próxima visita/recarga
consulta los datos persistidos.

## Probar en Windows (Docker)

1. Desde la rama de la PR, asegurarse de que .env y licencia de MinIO sean locales.
2. `docker compose -f compose.yaml -f compose.minio.yaml up -d --build`.
3. Abrir `http://localhost:5173/home` en dos pestañas.
4. En otra pestaña, entrar con administrador real a `/administracion`.
5. En Editor visual cambiar un texto, guardar **borrador**: ninguna pestaña
   pública debe cambiar; otro editor admin sí recibirá actualización.
6. Publicar: las dos pestañas de visitantes deben reflejar el cambio sin F5.
7. Restaurar original: ambas vuelven a su valor por defecto sin recarga manual.
8. Crear/publicar una noticia: `/noticias` se actualiza en otra pestaña.
9. Cambiar un itinerario y comprobar resultados de búsqueda ya abiertos.
10. Crear cotización con administrador y con cliente; no debe haber avisos de
    otros usuarios entre sesiones distintas.
11. Desconectar la red, modificar contenido y reconectar: Vue vuelve a consultar
    el CMS al recuperar la conexión. Comprobar consola, modo oscuro y responsive.
12. Probar sin puerto 8081 abierto: la web debe usar SignalR por `/api`.

Los tests CI incluyen compilación .NET/Vue, CRUD y una prueba real con un
administrador y un visitante anónimo conectados simultáneamente al Hub.

## Límites

- Funciona en un único proceso backend de Docker. Si se ejecutan múltiples
  instancias con balanceador, agregar backplane Redis o un servicio SignalR
  distribuido y configurar sesiones persistentes/afinidad según el transporte.
- Una sesión se verifica al conectar; una conexión abierta puede continuar
  hasta la próxima reconexión si el usuario pierde permisos. Los eventos son
  metadata sin datos sensibles y las API comprueban permisos en cada solicitud.
  Para cierre inmediato se necesitaría expulsión proactiva de conexiones.
- No hay historial duradero de eventos. Para garantizar entrega incluso con
  cortes largos, implementar outbox/cursor persistente y reconciliación.
- Producción exige HTTPS/WSS, reverse proxy que permita Upgrade y controles
  de origen/capacidad adecuados. No se debe exponer el broker de prueba 8081.
