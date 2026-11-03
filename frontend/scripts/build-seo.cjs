/* Builds route metadata and static fallback content for service detail pages.
 * CMS-backed news and other dynamic views continue to render through Vue.
 */
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const routes = require('../seo/routes.json')
const servicePages = require('../seo/service-pages.json')
const serviceFaqs = require('../seo/service-faqs.json')
const { makeStructuredData } = require('../seo/structured-data.cjs')
const dist = path.resolve(__dirname, '../dist')
const original = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
const origin = 'https://www.logisticacastrofallas.com'

const serviceGuides = require('../seo/service-landings.json')
// Initial HTML contains the public copy even before Vue loads. Vue replaces #app on mount.
// Crawlers can discover every service from the navigation without opening the Vue menu.
// The same links also exist in the interactive header once JavaScript runs.
function renderServiceNav() {
  const items = [['/servicios', 'Todos los servicios'], ...Object.entries(serviceGuides)
    .map(([route, guide]) => [route, guide.es.label]),
    ...servicePages.map(page => ['/servicios/' + page.slug, page.title.es])]
  return '<header data-seo-service-header="true"><nav aria-label="Servicios de Grupo Castro Fallas"><ul>' +
    items.map(([href, label]) => '<li><a href="' + escapeHtml(href) + '">' + escapeHtml(label) + '</a></li>').join('') +
    '</ul></nav></header>'
}
function renderServiceGuide(route, guide) {
  const c = guide.es
  return renderServiceNav() +
    '<main data-seo-service="' + escapeHtml(route) + '">' +
    '<article><header><h1>' + escapeHtml(c.title) + '</h1><p>' + escapeHtml(c.intro) + '</p>' +
    '<p>Información de servicios de Grupo Castro Fallas · Costa Rica</p></header>' +
    '<section><h2>¿Qué ofrece Grupo Castro Fallas?</h2><p>' + escapeHtml(c.answer) + '</p></section>' +
    '<section><h2>' + escapeHtml(c.heading) + '</h2><p>' + escapeHtml(c.body) + '</p><ul>' +
    c.points.map(point => '<li>' + escapeHtml(point) + '</li>').join('') + '</ul></section>' +
    '<section><h2>' + escapeHtml(c.quoteHeading) + '</h2><p>' + escapeHtml(c.quoteIntro) + '</p><ul>' +
    c.quoteItems.map(point => '<li>' + escapeHtml(point) + '</li>').join('') + '</ul></section>' +
    '<section><h2>Alcance y disponibilidad</h2><p>' + escapeHtml(c.scopeNote) + '</p></section>' +
    '<section><h2>Preguntas frecuentes</h2>' + c.faq.map(faq =>
      '<h3>' + escapeHtml(faq.q) + '</h3><p>' + escapeHtml(faq.a) + '</p>').join('') + '</section>' +
    '<p>Para una propuesta detallada escriba a <a href="mailto:comercial@castrofallas.com">comercial@castrofallas.com</a>.</p></article></main>'
}

const imageDimensions = {
  '/images/hero.webp': [1200, 685],
  '/images/cover-logistics.jpeg': [1024, 576],
  '/images/about-operations-enhanced.jpg': [1448, 1086],
  '/images/services-crane.webp': [960, 538],
  '/images/ship.webp': [480, 480],
  '/images/truck.webp': [750, 422],
  '/images/air-freight.webp': [1120, 630]
}
const sourceSchemaMatch = original.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/i)
if (!sourceSchemaMatch) throw new Error('No se encontro el JSON-LD original de la empresa')
const sourceGraph = JSON.parse(sourceSchemaMatch[1])['@graph']
if (!Array.isArray(sourceGraph)) throw new Error('JSON-LD original sin @graph')
const escapeAttr = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const escapeHtml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
function renderServiceFallback(route) {
  if (route === '/servicios') {
    const faqs = (serviceFaqs.servicios || []).map(faq => '<details><summary>' + escapeHtml(faq.question.es) + '</summary><p>' + escapeHtml(faq.answer.es) + '</p></details>').join('\n')
    return '<main id="seo-service-content" lang="es-CR"><header><p>TRANSPORTE Y LOGÍSTICA · COSTA RICA</p><h1>Servicios aduanales, almacenamiento y carga</h1><p>Grupo Castro Fallas coordina consultas de agenciamiento aduanal, almacenamiento fiscal, bodegaje general, carga consolidada y transporte internacional. Alcance, disponibilidad y condiciones se confirman según cada operación.</p></header><section aria-labelledby="seo-service-faq"><h2 id="seo-service-faq">Preguntas frecuentes sobre nuestros servicios</h2>' + faqs + '</section><p><a href="/cotizaciones">Solicitar cotización</a></p></main>'
  }
  const slug = route.split('/').pop()
  const page = servicePages.find(item => item.slug === slug)
  if (!page) return null
  const sections = page.sections.map((section, index) => '<article><h2>' + escapeHtml(section.title.es) + '</h2><p>' + escapeHtml(section.body.es) + '</p></article>').join('\n')
  const faqs = (serviceFaqs[slug] || []).map(faq => '<details><summary>' + escapeHtml(faq.question.es) + '</summary><p>' + escapeHtml(faq.answer.es) + '</p></details>').join('\n')
  return '<main id="seo-service-content" lang="es-CR"><nav aria-label="Migas de pan"><a href="/">Inicio</a> / <a href="/servicios">Servicios</a> / <span>' + escapeHtml(page.title.es) + '</span></nav><header><p>' + escapeHtml(page.eyebrow.es) + '</p><h1>' + escapeHtml(page.title.es) + '</h1><p>' + escapeHtml(page.lead.es) + '</p><p>' + escapeHtml(page.location.es) + '</p></header><section aria-label="Detalles del servicio">' + sections + '</section><section aria-labelledby="seo-service-faq"><h2 id="seo-service-faq">Preguntas frecuentes</h2>' + faqs + '</section><p><a href="/cotizaciones?servicio=' + encodeURIComponent(slug) + '">' + escapeHtml(page.quoteLabel.es) + '</a></p></main>'
}
function putMeta(html, attribute, key, value) {
  const pattern = new RegExp('<meta\\b(?=[^>]*\\b' + attribute + '="' + key + '")[^>]*>', 'i')
  const tag = '<meta ' + attribute + '="' + key + '" content="' + escapeAttr(value) + '" />'
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace('</head>', '    ' + tag + '\n  </head>')
}
function setLink(html, canonical) {
  html = html.replace(/<link\b(?=[^>]*\brel="canonical")[^>]*>\s*/ig, '')
  return canonical ? html.replace('</head>', '    <link rel="canonical" href="' + canonical + '" />\n  </head>') : html
}
function setUrl(html, url) {
  html = html.replace(/<meta\b(?=[^>]*\bproperty="og:url")[^>]*>\s*/ig, '')
  return url ? putMeta(html, 'property', 'og:url', url) : html
}
function buildRoute(route, seo) {
  let html = original.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + escapeAttr(seo.title) + '</title>')
  html = putMeta(html, 'name', 'description', seo.description)
  html = putMeta(html, 'name', 'robots', seo.indexable === false ? 'noindex,nofollow' : 'index,follow')
  html = putMeta(html, 'property', 'og:title', seo.title)
  html = putMeta(html, 'property', 'og:description', seo.description)
  html = putMeta(html, 'name', 'twitter:title', seo.title)
  html = putMeta(html, 'name', 'twitter:description', seo.description)
  html = putMeta(html, 'property', 'og:locale', 'es_CR')
  const image = origin + (seo.socialImage || '/images/hero.webp')
  html = putMeta(html, 'property', 'og:image', image)
  html = putMeta(html, 'name', 'twitter:image', image)
  const dimensions = imageDimensions[seo.socialImage || '/images/hero.webp']
  if (dimensions) {
    html = putMeta(html, 'property', 'og:image:width', dimensions[0])
    html = putMeta(html, 'property', 'og:image:height', dimensions[1])
  }
  if (seo.socialImageAlt) {
    html = putMeta(html, 'property', 'og:image:alt', seo.socialImageAlt)
    html = putMeta(html, 'name', 'twitter:image:alt', seo.socialImageAlt)
  }
  const canonical = seo.indexable === false ? null : origin + (route === '/home' ? '/' : route)
  html = setLink(html, canonical)
  html = setUrl(html, canonical)
  // No replicar Schema de servicios a administracion, login o paginas privadas.
  html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/ig, '')
  const structured = makeStructuredData(route, seo, sourceGraph)
  if (structured) {
    const serialized = JSON.stringify(structured).replace(/</g, '\\u003c')
    html = html.replace('</head>', '    <script type="application/ld+json">' + serialized + '</script>\n  </head>')
  }
  if (serviceGuides[route] || route === '/servicios') {
    if (!html.includes('<div id="app"></div>')) throw new Error('No se encontró raíz Vue para HTML SEO')
    const initialHtml = serviceGuides[route] ? renderServiceGuide(route, serviceGuides[route]) : renderServiceNav() + (renderServiceFallback(route) || '')
    html = html.replace('<div id="app"></div>', '<div id="app">' + initialHtml + '</div>')
  }
  else {
    const fallback = renderServiceFallback(route)
    if (fallback) html = html.replace(/(<div\s+id="app"[^>]*>)[\s\S]*?(<\/div>)/i, '$1' + fallback + '$2')
  }
  const dest = route === '/' ? dist : path.join(dist, route.slice(1))
  fs.mkdirSync(dest, { recursive: true })
  fs.writeFileSync(path.join(dest, 'index.html'), html)
}
for (const [route, seo] of Object.entries(routes)) buildRoute(route, seo)
// Sitemap generado a partir de la misma fuente que los canonicals.
const publicPaths = [...new Set(Object.entries(routes)
  .filter(([, seo]) => seo.indexable !== false)
  .map(([route]) => route === '/home' ? '/' : route))]
const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  publicPaths.map(route => {
    const seo = Object.entries(routes).find(([path]) => (path === '/home' ? '/' : path) === route)?.[1]
    return '  <url>\n    <loc>' + origin + route + '</loc>' + (seo?.lastModified ? '\n    <lastmod>' + seo.lastModified + '</lastmod>' : '') + '\n  </url>'
  }).join('\n') +
  '\n</urlset>\n'
fs.writeFileSync(path.join(dist, 'sitemap.xml'), sitemap)
fs.writeFileSync(path.resolve(__dirname, '../public/sitemap.xml'), sitemap)
fs.writeFileSync(path.join(dist, '404.html'), '<!doctype html>\n' +
  '<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n' +
  '<meta name="robots" content="noindex,nofollow"><title>404 | Castro Fallas</title></head>\n' +
  '<body><main><h1>404 · Página no encontrada</h1><p>La página solicitada no existe.</p>\n' +
  '<a href="/">Volver al inicio de Castro Fallas</a></main></body></html>')
console.log('SEO: ' + Object.keys(routes).length + ' rutas HTML, JSON-LD por pagina y sitemap generados.')
