# SEO para buscadores y asistentes de IA — web existente

## Objetivo
Mejorar las señales técnicas sobre servicios de transporte terrestre LTL y FTL entre Panamá y Costa Rica de Grupo Castro Fallas **sin añadir una página nueva ni alterar el diseño visible del sitio**.

## Cambios de esta rama
- Mantener sin alteraciones visuales las vistas Inicio, Servicios y el pie de página.
- Eliminar la landing de pruebas `/transporte-panama-costa-rica/` y todos los enlaces creados hacia ella.
- Mejorar la descripción SEO y los metadatos sociales de `frontend/index.html` para reflejar la ruta y las modalidades indicadas por la empresa.
- Ampliar los datos estructurados Schema.org de la página existente con la organización y el servicio terrestre (LTL/FTL, Panamá/Costa Rica). No se publican rankings ni estadísticas de mercado sin evidencia.
- Actualizar las descripciones de rutas de `Root.vue` sin cambiar la interfaz.
- Corregir la directiva `noindex` aplicada por la aplicación a /servicios, /nosotros y /noticias.
- Mantener `robots.txt` accesible para OAI-SearchBot y las rutas existentes en sitemap, sin inventar rutas.

## Validación local
Desde `frontend`:
```bash
npm ci
npm run build
npm run seo:check
npm run preview -- --port 4173
```
Revisar Inicio y Servicios, verificar que el diseño no tenga enlaces nuevos y que la ruta eliminada **no** esté enlazada. El HTML inicial contiene metadatos y JSON-LD que pueden inspeccionarse con Ver código fuente.
El servidor SPA puede devolver el archivo genérico `index.html` para rutas no encontradas por su fallback; por eso, una respuesta HTTP 200 por sí sola no prueba que la antigua landing siga existiendo.

## Limitaciones y próximos pasos
- La aplicación Vue todavía sirve un HTML inicial genérico para todas las rutas SPA; la corrección de `noindex` se aplica al ejecutar JavaScript. Renderizado por ruta (SSR/prerender) requeriría un trabajo técnico adicional.
- Los datos estructurados deben corresponder a servicios reales y verificables que el usuario puede conocer en el sitio. No se añadirá contenido comercial oculto para rastreadores.
- El sitemap no sustituye la verificación de indexación en Google Search Console. Es necesario comprobar también posibles bloqueos de bots en WAF/CDN.
- Las menciones genuinas en medios, cámaras y directorios especializados y datos verificables de operaciones pueden ayudar a la credibilidad del negocio.
- La aparición en respuestas de ChatGPT o rankings de Google **no está garantizada**.

No modificar `main`, no fusionar ni desplegar hasta una nueva autorización expresa.
