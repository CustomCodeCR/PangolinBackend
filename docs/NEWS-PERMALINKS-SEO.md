# URLs permanentes de Noticias — implementación aislada

**Destino de la PR:** `main-2`. No modifica Cloudflare, DNS, Fennec, `main` ni despliega producción.

## Contrato público

- Al crear un **borrador** no se fija URL; al publicar por primera vez, el backend guarda `cms_news.slug` calculado con la fecha, el titular original y el sufijo de 8 caracteres del UUID. El administrador no puede alterar este campo por JSON.
- Cambiar título, descripción, fecha, idioma, imágenes, publicación/despublicación o republicar conserva el mismo `slug`.
- Las noticias publicadas **antes** de la migración mantienen exactamente su URL actual: inicialmente el campo `slug` permanece `NULL` y la API calcula la ruta histórica sin modificar PostgreSQL. Antes de su **primera edición**, el backend congela el slug calculado del registro anterior. Se evita una conversión SQL aproximada de acentos que podría cambiar rutas ya enlazadas.
- Una solicitud a una ruta descriptiva antigua con el mismo sufijo UUID redirige en Nuxt con **HTTP 301** a la ruta definitiva, solo si existe una noticia pública y el sufijo es inequívoco. Los registros despublicados/caducados siguen dando 404.
- Las rutas antiguas `/noticias?article=<UUID>` redirigen con 301 a la URL definitiva; la interfaz de Administración no cambia.
- `/sitemap.xml` incluye únicamente la URL canónica (y `<lastmod>` basado en `content_modified_at` real), mientras que Article JSON-LD expone `dateModified`. Los metadatos no se cambian cuando se guarda sin modificaciones editoriales.
- Las cachés de Nuxt/listado/sitemap bajan de 300–600 s a **120 s** por capa. No se garantiza rastreo ni indexación instantáneos.

## Migración: prerequisito obligatorio de despliegue

La aplicación .NET nueva consulta dos columnas adicionales. **No se debe desplegar la nueva versión del backend antes de aplicar la migración.**

1. Con autorización operativa, identificar la base PostgreSQL correcta y realizar/corroborar un **respaldo verificable**.
2. Probar primero en una copia aislada. Confirmar que existen `public.cms_news`, `published_at`, `created_at` y `updated_at`.
3. Aplicar `backend/Database/CmsNewsPermalinksMigration.sql` en transacción (`psql -X -v ON_ERROR_STOP=1 --single-transaction -f ...`). La migración es **aditiva e idempotente**: solo añade `slug` y `content_modified_at`, no modifica titulares ni direcciones; rellena la fecha de modificación para publicaciones ya existentes sin sobrescribir fechas preexistentes.
4. Verificar los registros y que `slug` de noticias antiguas quede nulo hasta su primera edición. Tras eso, desplegar backend y Nuxt **coordinadamente**. El frontend legado conserva compatibilidad porque los nuevos campos son opcionales.
5. Ejecutar las comprobaciones HTTP de Nuxt y pruebas de creación/edición/despublicación en un entorno de pruebas.
6. Confirmar que el ejemplo histórico de Hacienda responde 301 desde la URL con terminación antigua `mercancias-al-pais-f4c941bb` a la URL actual con `mercancia-al-pais-f4c941bb` (si la noticia sigue publicada).

En Docker Development, `AuthSchema.sql` crea las dos columnas durante el arranque solo cuando `Development:ApplySchema=true`; **esto no autoriza cambios automáticos en producción**. La prueba CI `scripts/test-cms-news-migration.py` ejecuta la migración tres veces sobre una base descartable.

## Regresión y seguridad

- Crear noticia en borrador: sin permalink aún.
- Publicar: permalink y fecha de modificación presentes; aparece en el sitemap.
- Editar título **y fecha**: URL canónica previa persiste; otras variantes antiguas terminadas en el mismo UUID responden 301.
- Actualizar únicamente atributos no editoriales: `content_modified_at` no se altera; actualizar contenido sí lo hace.
- Despublicar/caducar/eliminar: no reaparece en el sitemap, no hay redirect a contenido privado.
- Guardar contenido desde una versión anterior del panel: el backend ignora cualquier `slug` enviado y conserva el valor almacenado.
- Las pruebas SSR incluyen las rutas `?article=UUID` heredadas.

## Reversión

Si hay una incidencia, revertir **backend + Nuxt** a las imágenes anteriores. Conservar las columnas aditivas en PostgreSQL durante la reversión: eliminarlas no es necesario y podría borrar los slugs ya emitidos. No se ejecuta `DROP` ni se reescriben rutas almacenadas.

## Límites

Esto resuelve la inestabilidad de enlaces, pero Google no garantiza indexar cada noticia. No incluye Google Indexing API (no admitida para artículos generales), ni ajustes de Cloudflare o DNS, ni cambios visuales, ni publicación automática por fuera del flujo actual.
