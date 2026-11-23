import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
const base = path.resolve(import.meta.dirname, '..')
const source = f => fs.readFileSync(path.resolve(base, f), 'utf8')
const companies = JSON.parse(fs.readFileSync(path.resolve(base, '../seo/companies.json'), 'utf8'))
const keywords = JSON.parse(fs.readFileSync(path.resolve(base, '../seo/keyword-map.json'), 'utf8'))
const guides = JSON.parse(fs.readFileSync(path.resolve(base, '../seo/service-landings.json'), 'utf8'))
const newServices = JSON.parse(fs.readFileSync(path.resolve(base, '../seo/service-pages.json'), 'utf8'))
const serviceFaqs = JSON.parse(fs.readFileSync(path.resolve(base, '../seo/service-faqs.json'), 'utf8'))
// Each service has one canonical, human-readable search intent. The large
// keyword inventory is editorial planning data, not a meta-keywords tag.
const routeSeo = JSON.parse(fs.readFileSync(path.resolve(base, '../seo/routes.json'), 'utf8'))
const targetedServiceRoutes = [
  '/servicios/almacenamiento-fiscal',
  '/servicios/agenciamiento-aduanal',
  '/servicios/consolidadora-de-carga',
  '/servicios/transporte-maritimo',
  '/servicios/transporte-aereo',
  '/servicios/transporte-local',
  '/servicios/transporte-terrestre',
  '/servicios/transporte-panama-costa-rica'
]
for (const route of targetedServiceRoutes) {
  assert.ok(keywords[route]?.primary && keywords[route]?.secondary?.length >= 3,
    'Falta estrategia SEO de búsqueda por servicio: ' + route)
  const seo = routeSeo[route]
  assert.ok(seo?.title?.endsWith('Castro Fallas') && seo.title.length <= 60 &&
    seo?.description?.length >= 95 && seo.description.length <= 165,
    'Título y descripción SEO específicos, cortos y legibles faltantes: ' + route)
  assert.ok(!/3PL|4PL|HAZMAT|flotilla propia/i.test(seo.description),
    'No publicar promesas de servicios no confirmados: ' + route)
}
for (const route of [
  '/servicios/almacenamiento-fiscal','/servicios/agenciamiento-aduanal',
  '/servicios/consolidadora-de-carga','/servicios/transporte-maritimo',
  '/servicios/transporte-aereo',
  '/servicios/transporte-local'
]) {
  assert.ok(keywords[route].clusters && keywords[route].validationRequired?.length,
    'Conservar las familias de búsqueda y términos pendientes de validar: ' + route)
}
assert.equal(keywords['/servicios/transporte-internacional'], undefined,
  'El catálogo de búsqueda no debe anunciar la página retirada de transporte internacional')
assert.equal(routeSeo['/servicios/bodegaje-general'], undefined, 'Bodegaje general no debe seguir publicado como página');
assert.equal(routeSeo['/servicios/transporte-internacional'], undefined, 'Transporte internacional retirado no debe conservar página');
assert.equal(routeSeo['/servicios/transporte-multimodal'], undefined,
  'No agregar una nueva ruta de multimodal fuera del catálogo aprobado')
const publicServiceSeo = source('app/pages/servicios/[slug].vue')
assert.match(publicServiceSeo, /import routeSeo from '\.\.\/\.\.\/\.\.\/\.\.\/seo\/routes\.json'/,
  'El SSR de servicios debe leer el mapa canónico de títulos y descripciones')
assert.match(publicServiceSeo, /const metaDescription = seoMeta\?\.description \?\? description\.slice\(0, 160\)/,
  'La metadescripción SSR debe coincidir con el HTML estático')
assert.match(publicServiceSeo, /description: metaDescription/,
  'Nuxt no debe sobrescribir los metadatos optimizados con párrafos de guía')
assert.equal(Object.keys(guides).length, 3, 'Se esperan tres guías especializadas')
for (const [route, guide] of Object.entries(guides)) {
  assert.ok(route.startsWith('/servicios/'), 'Ruta de servicio inválida: ' + route)
  assert.ok(guide.es.title && guide.es.answer && guide.es.faq?.length >= 5, 'Contenido AEO incompleto: ' + route)
}
assert.equal(newServices.length, 5, 'Se esperan cinco páginas activas de transporte')
assert.equal(new Set(newServices.map(item => item.slug)).size, newServices.length, 'Slugs duplicados en servicios')
for (const item of newServices) {
  assert.ok(item.slug && item.title?.es && item.title?.en && item.lead?.es, 'Contenido bilingüe de servicio incompleto')
  assert.ok(serviceFaqs[item.slug]?.length >= 2, 'Faltan preguntas frecuentes en: ' + item.slug)
}
assert.match(source('app/pages/servicios/[slug].vue'), /LegacyServiceLanding/, 'Los cinco transportes usan el diseño unificado en Nuxt')
assert.match(source('server/routes/sitemap.xml.ts'), /servicePages/, 'Las páginas nuevas faltan del sitemap de Nuxt')
assert.match(source('nuxt.config.ts'), /servicePages\.map/, 'Las páginas nuevas faltan del prerender')
assert.match(source('scripts/stage-public.mjs'), /BingSiteAuth.xml/, 'Falta publicar verificación Bing en Nuxt')
assert.match(source('scripts/stage-public.mjs'), /llms.txt/, 'Falta publicar llms.txt en Nuxt')
for (const [slug, company] of Object.entries(companies)) {
  assert.ok(company.name && company.description && company.faq?.length >= 2, 'Empresa incompleta: ' + slug)
  assert.ok(keywords['/empresas/' + slug]?.primary, 'Falta palabra clave: ' + slug)
}
// Corporate pages are unpublished until their design and copy are approved.
assert.doesNotMatch(source('server/routes/sitemap.xml.ts'), /import companies|['"]\/empresas/, 'El sitemap no debe publicar empresas')
assert.doesNotMatch(source('nuxt.config.ts'), /import companies|['"]\/empresas/, 'No generar rutas de empresas')
for (const page of ['app/pages/empresas/index.vue', 'app/pages/empresas/[slug].vue']) {
  assert.equal(fs.existsSync(path.resolve(base, page)), false, 'La ruta corporativa debe estar retirada: ' + page)
}
assert.doesNotMatch(source('../src/components/SiteFooter.vue'), /href="\/empresas"/, 'El footer no debe mostrar Empresas del grupo en Accesos')
assert.doesNotMatch(source('../src/components/SiteFooter.vue'), /<h3\b/, 'El pie de página no debe saltar de H1 a H3 en noticias')
assert.match(source('../src/components/SiteFooter.vue'), /<h2\b/, 'El pie de página debe usar H2 para sus grupos')
assert.match(source('../src/style.css'), /\.site-footer h2\{font-size:13px;margin:1px 0 14px\}/, 'El diseño del pie debe conservarse después del cambio semántico')
assert.match(source('../../deploy/nuxt-hybrid-gateway.conf'), /location = \/home\s*\{\s*return 301 https:\/\/www\.logisticacastrofallas\.com\/;/, 'El alias /home debe redirigir directamente al dominio HTTPS canónico')
// The six Home accordion labels and the Panama headline must preserve
// readable solid colors in both themes (including the expanded active tab).
const homeAccordion = source('../src/Home.vue')
assert.match(homeAccordion, /:data-service-key="service.key"/,
  'Cada pestaña del Inicio necesita una clave estable para sus estilos')
for (const [theme, color] of [['html:not(.theme-dark)', '#b00929'], ['html.theme-dark', '#fff']]) {
  const labelRule = homeAccordion.slice(homeAccordion.indexOf(theme + ' .app-site.home-page #servicios .service-accordion__item .service-accordion__trigger .service-accordion__name {'))
  assert.ok(labelRule.startsWith(theme + ' .app-site.home-page #servicios .service-accordion__item .service-accordion__trigger .service-accordion__name {') &&
    labelRule.slice(0, 235).includes('color: ' + color + ' !important') &&
    labelRule.slice(0, 235).includes('-webkit-text-fill-color: ' + color + ' !important') &&
    labelRule.slice(0, 245).includes('-webkit-text-stroke: 0 transparent !important'),
    'El nombre vertical debe ser sólido ' + color + ' en ' + theme)
  assert.ok(homeAccordion.includes(theme + ' .app-site.home-page #servicios .service-accordion__item[data-service-key="Panama"] .service-accordion__copy h3 {') &&
    homeAccordion.includes('color: ' + color + ' !important'),
    'El título Panamá–Costa Rica debe respetar el tema ' + theme)
}
assert.match(homeAccordion, /\.service-accordion__item\.is-open > \.service-accordion__trigger\s*\{\s*background: #fff0f4 !important;/,
  'La pestaña abierta clara necesita un fondo que contraste con su texto rojo')
const serviceIndex = source('../src/pages/Services.vue')
assert.match(serviceIndex, /serviceDirectory/, 'El catálogo necesita enlaces HTML rastreables')
assert.match(serviceIndex, /servicePages\.map/, 'Deben enlazarse los cinco transportes desde Servicios')
assert.match(serviceIndex, /Object\.entries\(serviceGuides\)/, 'Deben enlazarse las tres guías desde Servicios')
assert.match(serviceIndex, /:href="link.href"/, 'Cada tarjeta debe seguir siendo un enlace HTML real')
assert.match(serviceIndex, /services-directory__categories/, 'El carrusel debe permitir cambiar de categoría')
assert.match(serviceIndex, /v-show="activeDirectoryCategory === group.id"/, 'Solo una categoría puede estar visible')
assert.match(serviceIndex, /v-for="repeat in 5"/, 'Cinco secuencias cierran un loop sin saltos')
assert.match(serviceIndex, /:tabindex="repeat !== 3 \? -1 : undefined"/, 'Las copias del loop no deben duplicar enlaces por teclado')
assert.match(serviceIndex, /services-directory__card-cta/, 'Cada tarjeta necesita un botón visual Ver más')
assert.match(serviceIndex, /Ver más/, 'El botón del carrusel debe decir Ver más')
assert.doesNotMatch(serviceIndex, /services-directory__motion/, 'El carrusel no debe incluir un botón de pausa')
assert.match(serviceIndex, /\.services-directory__card:focus-visible/, 'Enlaces navegables necesitan foco visible')
assert.match(serviceIndex, /services-directory__card-arrow.*<svg/, 'La acción Ver más debe conservar flecha SVG')
assert.match(serviceIndex, /requestAnimationFrame\(animateDirectory\)/, 'El carrusel debe usar una única posición continua')
assert.match(serviceIndex, /directoryPointerMove/, 'El carrusel debe permitir arrastre horizontal')
assert.match(serviceIndex, /directoryVideoSrc/, 'Cada servicio debe tener vista previa de video contextual')
assert.match(serviceIndex, /prefers-reduced-motion:reduce/, 'Debe desactivarse la animación para movimiento reducido')
const serviceGlobalCss = source('../src/style.css')
assert.match(serviceGlobalCss, /html\.theme-dark \.app-site\.services-page \.services-directory a\.services-directory__card/, 'Modo oscuro necesita un selector estable')
assert.match(serviceGlobalCss, /background:#142239!important/, 'Modo oscuro necesita un fondo de respaldo contrastado')
assert.match(serviceGlobalCss, /-webkit-text-fill-color:#fff!important/, 'Los títulos deben conservar contraste sobre las fotos')

const languageSwitcher = source('../src/components/LanguageSwitcher.vue')
const languageFlags = source('../src/components/LanguageFlag.vue')
assert.match(languageSwitcher, /import LanguageFlag/, 'Selector de idioma debe usar banderas SVG propias')
assert.doesNotMatch(languageSwitcher, /[\u{1F1E6}-\u{1F1FF}]/u, 'Evitar banderas emoji, Windows puede mostrar letras ES/GB')
assert.match(languageFlags, /viewBox="0 0 30 20"/, 'Banderas SVG deben tener dimensiones predecibles')
assert.match(languageFlags, /language === 'es'/, 'Falta bandera española')
assert.match(languageFlags, /#012169/, 'Falta bandera del Reino Unido')
assert.match(source('nuxt.config.ts'), /ssr:\s*true/, 'Nuxt debe mantener SSR')
for (const route of ['privacidad', 'terminos', 'cookies', 'licencias']) {
  assert.match(source('app/pages/' + route + '.vue'), /LegacyLegal/, 'Falta migración de página legal: ' + route)
}
assert.match(source('../src/pages/Legal.vue'), /props\.pathname/, 'Legal debe ser compatible con SSR')
assert.match(source('../src/pages/ServiceDetail.vue'), /props\.pathname/, 'Detalles de servicio deben ser compatibles con SSR')
assert.match(source('server/routes/robots.txt.ts'), /OAI-SearchBot/, 'Debe permitir SearchBot')
assert.match(source('server/routes/robots.txt.ts'), /GPTBot/, 'Política de entrenamiento no declarada')
assert.match(source('server/routes/sitemap.xml.ts'), /articlePath/, 'Las noticias deben aparecer en sitemap')
assert.match(source('app/pages/noticias/[slug].vue'), /statusCode: 404/, 'Noticia inexistente debe devolver HTTP 404')
assert.match(source('app/pages/servicios/[slug].vue'), /LegacyServiceLanding/, 'Páginas Nuxt deben reutilizar el diseño original')
assert.match(source('../src/pages/ServiceLanding.vue'), /details\.faq/, 'Las preguntas AEO deben mostrarse en el componente original')
assert.match(source('../src/pages/ServiceLanding.vue'), /service-landing-card-grid/, 'Faltan tarjetas del diseño unificado')
assert.match(source('../src/pages/ServiceLanding.vue'), /service-landing-hero__media/, 'Imagen principal ausente del diseño unificado')
assert.match(source('../src/pages/ServiceLanding.vue'), /service-landing-faq__item/, 'FAQ visible ausente del diseño unificado')
assert.match(source('../src/pages/ServiceLanding.vue'), /\/cotizaciones\?servicio=/, 'Falta el enlace al cotizador desde Servicios')
assert.match(source('../src/pages/ServiceLanding.vue'), /servicePages\.find/, 'Deben conservarse los datos de las seis páginas de transporte')
assert.doesNotMatch(source('app/pages/servicios/[slug].vue'), /LegacyServiceDetail/, 'No mezclar dos diseños en SSR')
assert.match(source('../src/pages/News.vue'), /sanitizeNewsHtml\(/, 'La noticia debe sanear su HTML')
console.log('Contrato estático SEO/GEO/AEO/AIO Nuxt: OK (no sustituye pruebas de build, SSR o navegador)')
