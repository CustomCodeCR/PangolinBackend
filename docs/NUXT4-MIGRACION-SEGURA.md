# Migración progresiva a Nuxt 4 y cobertura SEO (main-2)

Estado inicial: 2026-11-03. Implementación en la PR #141 (primera etapa), sin desplegar.

## Principio técnico

Nuxt 4 ejecuta Vue 3. El objetivo es sustituir el frontend SPA basado en Vite como punto de entrada y enrutador, **no reescribir los componentes Vue funcionales**. No fusionar rutas autenticadas con el nuevo gateway sin pruebas E2E, regresión visual y rollback demostrado.

## Matriz de migración

| Área | Estado en rama base | Objetivo | Condición de aceptación |
|---|---|---|---|
| Inicio | Nuxt SSR | Conservar | HTML SSR y diseño visual idéntico |
| Nosotros | Nuxt SSR | Conservar | Datos estructurados y enlaces coherentes |
| Noticias y artículos | Nuxt SSR, Vue reutilizado | Conservar | CMS, publicación, caducidad y slugs sin regresión |
| Servicios (4 anteriores) | Nuxt SSR | Conservar | Preguntas y metadatos SSR |
| Servicios (6 de PR #139) | Solo Vue/Vite | Migrar a Nuxt SSR | HTTP 200, H1, canonical y sitemap |
| Empresas y fichas | Nuxt SSR | Ampliar contenido validado | No inventar servicios, datos o certificaciones |
| Páginas legales | Gateway Vue/Vite | Migrar a Nuxt SSR | Misma redacción, enlaces y avisos de licencias |
| Login y OTP | Vue/Vite, sesión | Cliente Nuxt tras tests E2E | No exponer tokens ni romper retorno de sesión |
| Cotizaciones | Vue/Vite con roles | Cliente Nuxt por bandera gradual | Registro persistido y visibilidad correcta por usuario |
| Tracking / Dynamics | Vue/Vite, roles y API | Cliente Nuxt por bandera gradual | Consultas reales y privacidad intactas |
| Itinerarios | Vue/Vite, API | Cliente Nuxt por bandera gradual | Consultas y estados sin regresión |
| Administración / editor / usuarios | Vue/Vite, privilegios | Cliente Nuxt por bandera gradual | Acceso autorizado únicamente; CMS sin pérdida |
| GIO / SignalR / chat | Plugins de navegador y backend | Reutilizar clientes con ciclo de vida Nuxt | No multiplicar conexiones ni listeners |

No mover a Nuxt la API .NET ni PostgreSQL. Mantener estas dependencias como servicios de backend.

## Criterios obligatorios por PR

1. Rama nueva desde el último `main-2`. No escribir en `main-2` directamente.
2. Compilación Vue, Nuxt y .NET; pruebas de contrato y Docker.
3. Pruebas HTTP en gateway: páginas públicas 200, `/home` 301, inexistentes 404 y rutas privadas no indexables.
4. Pruebas SSR con JavaScript desactivado para páginas públicas; H1, canonical, Open Graph, JSON-LD, enlaces, robots y sitemap.
5. Pruebas de navegador de modo claro y oscuro, móvil y escritorio. Capturas de referencia para cambios visuales.
6. Para rutas autenticadas: usuario sin sesión, cliente, administrador, caducidad de sesión, backend 401/403, recarga directa y navegación interna.
7. Para cotizaciones y noticias: escritura, recarga, permisos, edición, eliminación/expiración y persistencia de PostgreSQL en un entorno de prueba.
8. Pruebas de conectividad y errores de Dynamics, SignalR y la herramienta de chat sin depender de datos ficticios de producción.
9. Revisión de compatibilidad de configuración Docker/Traefik; rollback desactivando la ruta Nuxt sin tocar base de datos.
10. No autorizar producción con checks fallidos o sin evidencia de canary.

## Plan SEO/GEO/AEO/AIO y dependencias externas

**Código y pruebas:** metadatos únicos por URL, FAQ visibles y correctamente modeladas, Schema.org, enlazado interno, sitemap de noticias válidas, robots, canonical, recursos de Bing, `llms.txt` experimental, consistencia de host, 404, auditorías de enlaces, Core Web Vitals y un dashboard de métricas.

**Contenidos:** revisar con el negocio las descripciones de Grupo Castro Fallas, Neriteka, Aduanera y Transporte Castro Fallas. Aumentar profundidad por servicio sin páginas duplicadas o afirmaciones no comprobadas; versiones ES/EN con URLs diferenciadas si se decide implementar `hreflang`.

**Acciones que no se resuelven solo con código:** verificar Google Search Console y Bing Webmaster Tools, publicar/enviar sitemap, configurar GA4 y conversiones, gestionar fichas de Google Business Profile/Bing Places, confirmar directorios legítimos y medir presencia en seis motores de búsqueda/asistentes. Requieren cuentas, permisos y datos oficiales. Ninguna automatización garantiza indexación ni recomendaciones de IA.

**Responsabilidad de infraestructura:** el equipo Fennec gestiona el dominio raíz y Pangolin el host WWW. Acordar el canonical y 301 antes de cambiar el enrutamiento DNS/Traefik.

## Estado y seguimiento

- PR #139: cambios ya incorporados directamente en `main-2` mediante otro commit; no fusionar de nuevo.
- PR #141: primera migración Nuxt de páginas nuevas y legales, además de pruebas de regresión. Mantener en borrador hasta CI y revisión funcional.
- Próximas etapas: rutas autenticadas bajo feature flag y pruebas reales; después publicación, indexación, métricas y automatización.
- Configurar protección de rama desde GitHub Settings requiere permisos administrativos; CI por sí solo no impide los pushes directos.
