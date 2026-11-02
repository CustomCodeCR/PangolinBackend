# SEO, GEO y AEO — páginas de servicios de Grupo Castro Fallas

## Alcance (PR #138)
Esta implementación solo incorpora cambios en `feat/seo-geo-service-landings-20261102`, con destino **`main-2`**. No modifica `main`.

Páginas públicas indexables:

- `/servicios/almacenamiento-fiscal`
- `/servicios/bodegaje-general`
- `/servicios/agenciamiento-aduanal`
- `/servicios/consolidadora-de-carga`

No se cambió la estructura visual de `/servicios`; sus enlaces se ofrecen **únicamente desde el menú de navegación de Servicios**, no como tarjetas ni enlaces cruzados en el cuerpo. En el HTML inicial generado se incluye un encabezado de navegación que conserva estos enlaces incluso sin JavaScript.

## Qué implementa cada disciplina

### SEO
- Meta title, meta description, canonical, Open Graph y robots por URL.
- Sitemap XML en sincronía con las páginas públicas.
- HTML semántico inicial con H1, H2, párrafos, listas y preguntas respondidas **sin requerir JavaScript**.
- Rutas inexistentes devuelven 404 según la configuración de Nginx.
- Las rutas privadas existentes continúan en noindex.
- Enlace rastreable a cada servicio en el nav y no duplicado en la página principal.

### GEO (optimización para motores de respuesta)
- Entidad `Organization` y `LocalBusiness` basadas en los datos corporativos que figuran en `frontend/index.html`.
- `Service` con `provider`, `mainEntityOfPage`, `areaServed` (Costa Rica), `availableChannel` y `url` coherentes.
- `WebPage.mainEntity` asociado a `Service`, más `BreadcrumbList` de jerarquía del sitio.
- Páginas con respuestas concretas sobre **quién**, **qué**, **dónde**, **qué información se requiere** y **qué no está garantizado**.
- `OAI-SearchBot` permitido en robots.txt; Googlebot y Bingbot sujetos a la sección general.
- Se evitaron afirmaciones de liderazgo, certificaciones o propiedad de bodegas sin pruebas.

### AEO (optimización para respuestas)
- Respuesta breve y explícita por servicio (`answer`).
- Cinco preguntas con respuestas prácticas por servicio y lengua (ES/EN).
- Lista de documentos y datos para solicitar una cotización.
- Apartado de alcance y disponibilidad para prevenir respuestas inexactas.
- Misma fuente de contenido (`frontend/seo/service-landings.json`) usada en Vue y HTML prerenderizado.

**No se usa `FAQPage` con la promesa de resultados enriquecidos en Google**. Google retiró los resultados enriquecidos de FAQ en 2026. Las respuestas visibles siguen siendo útiles para usuarios y buscadores sin ese marcado.

## Fuente de verdad y claims que exigen verificación empresarial

Datos actualmente respaldados por los propios archivos existentes del proyecto: nombre "Grupo Castro Fallas", ubicación comercial en Curridabat, contacto `comercial@castrofallas.com` y `+506 2272-6772`, y modalidades de servicio declaradas por la empresa.

**Antes de publicar información más específica, confirmar documentalmente**:

- Que cada servicio se ofrece directamente o se coordina mediante proveedores; esto es fundamental para no confundir almacenamiento fiscal con propiedad de un depósito autorizado.
- Instalaciones, direcciones, capacidades, permisos y habilitaciones efectivas de cualquier depósito fiscal o bodega.
- Cobertura real por ciudad, provincia y país, así como restricciones por clase de mercancía.
- Capacidad, rutas, frecuencias, tiempos de tránsito, horarios y condiciones LCL/LTL.
- Alcance profesional y autorizaciones aduaneras vigentes.
- Casos de éxito, referencias públicas y testimonios con aprobación de los clientes.

**No publicar cifras, distintivos, reseñas, licencias o acreditaciones sin respaldo.** Los límites y condiciones se describen en el contenido sin asumir disponibilidad.

## Verificación técnica local o CI

Desde `frontend`:

```bash
npm ci
npm run build
npm run seo:check
node scripts/test-frontend-merge.cjs
node scripts/smoke-browser.cjs
```

Verificar particularmente:
1. Las cuatro rutas sirven HTML que incluye H1, respuesta, condiciones y preguntas frecuentes.
2. El HTML inicial de `/servicios` contiene enlaces a las cuatro rutas **únicamente en el nav**.
3. El cuerpo de páginas individuales no incluye enlaces internos hacia otros servicios.
4. El `Service.provider` es la organización del sitio; su descripción coincide con la respuesta visible.
5. Sitemap y canónicas usan `https://www.logisticacastrofallas.com`; las privadas siguen en `noindex`.
6. En navegador, el menú se abre en escritorio y móvil y la navegación funciona en español e inglés.

## Acciones posteriores al despliegue

Estas acciones **no se realizan por subir una PR**:

1. Verificar que el host oficial `www.logisticacastrofallas.com` sirva los HTML y el sitemap sin bloqueo WAF/robots para Googlebot, Bingbot y OAI-SearchBot.
2. En Google Search Console: inspeccionar y solicitar indexación de cada URL; enviar `/sitemap.xml`; analizar cobertura, clics, impresiones y consultas.
3. En Bing Webmaster Tools: verificar la propiedad, enviar sitemap y revisar indexación.
4. Completar y mantener datos empresariales consistentes en perfiles oficiales (por ejemplo, Google Business Profile y LinkedIn), y obtener menciones independientes auténticas.
5. Medir búsquedas de términos de servicio ("almacenamiento fiscal Costa Rica", "bodegaje general Costa Rica", "agenciamiento aduanal", "consolidadora de carga LCL LTL"), más menciones/citas visibles en respuestas de buscadores con IA, con revisión periódica manual.
6. Confirmar con responsables de la empresa toda afirmación y ampliar casos reales cuando existan documentos y permisos.

El SEO/GEO/AEO mejora las posibilidades de descubrimiento y comprensión, **no garantiza** indexación, posiciones, apariciones en ChatGPT ni que una IA recomiende a la empresa.

## Referencias técnicas

- [Google Search Central: contenido útil y fiable](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Google Search Central: políticas de datos estructurados](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [Cambios de FAQ de Google Search](https://developers.google.com/search/blog/2023/08/howto-faq-changes)
- [OpenAI: rastreadores y agentes](https://platform.openai.com/docs/bots)
