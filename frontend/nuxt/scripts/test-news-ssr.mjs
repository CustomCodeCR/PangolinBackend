import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'
import path from 'node:path'

const news = [{
  id: '123e4567-e89b-12d3-a456-426614174000',
  title: 'Logística Costa Rica',
  description: 'Información verificada sobre rutas de importación.',
  body: '<p>Las operaciones requieren documentación aduanera.</p>',
  author: 'Equipo Castro Fallas',
  image: '/images/cover-logistics.jpeg',
  published: true,
  publishedAt: '2026-11-02T14:00:00Z',
  expiresAt: null
}]
const api = createServer((req, res) => {
  if (req.url === '/api/content/news') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(news))
    return
  }
  res.writeHead(404); res.end('Not found')
})
await new Promise(resolve => api.listen(0, '127.0.0.1', resolve))
const apiPort = api.address().port
const probe = createServer()
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
const nuxtPort = probe.address().port
await new Promise(resolve => probe.close(resolve))
const nuxt = spawn(process.execPath, ['.output/server/index.mjs'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: {
    ...process.env,
    NUXT_CMS_API_BASE: `http://127.0.0.1:${apiPort}`,
    NUXT_PUBLIC_SITE_URL: 'https://www.logisticacastrofallas.com',
    NITRO_PORT: String(nuxtPort),
    NITRO_HOST: '127.0.0.1'
  },
  stdio: ['ignore', 'pipe', 'pipe']
})
let logs = ''
for (const stream of [nuxt.stdout, nuxt.stderr]) stream.on('data', x => { logs += String(x) })
const base = `http://127.0.0.1:${nuxtPort}`
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(base + '/')
      if (response.ok) { ready = true; break }
    } catch {}
    await delay(200)
  }
  assert.ok(ready, 'Nuxt no inició: ' + logs.slice(-3000))
  const slug = '/noticias/2026-11-02-logistica-costa-rica-14174000'
  const page = await fetch(base + slug)
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.match(html, /Logística Costa Rica/)
  assert.match(html, /news-article-page/)
  assert.match(html, /documentación aduanera/)
  assert.match(html, /application\/ld\+json/)
  assert.match(html, /schema.org/)
  assert.match(html, /rel="canonical"/)
  const sitemap = await (await fetch(base + '/sitemap.xml')).text()
  assert.ok(sitemap.includes(slug), 'Noticia ausente en sitemap dinámico')
  // SEO: las páginas comerciales del sitemap deben tener enlaces HTML
  // visibles en el catálogo, sin depender de interacción con pestañas.
  const servicesIndex = await fetch(base + '/servicios')
  assert.equal(servicesIndex.status, 200)
  const servicesHtml = await servicesIndex.text()
  for (const route of [
    '/servicios/transporte-maritimo',
    '/servicios/transporte-aereo',
    '/servicios/transporte-terrestre',
    '/servicios/almacenamiento-fiscal',
    '/servicios/bodegaje-general',
    '/servicios/agenciamiento-aduanal'
  ]) {
    assert.ok(servicesHtml.includes('href="' + route + '"'), 'Falta enlace HTML SSR a ' + route)
  }
  const missing = await fetch(base + '/noticias/no-existe')
  assert.equal(missing.status, 404)
  console.log('Noticias SSR, Article JSON-LD, sitemap dinámico y 404: OK')
} finally {
  nuxt.kill('SIGTERM')
  await new Promise(resolve => api.close(resolve))
}
