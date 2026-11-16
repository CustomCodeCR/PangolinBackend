# CMS: derivados WebP responsivos (PR #224)

## Alcance y seguridad

Esta PR agrega generación de derivados **únicamente para futuras subidas al CMS** y solo con `CmsMedia:ResponsiveWebpEnabled=true`. La opción está **desactivada por defecto** y no se activa en `compose.yaml` ni en `compose.production.yaml`.

- Las imágenes JPEG, PNG o WebP válidas, estáticas y con orientación EXIF normal pueden producir variantes de 360, 720, 1080 y 1600 píxeles; nunca se amplían. GIF animado, APNG animado, video, PDF, URLs externas, data URI y archivos legacy no se transforman.
- Se validan ancho, alto, máximo 10 000 por eje y máximo 16 millones de píxeles **antes de decodificar**. Se limita a una conversión simultánea por proceso, con espera máxima de tres segundos.
- La subida almacena siempre el original. Si la generación, la librería nativa o una subida de derivado falla, el original queda íntegro y publicado normalmente. Los derivados son objetos separados de nombre determinista: `{clave_original}.w{ancho}.webp`.
- El borrado administrativo solo se permite si no hay referencias desde noticias o editor visual; al borrar elimina el original y derivados. No borra archivos de medios todavía utilizados.
- **En cada GET público**, el backend comprueba publicación activa en PostgreSQL *antes* de consultar metadatos S3, descargar y evaluar `If-None-Match`. Ni versiones originales ni WebP usan caché pública duradera: `private, no-cache, must-revalidate`. Borradores, despublicadas y noticias caducadas devuelven 404 con `no-store`.
- GET público `/api/content/media/{id}/file?width=360` usa WebP si el objeto existe, y si no existe utiliza los mismos bytes, MIME y ETag del original. Los ETags de variantes son distintos de los originales. `Range` sigue devolviendo 206 de los bytes elegidos.
- La API administrativa sigue descargando el original, con `no-store`. Un ancho fuera de la lista blanca obtiene 400 solo después de comprobar autorización de publicación.

## Pruebas

El workflow `CMS media ETag and revocation (isolated HTTP)` usa PostgreSQL desechable y servidor S3 local simulado, sin credenciales ni conexión a MinIO real. El caso añadido verifica generación del derivado, original inalterado, MIME WebP, 200, 304, 206, ETag diferente, 404 tras despublicar, autorización antes de S3 HEAD, restauración y limpieza al borrar el medio. El ciclo legado con PNG de 1×1 prueba fallback cuando no se genera derivado.

## Pendiente antes de uso real

1. Revisar dependencia SkiaSharp 4.153.1 y librerías nativas en todas las arquitecturas efectivamente desplegadas. El harness aislado en PR #223 sirve como precedente técnico, no equivale a validación completa en producción.
2. Habilitar el feature flag **solo en entorno de prueba autorizado** y subir fotografías ficticias, revisando color, recorte, orientación, transparencia y calidad en Chrome, Firefox, Safari, escritorio y celular.
3. Agregar `srcset/sizes` **solo cuando se conozca que las variantes existen**. Emitirlo indiscriminadamente para archivos antiguos añadiría HEAD de S3 sin ahorro y podría empeorar el LCP.
4. Diseñar una migración de derivados para medios CMS ya existentes (incluida la foto de noticias de ~3,49 MiB), con autorización explícita, inventario previo, límites de recursos, sin sobrescribir originales y con reversión.
5. Medir PageSpeed en `www` y raíz **después** de un despliegue autorizado. Ni los resultados offline ni el éxito de CI garantizan puntuaciones finales.

**No cambiar MinIO real, `main`, Fennec, Cloudflare ni producción durante esta PR.**
