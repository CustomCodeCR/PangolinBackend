# Frontend Castro Fallas: diseño nuevo + WebSockets

## Qué contiene

Esta carpeta `frontend/` usa **completamente el frontend del ZIP de diseño nuevo como base**. Se conservaron sus componentes, CSS, diseño responsive, asistente virtual, carrusel de noticias y configuración del tema.

Del ZIP `CastroFallas-Frontend-WebSockets.zip` se incorporaron:

- `src/services/websocket.ts`: cliente WebSocket nativo y reconexión automática.
- `src/services/realtime.ts`: canal de eventos `castrofallas:data-changed` y suscripciones.
- `src/main.ts`: inicializa ambos servicios, sin sustituir el código visual de la versión nueva.
- `websocket-server.cjs`: broker para **desarrollo local únicamente**.
- `scripts/test-websocket-local.cjs`: prueba de saludo y difusión entre dos conexiones.
- `docs/CONTRATO_WEBSOCKETS.md`: contrato con backend y limitaciones de seguridad.
- `src/vite-env.d.ts`: tipos de Vite.
- `package.json` y `package-lock.json`: se conservó `@microsoft/signalr` del frontend nuevo y se añadió `ws@8` para el broker. SignalR y WebSocket nativo **no son el mismo protocolo**.

No se reemplazaron `src/Home.vue`, `src/Root.vue`, `src/components/SiteHeader.vue`, `src/components/AssistantBot.vue`, `src/pages/Services.vue` ni `src/style.css`.

## Cómo arrancar en VS Code

Abrir la terminal en la carpeta `frontend` de este ZIP.

```bash
npm ci
npm run dev
```

En Windows PowerShell, si `npm` muestra un error de política de ejecución, usar `npm.cmd ci` y `npm.cmd run dev`.

En **otra terminal**, desde esa misma carpeta, iniciar el servidor WebSocket **solo para pruebas locales**:

```bash
npm run ws:dev
```

En una tercera terminal, validar la difusión:

```bash
npm run ws:test
```

Si todo funciona, la prueba informa `OK: entrega de evento a segundo cliente`. Por defecto el cliente Vue se conecta al host donde está abierta la página, en el puerto `8081`; Vite escucha en `5173`. El servidor de pruebas admite únicamente orígenes HTTP de ese mismo host en puertos `5173` y `4173`.

Para usar una dirección distinta, crear `frontend/.env.local` y colocar:

```dotenv
VITE_WS_URL=ws://IP_O_HOST_REAL:8081
```

Reiniciar Vite después de cambiarla. Si la página usa HTTPS, se requiere WSS con TLS. No guardar secretos en variables `VITE_`.

## Copiarlo a tu rama de GitHub

1. Hacer una copia de seguridad o commit de los cambios pendientes de la rama.
2. Sustituir el contenido de la carpeta `frontend/` del repositorio por el contenido de `frontend/` de este ZIP, sin copiar `node_modules` ni `dist`.
3. Revisar `git diff`, especialmente `package.json`, `package-lock.json` y `src/main.ts`.
4. Probar `npm ci`, `npm run build` y `npm run ws:test` con el broker local iniciado.
5. Guardar con `git add frontend && git commit -m "Integrar WebSockets en frontend nuevo"`.
6. Si utilizas Docker Compose desde la raíz del repositorio, reconstruir el frontend con `docker compose up -d --build`.

**Docker:** reconstruir el frontend no levanta automáticamente `websocket-server.cjs`; el ZIP no contiene el `docker-compose.yml` del repositorio. Se debe configurar un servidor WebSocket por separado o añadir un servicio explícito en Compose. El broker de pruebas restringe los orígenes a los puertos de Vite, por lo que no se conecta desde el frontend servido por Nginx/Docker sin adaptar la configuración. No exponer el broker de pruebas a Internet.

## Límites actuales

Los mensajes recibidos se transforman en eventos `data-changed`, pero las páginas actuales no contienen suscripciones que recarguen datos desde una API. El backend debe autenticar y publicar eventos luego de confirmar cambios en la base de datos; los componentes interesados deben suscribirse mediante `subscribeToChanges(resource, handler)` y consultar de nuevo la API correspondiente. **Esto no conecta por sí solo PostgreSQL, Redis ni un hub de SignalR**. Leer `docs/CONTRATO_WEBSOCKETS.md` antes de publicar.

## Verificaciones efectuadas en la integración

- `vue-tsc -b`: correcto.
- Prueba del broker entre dos clientes Node (`ws` disponible en el ZIP Mac): correcta, usando compatibilidad con versiones 7/8 en los archivos de pruebas.
- Integridad de diseño: verificada por comparación de archivos; solo cambiaron `src/main.ts`, `package.json` y `package-lock.json` de la base nueva, además de los archivos añadidos.
- `npm run build` completo: no ejecutado en el entorno de integración, porque el ZIP del diseño nuevo traía binarios opcionales de macOS y no había acceso a npm para instalar los de Linux. Debe ejecutarse con `npm ci` en el equipo de destino o durante la reconstrucción Docker.
