# Imágenes Base64 de Noticias: entrega binaria sin migración

## Situación confirmada en el inventario local

Cuatro noticias publicadas tienen imágenes `inline-base64`. Tamaños aproximados de las imágenes codificadas: **371, 200, 130 y 41 KiB**, en conjunto **0,72 MiB de bytes de imagen**. No hay pruebas de que la fotografía de 3,49 MiB vista antes en PageSpeed sea una de estas imágenes; **no** atribuirle el problema sin examinar la petición exacta.

El inventario observó que las noticias **no** usan todavía el almacenamiento S3 del CMS. Por eso activar el backfill WebP de #225 no les cambiaría las imágenes.

## Qué hace esta PR

Nuevo contrato, opt-in:
- Con `CmsNews:BinaryImageDeliveryEnabled=true`, `GET /api/content/news` sustituye únicamente imágenes `data:image/(png|jpeg|webp|gif);base64,...` válidas en su prefijo, con una longitud limitada, por `/api/content/news/{id}/image`.
- `GET /api/content/news/{id}/image` comprueba **publicación y vencimiento** contra PostgreSQL antes de retornar el binario de la fotografía. Solo admite PNG, JPEG, WebP y GIF con firmas de archivo verificadas y tamaño limitado, sin HTML, SVG ni URL de terceros. La respuesta usa `X-Content-Type-Options: nosniff`.
- Usa `ETag` calculado a partir del **contenido**, `private, no-cache, must-revalidate`, `304` y rangos nativos `206`. En caso de despublicación, eliminación o vencimiento se devuelve `404` con `no-store`, sin exponer la imagen.
- El editor administrativo sigue recibiendo y guardando la **imagen Base64 original** sin cambios. Los `src` HTTPS, estáticos y los subidos a S3 siguen exactamente iguales.
- Como Nuxt SSR obtiene las noticias de la API pública, su HTML, hidratación, tarjetas y carruseles referencian imágenes por URL en vez de serializar decenas de kilobytes de Base64 dentro del JSON/HTML. **No cambia CSS ni diseño**.
- Las imágenes se entregan en su **formato original**; no se convierten automáticamente a WebP ni se migran a MinIO. El ahorro se produce al quitar el Base64 del JSON/HTML, permitir caché con revalidación y dejar que el navegador solicite las imágenes que necesita. El peso total de bytes de imagen no desaparece.

## Activación y reversión

Config:
- Backend: `CmsNews:BinaryImageDeliveryEnabled`
- Docker Compose dev/production: variable **`CMS_NEWS_BINARY_IMAGES`**, por defecto `false`.
- Para una prueba local autorizada, usar `CMS_NEWS_BINARY_IMAGES=true` al reconstruir **solo el backend**. No requiere cambios en Nuxt, frontend ni S3.
- Para revertir: `CMS_NEWS_BINARY_IMAGES=false`, reconstruir backend; la API pública vuelve a devolver las imágenes embebidas como antes. El endpoint binario permanece funcional para manejar referencias previamente cacheadas en Nuxt durante la transición.
- En `main-2` y `main` queda desactivado salvo activación explícita. **Nunca activar producción automáticamente.**

## Pruebas automatizadas

En `scripts/test-cms-media-http.py` con PostgreSQL y S3 simulado **aislados** se habilita la opción solo en CI:
1. Noticia con PNG Base64 obtiene URL pública y JSON sin Base64; URL S3/HTTPS/`/images/` siguen intactas.
2. Admin `/api/admin/content/news` continúa devolviendo la cadena Base64 original para edición.
3. El endpoint público devuelve los bytes PNG exactos, `image/png`, `nosniff`, caché privada con revalidación, `ETag`, `304` y `206`.
4. Despublicar o vencer la noticia invalida la URL, incluso con `If-None-Match`; devuelve `404` con `no-store`.
5. Cero consultas al almacenamiento S3 en la entrega de imágenes Base64.

## Paso siguiente

Con CI verde y PR integrada en `main-2`, activar el flag únicamente en **Docker local**, medir en Chrome Network el tamaño de `/api/content/news` antes/después, comprobar Inicio/Noticias/Noticia/Administración y luego desactivar si surge un fallo. Solo tras QA y medición se decidirá si hace falta migración WebP a S3 o si la ganancia de separar los binarios es suficiente.

No tocar registros reales, producción, MinIO ni `main` sin autorización específica.
