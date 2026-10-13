# Informe de integración — rediseño 8

## Fuentes

- **Visual y experiencia:** `castrofallas-rediseno 8.zip` del equipo frontend.
- **Funciones existentes:** `castrofallas-unificado-actualizado (2).zip` con backend .NET 10, API OTP, datos, Docker y scripts.

## Merge realizado

1. Reemplazados en el proyecto unificado los archivos de interfaz entregados por frontend 8 (estilos, nuevas animaciones, presentación de Noticias, componentes, recursos y traducciones). Se conservaron sus cambios visuales, entre ellos transparencias, pestañas y tratamientos responsive.
2. `frontend/src/Root.vue`: mantenido control del acceso a `/cotizaciones` mediante `GET /api/auth/me` antes de montar el formulario, al ser una protección ausente del nuevo frontend aislado.
3. `frontend/src/pages/Login.vue`: interfaz actual de frontend 8, conectada a `request-otp`/`verify-otp`; usa `/api/auth/me` para sesiones activas. Conservado el ingreso de invitado con salida tentativa de una sesión anterior. Eliminado el aviso fijo de LocalOutbox, pues el usuario puede usar SMTP real.
4. `frontend/src/components/SiteHeader.vue`: nueva navegación condicional, menú de itinerarios y **nuevo ícono de usuario**, pero la autenticación depende de la respuesta del servidor (no de un valor manipulable en `localStorage`); el ícono permite cerrar sesión mediante endpoint existente. El invitado ve contenido público pero no puede cotizar sin credenciales.
5. `frontend/src/App.vue`: conserva manejo de errores 401 y envío a `/api/quotes`, usando el formulario visual del rediseño.
6. `frontend/vite.config.ts`: se mantiene proxy Docker hacia `/api` en `backend:5000` para evitar romper login y cotizaciones. El Vite del frontend aislado apuntaba a `localhost:5000` (inválido dentro del contenedor).
7. Backend existente conservado sin reemplazarlo por el backend básico del rediseño: AuthService, esquemas, conexiones, DBContext, QuoteService, SMTP, Redis/Mongo y API.
8. `backend/Database/AuthSchema.sql`: agregada migración idempotente de `public.itinerarios` (los campos solicitados incluyendo `closing DATE NULL`) sin alterar el contenido de los itinerarios previos. Se aplica solo al iniciar el backend con `Development:ApplySchema=true`.
9. Las traducciones de frontend 8 conservan las cadenas adicionales del proyecto unificado para acceso a cotizaciones y logout.
10. La entrega se genera sin el `.env` privado proporcionado dentro del ZIP anterior, sin `bin/obj`, `node_modules` o compilados.

## Revisión

- **OK:** `python scripts/verify-integration.py` — chequeos estáticos de conexión y componentes.
- **OK:** `vue-tsc -b` — tipado con las dependencias JS de la entrega del equipo frontend.
- **Pendiente:** build completo de Vite; el ZIP de frontend traía binarios opcionales para **macOS ARM**, no `@rollup/rollup-linux-x64-gnu`, y la instalación `npm ci` no pudo completarse en este entorno. Docker instala dependencias correctas según la plataforma.
- **Pendiente:** validación de `dotnet build`, Docker Compose y prueba real OTP/SMTP/DB, ya que este entorno no dispone de Docker o dotnet SDK.

## Importante al actualizar

Este ZIP no trae `.env`. Copiar el **archivo privado del entorno anterior** antes de iniciar Docker si ya existían usuarios y PostgreSQL, para no provocar un nuevo error por divergencia de `POSTGRES_PASSWORD`. Copiar también su configuración SMTP existente, sin enviarla a terceros. Nunca destruir volúmenes con `down -v`; respaldar datos antes de migrar. No se incluyen dumps ni migración de registros; se reutilizan los volúmenes de la misma instalación Compose.

La tabla de itinerarios aún no está conectada a un API; si se necesita almacenar formularios de la interfaz, se debe implementar un endpoint y validaciones antes de afirmar que persiste en DB.
