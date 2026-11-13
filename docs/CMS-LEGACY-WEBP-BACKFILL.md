# Backfill WebP de fotografías históricas del CMS (PR de revisión)

## Problema

Las variantes WebP incorporadas en #224 solamente se generan al **subir** un archivo nuevo. Una fotografía antigua del CMS puede conservarse como JPEG original aunque el backend admita consultas `?width=360|720|1080|1600`. Una URL externa, Base64 o un enlace sin `ManagedMedia.ObjectKey` tampoco es un objeto CMS de MinIO y no debe convertirse automáticamente.

## Endpoint administrativo (sin ejecución automática)

`POST /api/admin/content/media/{id}/webp-backfill`, con cookie JWT de administrador.

Payload de inspección: `{"apply":false}`.

- Devuelve `originalBytes`, `existingWidths`, `missingWidths` y `mode: "dry-run"`.
- No descarga el archivo original ni escribe objetos S3.
- Valida que la imagen exista en la base de datos y que su objeto tenga una clave canónica `media/{uuid}.{jpg|jpeg|png|webp}`, `Kind=Imagen` y MIME permitido.
- Obtiene el tamaño real desde HEAD en S3 y rechaza originales de más de 5 MiB.
- El resultado administrativo usa `Cache-Control: private, no-store`.

Payload de mantenimiento explícito: `{"apply":true}`.

- Requiere **ambas** opciones `CmsMedia:ResponsiveWebpEnabled=true` y `CmsMedia:ExistingImageBackfillEnabled=true`. Las dos quedan sin declarar en Docker/producción y equivalen a **false por defecto**.
- Procesa **una imagen por solicitud**, una conversión administrativa a la vez por proceso. No hay barrido de bucket, job en segundo plano, endpoint público ni ejecución automática.
- Vuelve a verificar qué variantes existen y genera **solo las que faltan**, usando `CmsImageVariants.EncodeAsync` que ya limita dimensiones, animaciones, orientación y concurrencia.
- Limita la descarga del original a 5 MiB tanto por HEAD como por lectura real del stream. Si el original cambia de tamaño entre HEAD y GET se detiene.
- Conserva el original y la fila de PostgreSQL. No cambia la publicación, el nombre ni los enlaces.
- Las variantes existentes no se reescriben. Además de HEAD y la exclusión local, cada PUT de mantenimiento exige `If-None-Match: *` al proveedor S3: ante un objeto que apareció concurrentemente, el servidor devuelve HTTP 412 y el código lo reporta como existente sin sobrescribirlo. **Verificar en staging que la versión real de MinIO acepta PUT condicional**; si no lo soporta, el mantenimiento debe permanecer deshabilitado.

## Pruebas y límites

La prueba integrada arranca PostgreSQL temporal y FakeS3 loopback, crea una imagen ficticia, elimina solo sus variantes en FakeS3 para simular el estado de un archivo antiguo y ejecuta inspección, generación, segundo intento idempotente y despublicación. No contacta MinIO ni otras fuentes reales.

**Este cambio no migra ninguna fotografía real ni habilita `srcset` en frontend.** Antes del primer backfill fuera de CI: identificar el ID del medio sin exponer datos privados, confirmar que la foto pertenece a CMS S3 y no a URL externa, obtener autorización de mantenimiento y disponer de pruebas de carga/rollback en staging. No eliminar originales ni activar en producción.
