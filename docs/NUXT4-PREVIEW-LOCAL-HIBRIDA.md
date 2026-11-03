# Migración progresiva Nuxt 4: pruebas locales seguras (PR #141)

**La web original no se ha sustituido.** Estas tres vistas usan el mismo backend de desarrollo y volúmenes locales, pero no el mismo frontend ni el mismo origen del navegador:

| Puerto | Servidor | Rutas |
|---|---|---|
| 5173 | Vue/Vite de desarrollo, con HMR | Toda la SPA histórica |
| 8082 | Nuxt 4 SSR de prueba | Solo rutas públicas ya migradas; las privadas responden 404 por diseño |
| 8083 | Gateway local Nginx | Públicas: Nuxt SSR. Privadas: compilación de Vue de producción con cotizador habilitado. API/SignalR: backend .NET |

## Qué corregimos y por qué

El primer gateway local intentaba conectar el HTML servido por Vite con el enrutamiento Nuxt. Era un ensayo experimental que **no tenía una prueba de navegador del flujo de cotizaciones**. La ruta podía quedar blanca por errores de carga de módulos o de arranque. No se declara una causa concreta sin una traza de red/Consola; ahora se elimina esa dependencia de Vite: `frontend-legacy-preview` construye el frontend Vue y entrega los archivos compilados `/assets/*` en el mismo origen `8083`. El gateway conserva `/api/*` y WebSockets en el backend.

Nuxt sigue usando Vue 3 internamente. Lo que se migra es el enrutador, SSR, runtime y build, sin reescribir componentes con buen comportamiento. El login/OTP, cotizador, tracking, itinerarios y administración **todavía son Vue compilado** desde `8083`. No contar esos apartados como migrados.

El menú Servicios ahora es un **megamenú situado bajo la barra de navegación**: a la izquierda ofrece «Todos los servicios», los cuatro servicios logísticos y la categoría Transportes; a la derecha muestra los seis enlaces finales de Transportes **solo cuando esa categoría está abierta**, que se puede cerrar y abrir tocándola otra vez. El desplegable pasa de aproximadamente 315 px cerrado a 622 px abierto, y calcula un margen de seguridad de 28 px respecto a los bordes de la ventana. Se adapta en modo claro y oscuro. En móvil, tocar Transportes sustituye la lista principal por su segundo nivel, con «Categorías» para regresar; el cajón es el único elemento que desplaza. La ruta actual conserva `aria-current=page` y resaltado. Una comprobación en Chrome valida cuatro combinaciones de tema y tamaño, sin sustituir la revisión visual de Safari.

## PowerShell, desde la carpeta del repo

```powershell
git status
git fetch origin
git switch feat/nuxt4-migration-seo-safety-139
git pull --ff-only origin feat/nuxt4-migration-seo-safety-139
docker compose -f compose.yaml -f compose.nuxt-preview.yaml -f compose.nuxt-local-hybrid.yaml up -d --build backend frontend frontend-nuxt frontend-legacy-preview nuxt-local-gateway
docker compose -f compose.yaml -f compose.nuxt-preview.yaml -f compose.nuxt-local-hybrid.yaml ps
```

No usar `down -v`: puede borrar los volúmenes de desarrollo. Las sesiones de `192.168.1.26:5173` y `localhost:8083` pueden ser diferentes porque las cookies pertenecen al host, no a la rama. Esto no significa que las cuentas estén borradas.

Si aparece una página blanca:

1. Abrir DevTools → Console y Network y revisar la primera solicitud fallida, especialmente `/assets/*` o `/api/auth/me`.
2. Revisar `docker compose -f compose.yaml -f compose.nuxt-preview.yaml -f compose.nuxt-local-hybrid.yaml ps` y logs del gateway, Nuxt y Vue compilado.
3. Comparar `http://localhost:5173/cotizaciones` con `http://localhost:8083/cotizaciones` estando en el mismo estado de sesión.

No publicar ni fusionar por pasar solo pruebas automáticas. Requiere revisión visual real en escritorio, móvil y claro/oscuro y pruebas de sesión/roles, mensajes, tracking y cotizaciones de extremo a extremo.

## Condiciones para integrar en main-2

- CI completo verde, incluidas pruebas Chrome de login, cotizaciones, activos JS, menús responsive y SSR.
- Comparación visual contra 5173 en claro/oscuro.
- Sin cambios destructivos en PostgreSQL ni cambios de backend o de permisos.
- Rollback del gateway documentado y aprobado.
- Revisión por una persona del equipo y autorización explícita antes de fusionar.

## Detener solo la vista híbrida local

```powershell
docker compose -f compose.yaml -f compose.nuxt-preview.yaml -f compose.nuxt-local-hybrid.yaml stop nuxt-local-gateway frontend-legacy-preview
```

El frontend de desarrollo `5173` puede permanecer operativo.
