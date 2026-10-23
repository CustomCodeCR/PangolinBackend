/* Construye HEAD SEO por ruta sobre Vite. El body Vue sigue siendo SPA;
 * esto NO equivale a SSR/prerender completo de contenido del CMS.
 */
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const routes = require('../seo/routes.json')
const servicePages = require('../seo/service-pages.json')
const { makeStructuredData } = require('../seo/structured-data.cjs')
const dist = path.resolve(__dirname, '../dist')
const original = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
const origin = 'https://www.logisticacastrofallas.com'
const sourceSchemaMatch = original.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/i)
if (!sourceSchemaMatch) throw new Error('No se encontro el JSON-LD original de la empresa')
const sourceGraph = JSON.parse(sourceSchemaMatch[1])['@graph']
if (!Array.isArray(sourceGraph)) throw new Error('JSON-LD original sin @graph')
const escapeAttr = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
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

/**
 * El HTML inicial contiene texto util aun con JavaScript deshabilitado.
 * Vue reemplaza este contenido al montar la SPA para conservar interactividad.
 * Se usa una sola fuente de contenido para el build y la pagina Vue.
 */
function renderServiceHtml(service) {
  const paragraphs = service.paragraphs.map(text => '<p>' + escapeAttr(text) + '</p>').join('')
  const benefits = service.highlights.map(text => '<li>' + escapeAttr(text) + '</li>').join('')
  return '<div id="app"><main class="seo-prerendered-service">' +
    '<nav aria-label="Ruta de navegacion"><a href="/">Inicio</a> / <a href="/servicios">Servicios</a></nav>' +
    '<section><p>' + escapeAttr(service.kicker) + '</p><h1>' + escapeAttr(service.heading) + '</h1>' +
    '<p>' + escapeAttr(service.intro) + '</p><p><a href="/cotizaciones">Solicitar cotizacion</a></p></section>' +
    '<section><h2>' + escapeAttr(service.sectionTitle) + '</h2>' + paragraphs +
    '<h2>Servicios de coordinacion</h2><ul>' + benefits + '</ul></section>' +
    '<p><a href="/servicios">Ver todos los servicios</a></p></main></div>'
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
  if (servicePages[route]) {
    const marker = '<div id="app"></div>'
    if (!html.includes(marker)) throw new Error('No existe el contenedor Vue en HTML para prerender')
    html = html.replace(marker, renderServiceHtml(servicePages[route]))
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
  publicPaths.map(route => '  <url>\n    <loc>' + origin + route + '</loc>\n  </url>').join('\n') +
  '\n</urlset>\n'
fs.writeFileSync(path.join(dist, 'sitemap.xml'), sitemap)
fs.writeFileSync(path.join(dist, '404.html'), '<!doctype html>\n' +
  '<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n' +
  '<meta name="robots" content="noindex,nofollow"><title>404 | Castro Fallas</title></head>\n' +
  '<body><main><h1>404 · Página no encontrada</h1><p>La página solicitada no existe.</p>\n' +
  '<a href="/">Volver al inicio de Castro Fallas</a></main></body></html>')
console.log('SEO: ' + Object.keys(routes).length + ' rutas HTML, JSON-LD por pagina y sitemap generados.')
