/* SEO de la web original, sin páginas nuevas ni elementos visibles.
 * Uso: desde frontend, ejecutar npm run seo:check.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const base = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(base, file), 'utf8')
const index = read('index.html')
const root = read('src/Root.vue')
const home = read('src/Home.vue')
const services = read('src/pages/Services.vue')
const footer = read('src/components/SiteFooter.vue')
const robots = read('public/robots.txt')
const sitemap = read('public/sitemap.xml')
const oldRoute = 'transporte-panama-costa-rica'

assert.equal(fs.existsSync(path.join(base, 'public', oldRoute, 'index.html')), false, 'No debe existir una landing independiente')
for (const [name, text] of [['Inicio', home], ['Servicios', services], ['Footer', footer]]) {
  assert.equal(text.includes(oldRoute), false, name + ' no debe mostrar enlaces SEO añadidos')
}
assert.equal(sitemap.includes(oldRoute), false, 'El sitemap no debe anunciar la ruta eliminada')
for (const publicRoute of ['/', '/noticias', '/nosotros', '/servicios']) {
  assert.ok(sitemap.includes('<loc>https://logisticacastrofallas.com' + publicRoute + '</loc>'), 'Falta ' + publicRoute + ' en sitemap')
}
assert.ok(robots.includes('User-agent: OAI-SearchBot'), 'Falta OAI-SearchBot en robots.txt')
assert.ok(root.includes("const gatedPaths = new Set(['/tracking', '/itinerario'])"), 'Hay noindex en páginas comerciales públicas')
assert.ok(index.includes('carga consolidada LTL') && index.includes('Panamá'), 'La descripción original no menciona el servicio')
assert.ok(root.includes('transporte terrestre FTL Panamá–Costa Rica'), 'Falta descripción SEO de la ruta')
const jsonLd = index.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)
assert.ok(jsonLd, 'Faltan datos estructurados en el HTML principal')
const data = JSON.parse(jsonLd[1])
const graph = data['@graph'] || []
const organization = graph.find((item) => item['@type'] === 'Organization')
const transport = graph.find((item) => item['@type'] === 'Service')
assert.ok(organization && organization.name === 'Grupo Castro Fallas', 'La identidad de la empresa debe ser coherente')
assert.ok(transport && transport.provider['@id'] === organization['@id'], 'Servicio sin vinculación a la empresa')
assert.ok(transport.serviceType.includes('LTL') && transport.serviceType.includes('FTL'), 'Modalidades no descritas')
assert.ok(transport.areaServed.some((place) => place.name === 'Panamá'), 'Ruta de Panamá no identificada')
assert.ok(transport.areaServed.some((place) => place.name === 'Costa Rica'), 'Ruta de Costa Rica no identificada')
if (fs.existsSync(path.join(base, 'dist'))) {
  assert.equal(fs.existsSync(path.join(base, 'dist', oldRoute, 'index.html')), false, 'El build conserva una landing eliminada')
}

const routes = require('../seo/routes.json')
const expectedIndexable = new Set(['/', '/home', '/noticias', '/nosotros', '/servicios', '/privacidad', '/terminos', '/cookies', '/licencias'])
for (const [route, seo] of Object.entries(routes)) {
  assert.ok(seo.title && seo.description, 'Metadatos incompletos: ' + route)
  assert.equal(seo.indexable !== false, expectedIndexable.has(route), 'Indexación inesperada: ' + route)
}
const nginx = read('nginx.conf')
assert.ok(nginx.includes('try_files $uri $uri/index.html =404;'), 'Nginx debe responder 404 en rutas desconocidas')
assert.ok(nginx.includes('error_page 404 /404.html;'), 'Nginx debe servir error 404 real')
assert.ok(root.includes("return 'notFound'"), 'La SPA no debe tratar rutas desconocidas como Inicio')
assert.ok(root.includes("import routeSeo from '../seo/routes.json'"), 'El cliente y el build deben usar los mismos metadatos')
if (fs.existsSync(path.join(base, 'dist'))) {
  const dist = path.join(base, 'dist')
  for (const [route, seo] of Object.entries(routes)) {
    const file = path.join(dist, route === '/' ? '' : route.slice(1), 'index.html')
    assert.ok(fs.existsSync(file), 'Falta HTML de ruta: ' + route)
    const html = fs.readFileSync(file, 'utf8')
    assert.ok(html.includes('<title>' + seo.title + '</title>'), 'Título HTML incorrecto: ' + route)
    assert.ok(html.includes('name="robots" content="' + (seo.indexable === false ? 'noindex,nofollow' : 'index,follow') + '"'), 'Robots HTTP HTML incorrecto: ' + route)
    assert.ok(html.includes('content="' + seo.description + '"'), 'Descripción ausente en HTML: ' + route)
    const canonical = '<link rel="canonical" href="https://logisticacastrofallas.com' + (route === '/home' ? '/' : route) + '"'
    assert.equal(html.includes(canonical), seo.indexable !== false, 'Canonical HTML incorrecto: ' + route)
    if (seo.indexable === false) assert.ok(!html.includes('rel="canonical"'), 'Canonical en página privada: ' + route)
  }
  assert.ok(fs.readFileSync(path.join(dist, '404.html'), 'utf8').includes('noindex,nofollow'), '404 sin noindex')
}

console.log('SEO: rutas, HTML inicial, sitemap y 404 verificados.')
