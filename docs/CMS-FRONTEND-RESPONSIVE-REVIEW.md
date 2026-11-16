# Frontend responsive para imágenes del CMS (opcional)

## Qué hace

La web usa el componente `StaticOptimizedImage` tanto en la SPA Vue como en las páginas públicas Nuxt SSR. Esta rama añade `srcset` de 360/720/1080/1600 píxeles y `sizes` específicos para tarjetas de Inicio, portada de Noticias, tarjetas editoriales, artículo completo e imágenes CMS inline del editor visual.

La URL `src` sigue siendo el original inalterado, por ejemplo `/api/content/media/<uuid>/file`. El backend de #224 devuelve WebP si existe un derivado para el ancho solicitado, o devuelve los bytes y MIME auténticos del original si aún no existe. Cada GET comprueba publicación activa en PostgreSQL antes de consultar el objeto o devolver un 304, según las pruebas HTTP de #217 y #224.

**No se construyen variantes** de URL externa, Base64, imágenes estáticas de `/images/`, rutas administrativas, URL con query string o ruta no canónica. Los recursos estáticos precompilados conservan su `<picture>` AVIF/WebP existente.

El componente mantiene **exactamente el mismo elemento `img` como raíz** cuando muestra medios CMS, por lo que no se alteran estilos, recortes, transiciones ni dimensiones. Si falla alguna variante, elimina `srcset` y reintenta el `src` original. Se conservan `loading=lazy` para tarjetas y `fetchpriority=high` para las imágenes principales de artículos.

## Activación controlada

Se usa un **flag de compilación**, `VITE_CMS_RESPONSIVE_WEBP_ENABLED`, que vale `false` por defecto.

En Docker se puede pasar mediante la variable de **build** `CMS_RESPONSIVE_WEBP_FRONTEND`, por defecto `false` en los contenedores SPA legacy y Nuxt. No basta con cambiar la variable después de compilar: requiere reconstruir los frontends, por diseño.

**No activar todavía en producción.** Primero confirmar que el backend de ese entorno tiene `CmsMedia:ResponsiveWebpEnabled=true` y que el almacenamiento contiene variantes reales para las fotos a optimizar. El mantenimiento de imágenes antiguas #225 requiere adicionalmente `CmsMedia:ExistingImageBackfillEnabled=true` **solo durante la operación autorizada**, y después se desactiva. Nunca exponer rutas de administración ni tokens al navegador.

Para validar en entorno aislado:
1. Utilizar fotografías ficticias almacenadas en un S3 de pruebas y consultar `/api/content/media/{id}/file?width=360` tras publicarlas en una noticia de prueba.
2. Verificar el tipo MIME `image/webp`, `Content-Length`, `ETag`, `200/304/206`; despublicar y confirmar `404` antes de S3. Confirmar que una imagen antigua sin derivados responde con su JPEG/PNG original.
3. Construir ambos frontends con `CMS_RESPONSIVE_WEBP_FRONTEND=true`, abrir Noticias, artículos y tarjetas Inicio; inspeccionar Network/CurrentSrc/Rendered Size y comparar móviles/desktop, claro/oscuro y el hero LCP.
4. Comprobar que fuentes externas, videos, PDFs y CSS backgrounds no cambian. El `srcset` no se añade a las imágenes de fondo CSS basadas en `siteCssImage`: esas requieren un diseño aparte.
5. Repetir PageSpeed de `www` y raíz **después** de un despliegue explícitamente aprobado; no asumir ahorros por pruebas offline.

## Pruebas automáticas

- `node frontend/scripts/check-cms-responsive.cjs` valida el helper TypeScript real, el opt-in desactivado, URLs permitidas/rechazadas, los contratos de `sizes`, prioridades LCP y el fallback.
- CI frontend Vue: TypeScript + Vite, smoke Chrome y prueba del helper.
- Workflow `CMS responsive images in Nuxt SSR` compila Nuxt con el flag **activado exclusivamente en CI** y usa datos ficticios en `frontend/nuxt/scripts/test-news-ssr.mjs` para comprobar que el HTML SSR del artículo contiene las cuatro URLs `srcset`, además de canonical, JSON-LD y sitemap.
- No se contacta MinIO real, no se modifica el CMS, ni se ejecuta backfill desde el frontend.

## Limitaciones explícitas

- La foto grande de Noticias de ~3,49 MiB **no ha sido optimizada en producción**. Si no existe un WebP, el endpoint retornará el original. El ahorro real depende de completar el inventario/mantenimiento controlado (#213, #225).
- La imagen hero de Inicio que se pinta como `background-image` CSS no usa `srcset`. Tampoco se sustituyen otras fotos de fondo de servicios para evitar alteraciones visuales inesperadas.
- Una mala coordinación de flags (frontend activo con backend apagado) puede provocar solicitudes 400 y fallback temporal. Por eso ambos permanecen apagados por defecto y se validarán juntos en staging.
