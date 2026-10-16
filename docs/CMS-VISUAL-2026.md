# CMS visual de páginas · Inicio, Servicios, Nosotros y Acceso

**Rama:** `feature/visual-site-cms-20261016` · No fusionar sin prueba visual.

## Qué administra

Desde `/administracion` → **Contenido** → **Editor visual**, un administrador real puede
seleccionar página/ubicación y editar los textos en español e inglés o asignar una imagen/video.
Cada ubicación tiene nombre humano, explicación y vista previa de lo publicado y del borrador.
La biblioteca de MinIO se reutiliza; una foto puede asignarse a distintas secciones sin
alterar otros usos del mismo archivo.

**Las noticias siguen con su propio CMS**, no se modificaron. Los contenidos originales
de Vue y las traducciones permanecen como valores predeterminados hasta que se publique
una personalización, por lo que un despliegue sin registros funciona como antes.

## Persistencia

- Nueva tabla `public.cms_site_slots` en PostgreSQL, migración SQL aditiva (no borra tablas).
- `key`: ubicación fija y validada en API; no HTML ni Markdown inyectado.
- `draft_es`, `draft_en`, `draft_media_id`: borrador, invisible para visitantes.
- `published_es`, `published_en`, `published_media_id`: contenido visible.
- `updated_at` y `published_at` para fecha; no es un historial completo de versiones.
- El objeto binario sigue viviendo en MinIO, con metadatos en `cms_media`.
- `restore` vuelve al texto/foto original del código, sin destruir archivos S3.
- El borrado de un objeto se bloquea si está asignado en borrador o publicación.

## API

Pública:
- `GET /api/content/site`: exclusivamente asignaciones publicadas. Sin caché compartida.

Administración autenticada:
- `GET /api/admin/content/site`: borradores y publicaciones.
- `PUT /api/admin/content/site/{key}` JSON `{ "textEs":"...", "textEn":"...", "mediaId":null }`.
  Para espacios visuales, `textEs` y `textEn` nulos y `mediaId` UUID o null.
- `POST /api/admin/content/site/{key}/publish`: publicar el borrador.
- `POST /api/admin/content/site/{key}/restore`: restaurar valores originales.
- Se reutilizan `GET /api/admin/content/media`, `POST /api/admin/content/media/upload`.

Las claves de ubicación están validadas por la API; el catálogo visual está en
`frontend/src/siteCms.ts`. No se admiten ubicaciones arbitrarias desde el navegador.

## Video y accesibilidad

Admite videos MP4 y WebM almacenados en S3, hasta 20 MB por objeto en esta etapa.
Los videos decorativos se muestran silenciados, en bucle y sin interacciones sobrepuestas.
Con preferencia de movimiento reducido se desactiva la reproducción automática.
No se aceptan iframes ni contenido SVG/HTML. El logo corporativo acepta solo imágenes.
La imagen/video solo se hace público cuando la ubicación ha sido **publicada**.
La velocidad y búsqueda de videos dependen del soporte de peticiones HTTP Range; debe
verificarse con videos reales antes de pasar a producción.

## Pruebas locales

1. Respaldar `login` y el volumen S3, no usar `docker compose down -v`.
2. Rama nueva y `.env` existente con licencia de MinIO AIStor Free.
3. Levantar `docker compose -f compose.yaml -f compose.minio.yaml up -d --build`.
4. Abrir `http://localhost:5173/administracion` como admin **real**.
5. Abrir `Editor visual`, elegir `Inicio → Portada principal`, subir imagen/video.
6. **Guardar borrador**: comprobar que `/home` sigue mostrando el original.
7. **Publicar**: refrescar `/home`, comprobar nuevo archivo.
8. **Restaurar original** y verificar que vuelve la imagen original.
9. Probar título ES/EN cambiando idioma y verificar acceso público de textos.
10. En MinIO `castrofallas-media` verificar objeto sin cambios en otras secciones.
11. Repetir desde móvil: header responsive, botones, textos largos, imágenes/video.

## Siguiente fase

Esta PR instala el sistema base y cubre un **primer catálogo** en Home, Servicios,
Nosotros, Acceso e identidad. Queda pendiente inventariar todos los textos restantes,
otras rutas, legal, itinerarios, tracking, contactos, microcopys y modales, así como
previsualización exacta en la página y un historial de revisiones.
No está todavía listo para publicar en producción sin pruebas visuales/manuales.
