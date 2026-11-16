# Prueba MinIO real, sin tocar almacenamiento compartido

## Por qué
La PR #224 cubre subida y lectura de derivados WebP en un FakeS3 aislado, #225 comprueba el mantenimiento de archivos antiguos con una carrera S3 412 simulada y #226 valida `srcset/sizes` en Vue y Nuxt SSR. Falta verificar contra un proveedor MinIO verdadero que el cliente AWS S3 utilice realmente `If-None-Match: *` para impedir reescritura de derivados.

## Alcance de esta PR
El workflow `CMS real MinIO contract (disposable, loopback only)` crea **un MinIO nuevo y desechable** en GitHub Actions, con puerto **solo** `127.0.0.1:19119`, credenciales de prueba fijas y **sin volúmenes persistentes**. No lee secretos ni configuraciones de la empresa. Su contenedor se borra al terminar, incluso cuando falle el test.

La prueba .NET compila directamente el código fuente real de `ObjectStorageService` y `CmsImageVariants` y comprueba:
1. MinIO responde a `HEAD` para objeto ausente y presente.
2. Carga intacta de JPEG original desde la muestra pública del repositorio.
3. Generación real de WebP 360px con SkiaSharp, de menor tamaño y decodificable.
4. Primera subida `UploadIfAbsentAsync` exitosa; segundo intento sobre la misma clave, con contenido diferente, **rechazado sin sobrescribir**.
5. Descarga byte por byte del JPEG y WebP, consulta de MIME WebP y `Range: bytes=0-3`.
6. Eliminación del derivado sin alterar el original, y limpieza de bucket desechable.

El harness aborta fuera de CI o si encuentra variables de almacenamiento real en el proceso. La URL y las credenciales de la prueba son constantes locales y no provienen del entorno.

## Lo que todavía no prueba
- No prueba un despliegue con **el MinIO real de Castro Fallas**: ello requiere aprobación separada, acceso mínimo y comprobación de la versión/configuración exacta.
- No ejecuta las migraciones sobre fotografías históricas reales, no toca PostgreSQL compartido ni activa el flag `CmsMedia:ResponsiveWebpEnabled`.
- No certifica una mejora PageSpeed ni cambia frontend: ese beneficio se medirá una vez que se habiliten variantes y `srcset` de forma coordinada en staging.

## Procedimiento posterior
Después de CI verde, revisión y fusión autorizadas: inventariar primero las imágenes CMS existentes **sin escribir**, confirmar si la foto de noticias de ~3,49 MiB es `ManagedMedia` con `ObjectKey`, validar compatibilidad de la versión real de MinIO en un entorno de prueba y planear la conversión controlada de imágenes seleccionadas. Nunca activar el backfill global ni sobreescribir originales.
