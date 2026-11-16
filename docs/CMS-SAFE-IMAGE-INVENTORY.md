# Inventario de imágenes existentes del CMS (solo lectura)

## Propósito

Antes de ejecutar un backfill WebP en Castro Fallas hay que determinar si cada imagen publicada es una carga real del CMS en S3/MinIO, un enlace externo HTTPS, un recurso estático de `/images/` o una imagen Base64 embebida en una noticia. **No se puede asumir que el archivo de Noticias de ~3,49 MiB esté en S3.**

## Endpoint administrativo

`GET /api/admin/content/media/inventory`, **solo administrador autenticado**.

- Acceso **read-only a PostgreSQL**. No llama a servicios S3, no descarga datos binarios, no cambia registros, no crea medios ni publica noticias.
- Los campos grandes de imágenes se procesan **dentro de PostgreSQL**, proyectando únicamente `length` y `substring` de máximo 128 caracteres. Evita transferir a la API valores Base64 largos o URL completas para analizarlas.
- Devuelve `Cache-Control: private, no-store`. No devuelve las URL originales, claves de objetos S3 ni contenido Base64.
- Clasifica `news[].sourceType` como `cms-media`, `inline-base64`, `external-https`, `bundled-static`, `empty` u `other`.
- Para imágenes Base64 informa `estimatedInlineBytes` aproximados (sin conocer los caracteres finales de padding). Para archivos S3 informa el tamaño registrado en `ManagedMedia.SizeBytes`, **que es metadata de PostgreSQL, no un HEAD confirmado contra S3**.
- Devuelve `media[].backfillCandidate` solo cuando el objeto es una imagen JPEG, PNG o WebP, con MIME reconocido, clave S3 canónica compatible con `CmsMediaBackfillEndpoints`, relación URL/id válida y tamaño registrado entre 1 byte y 5 MiB.
- Incluye referencias de Noticias y ranuras del editor visual, tanto publicadas como borrador, sin incluir sus textos.
- Ordena Noticias por longitud descendente y medios por tamaño descendente para facilitar encontrar archivos grandes. Cada lista se limita a 500 registros, incluye `moreNews`, `moreMedia` y `moreSlots` para evitar tratar resultados truncados como completos. Si un enlace CMS no encuentra registro dentro del límite se marca `mediaReferenceVerified:false`, **no** se afirma que el objeto no existe.

## Qué NO hace ni comprueba

- No confirma si los objetos se encuentran físicamente en MinIO ni si ya existen variantes WebP; esa operación requiere el `dry-run` individual de #225 y acceso autorizado al almacenamiento correspondiente.
- No analiza el peso de enlaces HTTPS externos ni archivos empaquetados en `/images/`; para ellos necesitaríamos otra ruta de optimización.
- No elimina imágenes, no inicia conversiones, no activa los flags `CmsMedia:ResponsiveWebpEnabled`, `CmsMedia:ExistingImageBackfillEnabled` ni `CMS_RESPONSIVE_WEBP_FRONTEND`.
- No se ha ejecutado sobre la base de datos real. Para identificar la foto de ~3,49 MiB, habrá que consultar este endpoint **después de integrar la PR en un entorno autorizado**.

## Pruebas

`scripts/test-cms-media-http.py` ahora crea en PostgreSQL desechable cuatro noticias ficticias (S3 CMS, Base64, HTTPS externa y recurso estático), inspecciona el inventario y comprueba:
- un visitante anónimo recibe 401;
- el administrador recibe 200 y `no-store`;
- ni el original Base64 ni la URL externa aparecen en la respuesta;
- no hay ni una consulta HEAD/GET ni escritura PUT a FakeS3 durante el inventario;
- se identifica correctamente la noticia con imagen CMS y su elegibilidad para backfill.

El workflow de HTTP del CMS ejecuta estas pruebas en CI sobre PostgreSQL y FakeS3 temporales. La PR no toca `main-2`, `main` ni producción hasta obtener autorización para fusionarla.
