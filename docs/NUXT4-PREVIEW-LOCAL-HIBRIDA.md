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

## Estabilidad de 8083 y diagnóstico de imágenes/502

El gateway local ahora resuelve `frontend-nuxt`, `frontend-legacy-preview` y
`backend` con el DNS integrado de Docker al usar cada proxy. Antes el Nginx
memorizaba las IP al iniciar: tras `docker compose up --build` podía conservar
la IP del contenedor anterior y provocar 502. Además, Compose espera que Nuxt
y el Vue compilado respondan correctamente antes de iniciar el gateway.

La prueba CI `scripts/test-nuxt-local-gateway.sh`:
- Prueba las rutas públicas y las vistas privadas actuales sin sesión.
- Revisa **todos los archivos `/images/*` incluidos en GitHub**, los bundles
  de Vue/Nuxt y una imagen del CMS servida por la API simulada.
- Recrea Nuxt con una IP distinta y verifica que 8083 vuelve a responder **sin
  reiniciar Nginx**. Detecta regresiones que el test de compilación no detecta.
- Abre páginas reales en Chrome y comprueba imágenes locales, menú y cotizaciones
  sin sesión. No prueba objetos S3 reales ni la persistencia de un cotizador
  autenticado: esas verificaciones requieren el entorno del usuario.

### Si aparece un 502 en Windows

Ejecutar en PowerShell, dentro de la rama de la PR, sin compartir el archivo
`.env`, cookies ni tokens:

```powershell
$files = @('compose.yaml', 'compose.nuxt-preview.yaml', 'compose.nuxt-local-hybrid.yaml')
docker compose -f $files[0] -f $files[1] -f $files[2] ps
docker compose -f $files[0] -f $files[1] -f $files[2] logs --tail=100 nuxt-local-gateway frontend-nuxt frontend-legacy-preview backend
curl.exe -I http://localhost:8083/
curl.exe -I http://localhost:8083/images/hero.webp
curl.exe -I http://localhost:8083/servicios/transporte-maritimo
```

Si una imagen gestionada por CMS no aparece pero `/images/hero.webp` sí,
inspeccionar en DevTools → Network **la solicitud exacta** a
`/api/content/media/<id>/file` y su respuesta. Si falla con 404, 403 o 5xx,
verificar el backend y el almacenamiento S3/MinIO; no inventar ni reemplazar
la URL ni borrar registros de la base de datos.

La vista `8082` sigue siendo exclusivamente Nuxt y no sustituye el gateway;
las rutas privadas y algunas conexiones de API no se prueban en ese puerto.

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
