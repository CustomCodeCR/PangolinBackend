# Noticias eliminadas: evitar Soft 404 en SSR

## Hallazgo reproducido en Docker local (23 noviembre 2026)

Una noticia publicada tenía HTTP 200 en /noticias/<slug>. Después de editar el título conservó correctamente su URL (PR #298). Después de eliminarla, el navegador mostró «Noticia no disponible» pero `curl.exe -s -o NUL -w "%{http_code}"` devolvió **HTTP 200**.

**Causa técnica compatible con el hallazgo:** el HTML Nuxt de `/noticias/**` y la lista `/api/public-news` tenían dos capas SWR de 120 segundos. El navegador podía mostrar datos actuales por su propia carga y mantener el HTTP 200 de una respuesta SSR anterior. La validación de inexistentes en las pruebas previas comprobaba artículos nunca publicados, no una URL que hubiera dado 200 previamente y después fuera revocada.

## Corrección

- `/noticias/**` deja de almacenar HTML SSR en caché; el listado `/noticias` **conserva** su SWR.
- Nuevo `GET /api/content/news/{id:guid}` público de .NET: consulta directamente PostgreSQL para **un artículo**, devuelve 200 solo cuando existe, está publicado y no caducó; 404 para eliminados/despublicados/caducados. Añade `Cache-Control: no-store`.
- `GET /api/public-news?id=<UUID>` se resuelve en Nitro sin caché y delega al endpoint específico del backend. El `GET /api/public-news` original sin `id` conserva su caché para no descargar el feed completo en cada visita.
- Antes de generar HTML 200, redirecciones 301 o datos SEO de un artículo, Nuxt verifica que el registro sigue activo. No sustituye un error del backend por un HTTP 200 ni redirige enlaces de noticias eliminadas.
- Actualiza los datos del artículo actual en SSR con la versión vigente de PostgreSQL; las URL originales y el diseño de artículos publicados permanecen iguales.

## Pruebas

- E2E Nuxt: una noticia devuelve 200, se marca como eliminada en la API individual **mientras el feed cacheado todavía contiene la noticia**, y su URL exacta y un alias anterior deben devolver **HTTP 404**, nunca 200 ni 301.
- Smoke .NET en PostgreSQL local: endpoint individual 200 con `no-store`, HTTP 404 al despublicar, HTTP 404 al eliminar.
- Se mantienen las pruebas previas de canonicals, `Article`, `sitemap.xml`, títulos, traducciones y rutas protegidas.

## Alcance y límites

- PR hacia `main-2`; no se necesita migración nueva ni se modifica Cloudflare o producción.
- El sitemap y el listado pueden conservar temporalmente el enlace hasta refrescar su caché; eso no cambia el **HTTP 404 inmediato** del artículo eliminado. Si se requiere retirar enlaces del sitemap instantáneamente, debe tratarse en otro cambio.
- Verificación manual en Docker recomendado después del CI: volver a crear una noticia temporal, visitar la URL (200), borrarla y repetir el comando `curl.exe -s -o NUL -w "%{http_code}" "http://IP:5173/noticias/<slug>"` (404).
