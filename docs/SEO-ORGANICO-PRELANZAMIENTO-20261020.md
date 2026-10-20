# SEO organico de Castro Fallas: alcance y verificacion

Esta PR prepara señales de contenido y estructura para la version oficial de PangolinBackend/main, sin modificar maquetacion ni publicar nada. La prueba en http://localhost:4180 o una IP LAN **no significa indexacion por Google**.

## Que implementamos

- Metadatos de Inicio, Servicios, Nosotros y Noticias orientados a busquedas reales de logistica, transporte de carga Panama-Costa Rica y servicios aduaneros; cada pagina tiene descripcion natural y titulo propio.
- Imagen social real por pagina y textos alternativos para la vista previa de enlaces.
- Schema.org verificable para Organization, WebSite, WebPage/AboutPage/CollectionPage y BreadcrumbList; los servicios se describen solo en Inicio y Servicios, conforme al contenido existente.
- Sitemap generado desde la configuracion compartida con las rutas y canonicals. /home se canonicaliza a / y no se duplica en el sitemap.
- Paginas de acceso, seguimiento, cotizaciones y administracion: noindex, sin canonical ni Schema publico.
- Administracion, cotizaciones, login, tracking, itinerarios y noticias se cargan bajo demanda en el frontend para reducir la carga inicial de Inicio (el resultado real debe verificarse en Lighthouse).

## Validacion local

Desde frontend:

    npm ci
    npm run build
    npm run seo:check
    npm run preview -- --host 0.0.0.0 --port 4180

Verifica dist/servicios/index.html, dist/nosotros/index.html, dist/noticias/index.html y dist/sitemap.xml para el HTML servido inicialmente. Las pruebas de seo:check revisan robots, canonical, OG/Twitter, tipos de Schema, fuentes de imagen y coherencia de sitemap.

Navegar en localhost o IP LAN puede eliminar el canonical del DOM una vez que Vue se ejecuta. El HTML inicial de la pagina publica conserva la URL canonica absoluta del dominio oficial. Esto es intencional.

## Limites antes de posicionar en Google

- El body de las paginas sigue siendo **SPA Vue**: el HTML estatico aporta metadatos y JSON-LD, pero **no prerenderiza contenido de la pagina**. Hay que evaluar SSR o prerender real para mejorar la indexacion de contenido sin JavaScript, especialmente Noticias.
- Las noticias se cargan desde el CMS despues de iniciar la app y se abren por ?article=<id> como modal. No tienen aun URLs de articulo independientes ni HTML de articulo servido al buscador. No declarar NewsArticle falso.
- JSON-LD y metadatos no garantizan primeras posiciones ni resultados enriquecidos. Se necesita contenido relevante, reputacion, enlaces e indexacion real.
- En Google Search Console, despues del despliegue oficial: verificar la propiedad, enviar sitemap.xml, inspeccionar /, /servicios, /nosotros y /noticias, confirmar canonical/indexacion y revisar consultas e impresiones.
- Medir Lighthouse y Core Web Vitals en el despliegue real (movil y escritorio), revisando LCP, INP y CLS. El build no sustituye una prueba en el servidor Nginx real.
- La PR no modifica el dominio en produccion y no valida un ranking existente.
