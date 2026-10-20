# SEO de servicios terrestres Panamá–Costa Rica

Objetivo: facilitar que buscadores tradicionales y motores de búsqueda con IA identifiquen los servicios de Grupo Castro Fallas en la ruta Panamá–Costa Rica.

## Trabajo incluido
- Página pública y autónoma de HTML en `/transporte-panama-costa-rica/`. No depende de ejecutar Vue ni de iniciar sesión para leer el contenido.
- Datos Schema.org: Organization, WebPage, Service, BreadcrumbList y FAQPage; sin afirmaciones de cuota de mercado.
- Enlaces internos desde Inicio, Servicios y pie de página.
- Sitemap de rutas públicas y permiso explícito para OAI-SearchBot; el API permanece excluido.
- Retiro de noindex del DOM de Noticias, Nosotros y Servicios.

## Verificación
Desde `frontend`:
```bash
npm ci
npm run build
npm run seo:check
```
Comprobar que `dist/transporte-panama-costa-rica/index.html` se crea al compilar. En una vista previa de Nginx, solicitar `GET /transporte-panama-costa-rica/` y confirmar HTML de la página, HTTP 200 y `Content-Type: text/html`. Verificar también enlaces, sitemap y robots.

## Trabajo posterior, separado y sujeto a autorización
- Integrar los cambios a la rama principal y desplegar.
- Verificar indexación y errores en Google Search Console, enviar sitemap y solicitar rastreo.
- Revisar CDN/WAF para asegurar que no se bloquee OAI-SearchBot y medir referencias de ChatGPT.
- Obtener menciones auténticas en fuentes independientes (cámaras, directorios del sector, publicaciones y medios).
- Revisar discrepancias entre años de experiencia y año de fundación en perfiles oficiales.
- Publicar estadísticas solo cuando se puedan validar y divulgar responsablemente.

**Importante:** Estas mejoras favorecen la encontrabilidad, pero no garantizan que Google o ChatGPT muestren a Castro Fallas en cada búsqueda. No se modifica producción desde esta rama.
