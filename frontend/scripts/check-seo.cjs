/* Comprobaciones de contenido público para SEO y buscadores con IA.
 * Ejecutar: npm run seo:check (desde frontend).
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const base = path.resolve(__dirname, '..')
const read = file => fs.readFileSync(path.join(base, file), 'utf8')
const route = '/transporte-panama-costa-rica/'
const canonical = 'https://logisticacastrofallas.com' + route
const landing = read('public/transporte-panama-costa-rica/index.html')
const robots = read('public/robots.txt')
const sitemap = read('public/sitemap.xml')
const home = read('src/Home.vue')
const services = read('src/pages/Services.vue')
const footer = read('src/components/SiteFooter.vue')
const root = read('src/Root.vue')

assert.match(landing, /<h1>Transporte y carga consolidada de Panamá a Costa Rica<\/h1>/)
assert.ok(landing.includes('rel="canonical" href="' + canonical + '"'), 'Falta canonical')
assert.match(landing, /name="robots" content="index,follow/)
assert.ok(!landing.includes('noindex'), 'La landing no debe tener noindex')
assert.ok(!landing.includes('<script src='), 'La landing debe poder leerse sin JavaScript')
assert.ok(landing.includes('Grupo Castro Fallas'), 'La marca debe estar visible')
const match = landing.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
assert.ok(match, 'Falta JSON-LD')
const schema = JSON.parse(match[1])
const types = schema['@graph'].map(item => item['@type'])
for (const type of ['Organization', 'Service', 'WebPage', 'BreadcrumbList', 'FAQPage']) {
  assert.ok(types.includes(type), 'Falta esquema ' + type)
}
assert.ok(schema['@graph'].find(item => item['@type'] === 'FAQPage').mainEntity.length >= 4)
assert.ok(sitemap.includes('<loc>' + canonical + '</loc>'), 'Falta ruta en sitemap')
for (const source of [home, services, footer]) {
  assert.ok(source.includes('href="' + route + '"'), 'Falta enlace interno')
}
assert.ok(robots.includes('User-agent: OAI-SearchBot'), 'Falta permiso del bot de búsqueda')
assert.ok(root.includes("const gatedPaths = new Set(['/tracking', '/itinerario'])"), 'Rutas públicas siguen bloqueadas')
assert.ok(!/\b(?:la|el) (?:empresa )?(?:más grande|número uno)\b/i.test(landing), 'No usar ranking sin evidencia')
const dist = path.join(base, 'dist/transporte-panama-costa-rica/index.html')
if (fs.existsSync(path.join(base, 'dist'))) {
  assert.ok(fs.existsSync(dist), 'El build no copió la landing a dist')
}
console.log('SEO: comprobaciones estáticas aprobadas.')
