/* Genera cabeceras SEO por ruta sobre el build Vite sin tocar el diseño Vue.
 * El contenido de la SPA sigue dependiendo de JavaScript: esto NO es SSR.
 */
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const routes = require('../seo/routes.json')
const dist = path.resolve(__dirname, '../dist')
const original = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
const origin = 'https://logisticacastrofallas.com'
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
function buildRoute(route, seo) {
  let html = original.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + escapeAttr(seo.title) + '</title>')
  html = putMeta(html, 'name', 'description', seo.description)
  html = putMeta(html, 'name', 'robots', seo.indexable === false ? 'noindex,nofollow' : 'index,follow')
  html = putMeta(html, 'property', 'og:title', seo.title)
  html = putMeta(html, 'property', 'og:description', seo.description)
  html = putMeta(html, 'name', 'twitter:title', seo.title)
  html = putMeta(html, 'name', 'twitter:description', seo.description)
  const canonical = seo.indexable === false ? null : origin + (route === '/home' ? '/' : route)
  html = setLink(html, canonical)
  html = setUrl(html, canonical)
  // Los datos del servicio terrestre corresponden a Inicio y Servicios.
  if (!['/', '/home', '/servicios'].includes(route)) {
    html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/i, '')
  }
  const dest = route === '/' ? dist : path.join(dist, route.slice(1))
  fs.mkdirSync(dest, { recursive: true })
  fs.writeFileSync(path.join(dest, 'index.html'), html)
}
for (const [route, seo] of Object.entries(routes)) buildRoute(route, seo)
fs.writeFileSync(path.join(dist, '404.html'), `<!doctype html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>404 | Castro Fallas</title></head>
<body><main><h1>404 · Página no encontrada</h1><p>La página solicitada no existe.</p>
<a href="/">Volver al inicio de Castro Fallas</a></main></body></html>`)
console.log('SEO: ' + Object.keys(routes).length + ' rutas HTML con metadatos y página 404 generadas.')
