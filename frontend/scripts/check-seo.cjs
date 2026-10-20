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
console.log('SEO: comprobaciones estáticas aprobadas (web original, sin página nueva).')
