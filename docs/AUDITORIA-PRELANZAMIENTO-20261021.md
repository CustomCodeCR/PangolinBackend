# Auditoría técnica preliminar para lanzamiento web
Fecha de inspección de código: 2026-10-21. Base: `main` de CustomCodeCR/PangolinBackend; correcciones de tracking en `feat/tracking-db-launch-audit-20261021`.

**Alcance:** revisión de código/documentos de GitHub, contratos de rutas y procesos de CI; **no** equivale a prueba de penetración, auditoría legal, ejecución en servidor público, escaneo actualizado de dependencias ni prueba de carga. No declarar listo para producción sin verificar los controles pendientes.

## Hallazgos comprobados

| Prioridad | Área | Evidencia | Acción de lanzamiento |
|---|---|---|---|
| BLOQUEANTE | Seguimiento | `frontend/src/pages/Tracking.vue` antes solo mostraba un aviso, sin backend | Se añadió consulta PostgreSQL con semilla ficticia solo en desarrollo, errores controlados y aprobación `is_public` |
| BLOQUEANTE | Licencia del globo | `frontend/src/pages/Legal.vue` advierte licencia comercial de `3d-world-map`/CanvasGlobe | Documentar adquisición/autorización o reemplazar el componente antes de publicar |
| BLOQUEANTE | Derechos de imágenes | `Legal.vue` identifica falta de inventario completo de derechos | Validar autoría, permisos y atribuciones de cada recurso |
| BLOQUEANTE | Destino API en Nginx | `frontend/nginx.conf` dirige `/api/` a `http://api:8080`; `compose.yaml` de desarrollo usa `backend:5000` | Definir arquitectura de producción, alias/puerto correctos y verificar proxy real de API/SignalR antes de publicar |
| BLOQUEANTE | Avisos legales | `Legal.vue` aún solicita razón social, cédula y domicilio; políticas requieren visto bueno jurídico | Completar y obtener aprobación legal y de la empresa |
| ALTA | SEO noticias | `docs/SEO-ORGANICO-PRELANZAMIENTO-20261020.md` indica SPA sin HTML de artículo por URL única | Probar indexación real; considerar prerender/SSR y URLs individuales |
| ALTA | Seguimiento y confidencialidad | BL/PO/contenedor pueden ser identificadores adivinables | `is_public=false` por defecto; aprobación operativa, respuesta mínima, rate limit; para seguimiento privado exigir acceso autorizado |
| ALTA | Producción frente a desarrollo | `README.md` y `compose.yaml` documentan configuración local en Development y puertos locales | Crear manifiesto/configuración de producción aislados, HTTPS/WSS, secretos y respaldos |
| MEDIA | Guía de tracking | `Tracking.vue` iniciaba `driver.js` automáticamente a los 650 ms pese a guía opcional | Corregido: solo se inicia al pulsar Guía |
| MEDIA | Fuentes dinámicas | Rastreo no tiene conexión al sistema operativo real | Diseñar con proveedor/API y validación de actualizaciones, no anunciar GPS en vivo |

## Controles presentes en código (verificar efectividad)
- Backend OTP/JWT revocable, permisos por rol, limitación de solicitudes, protección de escrituras frente a Origin extraño y validaciones en consultas.
- CI `.github/workflows/ci.yml`: build Vue y .NET, smoke de Chrome, SEO y Nginx. La presencia de CI no implica que haya pasado para esta rama.
- Rutas SEO, robots/sitemap y configuraciones de errores HTTP documentadas en `docs/SEO-AUDITORIA-LOCAL-20261020.md`.
- Responsive revisado previamente según `RESPONSIVE-AUDITORIA.md`, pero se debe repetir después de conectar el resultado de seguimiento.

## Verificaciones obligatorias que no pude realizar desde GitHub
1. **Seguridad:** escanear dependencias npm/NuGet con fecha del despliegue; probar controles por rol y por empresa, CSRF, XSS, cargas de medios, WebSockets y ausencia de secretos en logs; configurar cabeceras HSTS/CSP/referrer/nosniff/frame-ancestors en reverse proxy según compatibilidad real.
2. **Infraestructura:** TLS válido con redirección HTTP a HTTPS y WSS; revisar proxy de confianza para obtener IP real; base PostgreSQL, MinIO, Redis y Mongo no expuestos al exterior; firewall, cuentas DB de privilegio mínimo, rotación de secretos y actualizaciones.
3. **Resiliencia:** backups cifrados y restauración probada; migraciones y rollback; monitoreo/alertas para 5xx, 429, almacenamiento, SMTP y jobs; probar pérdida temporal de DB, email, MinIO y proveedor de IA.
4. **Funcionalidad:** login OTP real, cierre de sesión/revocación, permisos entre empresas, cotizaciones por modalidad, panel de usuarios/noticias/comentarios, carga multimedia, itinerarios, tracking positivo/negativo/429, rutas vacías y navegación ES/EN.
5. **Usabilidad y acceso:** iOS/Android/escritorio, navegación solo por teclado, lector de pantalla, contraste y zoom al 200 %, dark mode, conexión lenta y reducción de movimiento.
6. **SEO/performance:** verificar URLs y metadatos reales en el dominio, Lighthouse móvil y escritorio, LCP/INP/CLS, sitemap/robots/404, Search Console y ausencia de indexación de zonas privadas.
7. **Contenido y legal:** confirmar contactos, horarios, servicios y datos corporativos, transparencia del uso de Groq/IA, tratamiento de datos y derechos de imágenes/licencia de globo.

## Puertas de liberación
- [ ] GitHub Actions verde para la PR y pruebas de seguimiento contra PostgreSQL de staging.
- [ ] La empresa aprueba qué estados de embarque son visibles y prueba con datos anonimizados.
- [ ] Licencias de visualizaciones/fotos y textos legales resueltos por responsables.
- [ ] Configuración real de producción, HTTPS, proxy seguro, backups restaurados y monitoreo probados.
- [ ] QA funcional, móvil, accesibilidad, seguridad y SEO completados con evidencia.
- [ ] Cambios revisados por otro desarrollador y despliegue gradual documentado.

Hasta completar estos puntos, **no fusionar/desplegar por asumir que la web está preparada para producción**.
