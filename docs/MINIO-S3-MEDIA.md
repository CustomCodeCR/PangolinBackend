# Almacenamiento multimedia compatible con S3 (MinIO AIStor Free)

> Fase de integración, aislada en una rama. No desplegar en producción antes de realizar pruebas y respaldos.

## Por qué MinIO AIStor Free

El repositorio de MinIO Community Edition fue archivado. Para un nodo de desarrollo, el fabricante ofrece
**MinIO AIStor Free**, que requiere obtener una licencia gratuita e instalarla localmente.
Documentación oficial: https://docs.min.io/aistor/installation/container/install/

**No colocar licencias, usuarios o contraseñas en GitHub.** La edición Free tiene condiciones
específicas de licencia y un límite de un nodo.

## Preparación

1. Hacer copia independiente de PostgreSQL y de cualquier almacenamiento multimedia existente.
2. Obtener la licencia AIStor Free en el sitio oficial y guardarla como `docker-secrets/minio.license`.
   La carpeta está excluida en `.gitignore`. No compartirla por chat.
3. Completar en el archivo privado `.env`:
   `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`.
   Usar secretos únicos y robustos.
4. Iniciar únicamente MinIO con:
   `docker compose -f compose.yaml -f compose.minio.yaml up -d minio`.
5. Abrir http://localhost:9001 (solo en equipo local), crear el bucket privado
   `castrofallas-media` y una cuenta de servicio con permisos mínimos
   para operar objetos en él. Poner sus credenciales en `S3_ACCESS_KEY` y `S3_SECRET_KEY`.
6. Iniciar el resto:
   `docker compose -f compose.yaml -f compose.minio.yaml up -d --build`.
   **No usar `docker compose down -v`.**

## Diseño

- `cms_media`: metadatos, `object_key` no adivinable, `mime_type`, `size_bytes`;
  `src` conserva compatibilidad con archivos antiguos.
- Los objetos son **privados**, nunca hay un bucket público.
- El backend administra escritura, lectura y eliminación; el navegador jamás recibe llaves S3.
- Se conservan intactas las noticias y registros preexistentes; antes de retirar los Base64
  antiguos se requiere una migración de datos separada, verificable y con rollback.
- Los enlaces externos HTTPS anteriores siguen siendo válidos.
- El servicio puede apuntar a cualquier proveedor compatible con S3 cambiando la configuración.

## Puertos y despliegue

Los puertos 9000 y 9001 se enlazan únicamente a 127.0.0.1 en desarrollo.
En servidor real, no exponer la consola ni el puerto S3 al público; configurar TLS,
políticas de acceso, monitoreo y copias de seguridad externas al servidor.

## Si falta licencia

No ejecutar el archivo de extensión. El `compose.yaml` original permanece
operativo con almacenamiento legado; el backend no intentará acceder a MinIO
si `Storage:Endpoint` no está configurado.
