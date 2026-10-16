# Contrato WebSocket de pruebas (LEGADO, solo desarrollo)

> **Actualización 2026-10-16:** `main` originalmente tenía un relay Node
> de pruebas en el puerto 8081. La rama `feature/signalr-live-updates-20261016`
> usa **SignalR en el backend .NET** por `/api/hubs/updates`, a través del
> puerto HTTP normal del API. No hay que iniciar `websocket-server.cjs`
> para la web real. Ver `docs/SIGNALR-REALTIME.md` para contrato,
> autenticación, recursos, seguridad y pruebas actuales.

## Especificación histórica del relay de desarrollo



**Estado:** Frontend probado en Mac con `ws://localhost:8081` y `ws://<IP-Mac>:8081`. La difusión y reconexión fueron verificadas manualmente. **Backend remoto NO implementado ni probado**.

## Responsabilidades

- **Frontend Vue 3:** `src/services/websocket.ts` conecta/reconecta y envía eventos; `src/services/realtime.ts` emite `castrofallas:data-changed` a los suscriptores; `src/main.ts` inicializa.
- **Servidor de desarrollo local:** `websocket-server.cjs` (Node + `ws`, puerto 8081). Es solo un broker de pruebas, **no** un servicio de producción ni un API de base de datos.
- **Backend:** autenticar y autorizar usuarios, guardar cambios, publicar eventos confiables tras confirmar transacciones, ofrecer endpoints autorizados para recargar datos. No se deben aceptar notificaciones de negocio publicadas por navegadores no autorizados.

## Protocolo actual (v0, compatible con cliente existente)

Conexión: WebSocket nativo, JSON UTF-8. Al conectar, el servidor de pruebas responde:

```json
{"type":"connected","message":"Conexión WebSocket establecida"}
```

Para pruebas, navegador -> broker local:

```json
{"type":"data-changed","resource":"prueba"}
```

El broker de pruebas reenvía a **otros** clientes conectados, sin reenviarlo al emisor:

```json
{"type":"data-changed","eventId":"UUID-v4","resource":"prueba","timestamp":"2026-10-14T20:00:00.000Z"}
```

`resource`: identificador opaco corto (`[A-Za-z0-9_-]`, 1..60), por ejemplo `quotes`, `news`, `tracking` (nombres propuestos; acordar catálogo definitivo). `eventId`: único por evento, para deduplicación. `timestamp`: ISO-8601 UTC. No incluir datos personales, tokens, claves ni contenido de cotizaciones. El cliente **no interpreta el mensaje como modificación persistida**: al recibirlo, una pantalla suscrita debe recuperar datos desde una API autenticada.

## API frontend existente

- `connectWebSocket()` — conecta si no hay una conexión abierta.
- `disconnectWebSocket()` — detiene conexión y reconexión.
- `publishDataChange(resource)` — **solo para pruebas locales actualmente**; no utilizarlo para declarar eventos confiables de negocio.
- `initializeRealtime()` — registra un listener global una sola vez.
- `subscribeToChanges(resource, handler)` — registra un callback y devuelve función para desuscribirse.

## Seguridad y cambios obligatorios antes de producción

1. El broker actual permite publicar `data-changed` desde navegadores. **No es confiable para eventos de negocio.** Reemplazarlo o protegerlo con autenticación y canal backend separado. Verificar autorización por recurso/usuario/tenant.
2. Establecer autenticación WebSocket adecuada (sesión/cookie same-site o ticket efímero de un solo uso). Nunca poner tokens persistentes en `VITE_...` ni secretos en el bundle JS. La comprobación `Origin` por sí sola no autentica.
3. Definir orígenes permitidos explícitos (localhost, IP dev, dominios staging/prod), límites de tráfico, heartbeat y logs sin datos sensibles.
4. Cuando el sitio use HTTPS, configurar WSS con certificado válido y reverse proxy soportando `Upgrade`/`Connection`.
5. No confiar en `eventId`, `timestamp` ni `resource` suministrados por clientes para acciones privilegiadas.
6. La reconexión no recupera eventos perdidos. Tras reconectar o volver a la pestaña, recargar el estado desde el backend, o incorporar secuencia/cursor si se requieren garantías.
7. El ejemplo local escucha en todas las interfaces (`0.0.0.0`) y se diseñó para una red de desarrollo de confianza. No exponer directamente al público.
8. Las pantallas de noticias actuales son estáticas (`src/content.ts` + traducciones); no hay API de noticias. La sincronización real exige un origen de datos persistido y endpoints correspondientes.

## Direcciones por entorno

Sin `VITE_WS_URL`: `ws://<hostname actual>:8081` en HTTP, `wss://<hostname actual>:8081` en HTTPS (este último necesita servidor TLS). Para integración independiente se recomienda configurar **URL explícita** vía `VITE_WS_URL`.

Desarrollo remoto (`frontend/.env.local`):

```dotenv
VITE_WS_URL=ws://IP_REAL_DEL_BACKEND:8081
```

Publicación con HTTPS:

```dotenv
VITE_WS_URL=wss://ws.dominio-real.tld
```

La variable `VITE_WS_URL` es **pública** y se incluye en el build; no colocar contraseñas ni secretos. `.env.local` debe mantenerse fuera del repositorio. Al cambiar variables Vite reiniciar el proceso Vite.

**Compatibilidad multiplataforma:** Node.js + npm para frontend, cualquier OS para backend. No depende obligatoriamente de PostgreSQL, .NET, SignalR o Redis para establecer la conexión WebSocket; las operaciones de negocio pueden tener sus propias dependencias.

## Checklist de integración equipo backend

- [ ] URL/puerto y origen frontend acordados por ambiente.
- [ ] Autenticación WebSocket y autorización por recurso implantadas.
- [ ] Los eventos de negocio son emitidos por backend tras transacción confirmada.
- [ ] Los clientes no pueden falsificar eventos confiables.
- [ ] Pantallas Vue suscritas recargan información vía API al recibir eventos.
- [ ] Recuperación tras cortes y reconexión probada.
- [ ] WSS + TLS, protección perimetral, permisos, logs y límites revisados para staging/producción.
- [ ] Pruebas desde macOS, Windows y Linux y entre varias redes realizadas.

## Comprobaciones locales

Desde `frontend`, con servidor WebSocket local ya activo en 8081:

```bash
node scripts/test-websocket-local.cjs
npm run build
```

El script prueba únicamente saludo y difusión en el broker local. No certifica la seguridad del servicio remoto.
