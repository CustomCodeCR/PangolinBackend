# Interpretación de website-seo-audit — 23 de noviembre de 2026

Análisis de los informes entregados por QA tras integrar las mejoras de noticias (#298 y #299).
**No usar la puntuación local como puntuación de producción.**

## Resultados observados

| Entorno | Puntuación | Páginas | Hallazgo crítico | Enlaces comprobados |
| --- | --- | --- | --- | ---: |
| Docker `http://192.168.1.26:5173/` | 38/100 (F) | 33 | HTTP en IP local | 0 |
| Docker `http://192.168.1.26:5173/noticias` | 38/100 (F) | 33 | HTTP en IP local | 0 |
| Producción `https://www.logisticacastrofallas.com/` | 56/100 (D) | 22 | `/cdn-cgi/l/email-protection` responde 404 | 12 |

Estas auditorías rastrean más páginas desde el listado de Noticias (por la navegación común), y el informe local **no verificó enlaces**, por lo que no demuestra ausencia de enlaces rotos. La puntuación agrega advertencias de severidad desigual.

## Diagnóstico y decisión

1. **HTTP local**: esperado; el entorno LAN no expone HTTPS. No emitir certificados ni exponer el servidor local para subir la puntuación.
2. **21 canonical externos de Docker**: apuntan deliberadamente al dominio público definitivo `https://www.logisticacastrofallas.com/`. **No cambiar canonical hacia 192.168.x.x**; se indexaría una dirección de pruebas.
3. **11 `noindex` y ausencia de canonical en páginas privadas/interactivas**: login, tracking, cotizaciones y parámetros de cotización. Son intencionales; no requieren SEO público ni contenido artificial. El HTML privado puede no incluir un H1 SSR cuando usa Vue cliente.
4. **`/home` y `/` aparentemente duplicados en auditoría**: el rastreador sigue redirecciones y lista `/home` como 200 aunque el servidor tenga un 301. Tanto el gateway productivo (`deploy/nuxt-hybrid-gateway.conf`) como Nuxt (`frontend/nuxt/nuxt.config.ts`) declaran 301 hacia `/`; conservar y verificar HTTP directamente antes del despliegue. Ya hay tests automáticos de ese contrato.
5. **`/cdn-cgi/l/email-protection` 404**: ruta generada por Cloudflare Email Address Obfuscation, documentada oficialmente. No está en el código de Pangolin como enlace interno. El navegador con JavaScript puede restaurar el correo mediante su decodificador. **No desactivar la protección ni exponer correos para mejorar la puntuación** sin decisión de seguridad/negocio.
6. **Imágenes `alt=""`**: varias son realmente decorativas, como el carrusel visual de portada de Noticias, la imagen lateral repetida y las fotografías de cards `aria-hidden="true"` de Servicios/Estructura. Vaciar `alt` es correcto en esos contextos; no convertir cada alerta de herramienta en un texto redundante. Las imágenes informativas de artículos y galerías tienen `:alt` de contenido.
7. **Título excesivo de 103 caracteres en noticia `42ed9cb4`**: sí es un cambio no visual aplicable. Se conserva el encabezado periodístico original y se introduce un título SEO corto y específico en `frontend/nuxt/app/pages/noticias/[slug].vue`, con regresión de SSR.
8. **`Thin content` de Noticias/ejemplos**: no agregar texto de relleno. Los cuatro artículos locales son registros de prueba, diferentes de los reales. Un mejor resumen editorial requiere contenido aprobado.
9. **URL permanentes y 404 tras eliminación**: auditadas en Docker con pruebas específicas por HTTP; un crawler genérico no comprueba necesariamente URLs eliminadas. Mantenimiento por #298/#299.

## Antes de pasar a producción

- Volver a auditar `https://www.logisticacastrofallas.com/` **después de desplegar**; no comparar directamente F local con D producción.
- Confirmar `curl.exe -I --max-redirs 0 https://www.logisticacastrofallas.com/home` da **301** con Location hacia `/` (no confundir con el destino 200 que lista el crawler).
- Confirmar sitemap, canonical, noticias publicadas, news deleted 404, esquemas `Article` y ausencia de enlaces internos inesperados.
- **Importante por #298:** aplicar previamente en producción con respaldo probado la migración aditiva `backend/Database/CmsNewsPermalinksMigration.sql`; nunca promover cambios del backend a producción sin la migración.

## Fuentes

- Informes QA del 23-11-2026: `seo-main2-noticias.md`, `seo-main2-inicio.md`, `seo-produccion.md` (aportados externamente, no contienen secretos).
- Cloudflare: https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/
- Cloudflare: https://developers.cloudflare.com/fundamentals/reference/cdn-cgi-endpoint/
