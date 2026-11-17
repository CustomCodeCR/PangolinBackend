# CMS: optimización de imágenes en cada nueva publicación (QA aislado)

## Motivo

La diseñadora publica, edita, despublica y elimina noticias continuamente. Reducir una
fotografía concreta no evita que una nueva subida PNG/JPEG vuelva a pesar varios MB.
En la auditoría pública del 17-11-2026, tres fotografías de Noticias se sirvieron
en 3.574.691 bytes (PNG), 489.334 bytes (WebP) y 312.050 bytes (WebP).
Son mediciones de transferencia de esos recursos, no promesas de Core Web Vitals.

## Lo que el proyecto YA implementa

1. La administradora selecciona **Imagen** en Noticias o en el editor visual;
   `POST /api/admin/content/media/upload` guarda el original y la fila de
   `ManagedMedia` en PostgreSQL. La noticia se guarda con la URL original
   `/api/content/media/{uuid}/file`. No hay cambio en el flujo editorial.
2. **Solo cuando** `CmsMedia:ResponsiveWebpEnabled=true`, el backend intenta
   crear objetos separados `.w360.webp`, `.w720.webp`, `.w1080.webp` y
   `.w1600.webp`, sin ampliar la imagen. Conserva el original aunque el
   codec o la escritura del derivado falle; omite GIF/animaciones, orientación
   EXIF no compatible, dimensiones excesivas y formatos no permitidos.
3. **Solo cuando** `VITE_CMS_RESPONSIVE_WEBP_ENABLED=true` durante el build,
   Vue/Nuxt generan `srcset` para las URLs *canónicas* del CMS. No modifica
   las URLs externas, Base64, fondos CSS ni archivos estáticos.
4. El backend comprueba publicación y caducidad **en cada GET** incluso para
   ETag/304 y peticiones `?width=`. Una variante despublicada deja de ser
   accesible; la respuesta usa caché privada con revalidación. Al borrar
   un archivo del CMS no referenciado, elimina original y derivados.
5. Las imágenes históricas requieren inspección y backfill separados. No se
   convierten automáticamente por activar estas opciones.

## Qué agrega esta PR, sin modificar producción

- `compose.yaml` acepta dos variables **locales** (ambas `false` si no se
  definen):
  - `CMS_RESPONSIVE_WEBP_BACKEND=true` habilita generación para **nuevas**
    subidas en el backend de desarrollo.
  - `CMS_RESPONSIVE_WEBP_FRONTEND=true` habilita `srcset` en Vite;
    ya controlaba los builds Nuxt y Vue legacy del preview.
- `scripts/test-cms-webp-compose.py` comprueba default-off en el conjunto
  local, opt-in simultáneo en backend/Vite/Nuxt/legacy y que los Compose
  de producción no habilitan la generación.
- El smoke test HTTP aislado valida que una imagen usada en noticia publicada
  **o borrador** no puede eliminarse, además de la generación, lectura,
  revocación y limpieza de variantes ya verificadas.

## Procedimiento para una prueba local autorizada

1. Partir de una copia local de `main-2` y un **MinIO/S3 de prueba aislado**
   con credenciales y bucket **distintos** de los de Dhole y producción.
   Jamás usar un `.env` de producción ni enlazar este entorno a MinIO real.
2. Definir `CMS_RESPONSIVE_WEBP_BACKEND=true` y
   `CMS_RESPONSIVE_WEBP_FRONTEND=true` en el entorno de desarrollo.
   Usar el procedimiento habitual de arranque *local* del proyecto y
   reconstruir Nuxt/legacy para incorporar el flag de compilación.
3. Iniciar sesión como administrador local. Subir una noticia ficticia con
   JPEG o PNG de prueba de entre 300 KB y 5 MB, publicarla y abrirla en
   Inicio, listado de Noticias y artículo en móvil/escritorio.
4. En DevTools → Network, comprobar que la imagen de portada conserva su
   `src` original pero su `currentSrc` solicita `?width=...`, responde
   `image/webp`, pesa menos y muestra calidad, recorte, transparencia y
   orientación correctos. Comparar con las opciones desactivadas.
5. Despublicar y comprobar que tanto original como variantes dan HTTP 404
   con `no-store`, también con `If-None-Match`. Un intento de borrar
   un medio aún asignado debe devolver 409; tras retirar referencias
   debe poder borrarse original y derivados.
6. Repetir con archivo pequeño (sin variantes), GIF animado y archivo con
   orientación no compatible: debe mostrarse el original sin roturas.
7. Apagar ambos flags al terminar y reconstruir los frontends locales.
   Confirmar que la experiencia actual regresa sin migrar datos.

La prueba automatizada utiliza PostgreSQL desechable y FakeS3; **no sustituye**
la revisión visual real ni garantiza soporte del MinIO de producción.

## Archivos anteriores / fotografía grande

La imagen PNG de 3.574.691 bytes medida en la web **no se optimiza por
activar la generación para nuevas subidas**. Si corresponde a un objeto S3 del
CMS, primero clasificarla mediante el endpoint administrativo de inventario
(`GET /api/admin/content/media/inventory`), luego realizar
`POST /api/admin/content/media/{id}/webp-backfill` con
`{"apply":false}`. Es solo diagnóstico de una imagen; no modifica objetos.
El `apply:true` requiere otro flag, almacenamiento de pruebas, autorización
de mantenimiento y validación de PUT condicional en el proveedor real.

Las imágenes Base64 embebidas, URL HTTPS externas o `/images/` empaquetadas
son **otros casos**; no forzar su conversión ni atribuirlas a S3 sin inventario.


### Diagnóstico de solo lectura de la foto de Hacienda (17/11/2026)

La consulta pública realizada desde PowerShell confirmó que la noticia
**«HACIENDA REFUERZA EL CONTROL»** sirve su imagen con una URL de 60 caracteres
que coincide con `/api/content/media/{uuid}/file` (CMS / MinIO).
Por tanto es candidata a **inspección**, no a conversión automática.
La medición anterior observó 3.574.691 bytes y MIME `image/png`.
Todavía faltan los datos privados de inventario, tamaño real en S3 y
presencia de variantes antes de declarar que el backfill es elegible.

**Administrador autenticado en el dominio WWW**, DevTools → Console:
ejecutar este código. Solicita solo el registro público de Noticias
y luego `apply:false` para **una sola imagen**. No registra IDs,
enlaces completos ni datos sensibles; no ejecuta migraciones ni PUT/DELETE.

```javascript
(async () => {
  const response = await fetch('/api/content/news', {
    credentials: 'same-origin', cache: 'no-store'
  });
  if (!response.ok) return console.log('Noticias HTTP:', response.status);
  const news = await response.json();
  if (!Array.isArray(news)) return console.log('Lista pública inválida');
  const article = news.find(item =>
    typeof item.title === 'string' &&
    item.title.toUpperCase().includes('HACIENDA REFUERZA EL CONTROL'));
  if (!article) return console.log('Noticia no encontrada');
  const match = /^\/api\/content\/media\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\/file$/i.exec(article.image);
  if (!match) return console.log('La imagen dejó de ser un recurso CMS canónico');

  // Este endpoint administrativo valida S3 con HEAD; jamás aplica cambios.
  const check = await fetch(
    `/api/admin/content/media/${match[1]}/webp-backfill`, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({apply: false})
    }
  );
  if (!check.ok) return console.log('Inspección HTTP:', check.status);
  const result = await check.json();
  console.table([{
    modo: result.mode,
    originalBytes: result.originalBytes,
    variantesExistentes: (result.existingWidths || []).join(', ') || 'ninguna',
    variantesFaltantes: (result.missingWidths || []).join(', ') || 'ninguna',
    originalConservado: result.originalPreserved
  }]);
})();
```

- HTTP **200** con `mode: dry-run`: documentar tamaño original y anchos
  faltantes; ninguna escritura S3.
- HTTP **400**: metadatos/MIME/clave no elegibles para backfill automático.
- HTTP **401/403**: sesión sin permisos administrativos; no intentar burlar permisos.
- HTTP **404**: no se encontró registro u objeto; analizar sin alterar datos.
- HTTP **413**: el original excede el límite de 5 MiB.

Nunca ejecutar `{"apply":true}` durante el diagnóstico. Si el resultado
es elegible, planificar conversión única en un mantenimiento posterior,
con flags autorizados y mediciones antes/después. No activar el
`srcset` público de imágenes históricas sin estudiar el fallback de originales.

## Barreras antes de cualquier despliegue

- PR revisada, CI completo en verde, pruebas visuales en claro/oscuro y
  móvil/escritorio, prueba de S3/MinIO aislado y restauración confirmada.
- Feature flags de backend y build frontend coherentes: no activar
  `srcset` si el backend no admite `?width`.
- Medición antes/después: bytes, tiempos de carga y PageSpeed/LCP/CLS.
  No prometer subida de puntajes de SEO hasta medir y validar contenido.
- Despliegue supervisado con respaldo y opción de revertir ambos flags.
- No tocar Fennec, Cloudflare, DNS ni los archivos de las noticias reales
  durante esta PR. Los archivos de producción GHCR siguen sin el opt-in.

**Estado:** preparación para QA; no se activa la optimización en producción.
