// Guard against regressions that reintroduce heavy Home startup work.
// Run after npm run build: node scripts/check-home-loading.cjs
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')

const rootPage = read('src/Root.vue')
const home = read('src/Home.vue')
const globe = read('src/components/WorldGlobe.vue')
const instagram = read('src/components/HomeInstagramReel.vue')

for (const page of ['About', 'Services', 'Legal', 'OfficialQuoteWizard', 'OfficialQuoteAdmin']) {
  assert.ok(
    rootPage.includes(`const ${page} = defineAsyncComponent(() => import('./pages/${page}.vue'))`),
    `La página ${page} debe descargarse bajo demanda`
  )
}
assert.ok(rootPage.includes("import Home from './Home.vue'"), 'La portada debe seguir disponible inmediatamente')
assert.match(globe, /await import\('\.\.\/lib\/castroGlobe'\)/, 'El motor del globo debe importarse al acercarse al viewport')
assert.match(globe, /new IntersectionObserver\(/, 'La activación del globo depende de visibilidad')
assert.match(globe, /if \(disposed \|\| !canvas\.value\) return/, 'Una importación tardía no debe crear un canvas desmontado')
assert.match(home, /commentsObserver = new IntersectionObserver\(/, 'Los comentarios deben esperar hasta acercarse a su sección')
assert.match(home, /if \(commentsRequested\) void loadPublicComments\(\)/, 'SignalR no debe forzar peticiones de comentarios antes de tiempo')
assert.match(home, /fetch\('\/api\/content\/news'/, 'Las noticias deben seguir cargándose al iniciar Home')
assert.match(instagram, /reelObserver = new IntersectionObserver\(/, 'Instagram debe esperar a estar cerca de la pantalla')
assert.match(instagram, /if \(!reelRequested\) return/, 'Un cambio del CMS no debe anticipar la descarga del Reel')
assert.match(home, /<WorldGlobe \/>/, 'El globo sigue presente en Home')
assert.match(home, /<HomeInstagramReel \/>/, 'Instagram sigue presente en Home')

// Verify the actual production build has a separate renderer chunk, not just a
// source-level dynamic import. This script is meant to run after the Vite build.
const assetsDir = path.join(root, 'dist', 'assets')
assert.ok(fs.existsSync(assetsDir), 'Primero ejecutar npm run build')
const js = fs.readdirSync(assetsDir).filter(name => name.endsWith('.js'))
assert.ok(
  js.some(name => /^castroGlobe-[\w-]+\.js$/.test(name)),
  'Vite debe emitir un chunk independiente del motor del globo'
)
assert.doesNotMatch(read('dist/index.html'), /castroGlobe-[\w-]+\.js/, 'El HTML inicial no debe precargar el motor')
console.log('PASS: carga progresiva, rutas, secciones y chunk independiente del globo')
