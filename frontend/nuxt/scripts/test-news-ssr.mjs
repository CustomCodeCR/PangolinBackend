import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'
import path from 'node:path'

const cmsResponsiveSmoke = process.env.CMS_RESPONSIVE_SSR_SMOKE === '1'
const cmsImage = '/api/content/media/01234567-89ab-cdef-0123-456789abcdef/file'
const news = [{
  id: '123e4567-e89b-12d3-a456-426614174000',
  title: 'Logística Costa Rica',
  description: 'Información verificada sobre rutas de importación. '.repeat(12),
  body: '<p>Las operaciones requieren documentación aduanera.</p>',
  author: 'Equipo Castro Fallas',
  image: cmsResponsiveSmoke ? cmsImage : '/images/cover-logistics.jpeg',
  published: true,
  publishedAt: '2026-11-02T14:00:00Z',
  expiresAt: null
}]
const approvedTitleFixtures = [
  {
    suffix: 'f4c941bb',
    title: 'Como parte de su lucha contra la evasión de impuestos: HACIENDA REFUERZA EL CONTROL PARA INGRESO DE MERCANCÍAS AL PAÍS',
    seoTitle: 'Hacienda refuerza control de ingreso de mercancías'
  },
  {
    suffix: '38e374a5',
    title: 'Congestión en puertos de China podría generar retrasos en embarques hacia Centroamérica',
    seoTitle: 'Puertos de China: posibles retrasos a Centroamérica'
  },
  {
    suffix: '294af1f0',
    title: 'Centroamérica aprueba nuevas regulaciones aduaneras para modernizar el comercio regional',
    seoTitle: 'Centroamérica aprueba nuevas regulaciones aduaneras'
  }
]
for (const fixture of approvedTitleFixtures) {
  news.push({ ...news[0], id: '123e4567-e89b-12d3-a456-' + fixture.suffix.padStart(12, '0'), title: fixture.title })
}

// Casos adversos: el CMS no puede romper el sitemap con registros mal tipados.
const invalidNews = [
  { ...news[0], id: 123, title: 'ID no válido' },
  { ...news[0], id: '123e4567-e89b-12d3-a456-426614170001', title: 99 },
  { ...news[0], id: '123e4567-e89b-12d3-a456-426614170002', publishedAt: 123 },
  { ...news[0], id: '123e4567-e89b-12d3-a456-426614170003', published: false },
  { ...news[0], id: '123e4567-e89b-12d3-a456-426614170004', expiresAt: '2020-01-01T00:00:00Z' },
  { ...news[0], id: '123e4567-e89b-12d3-a456-426614170005', expiresAt: 'fecha-inválida' }
]

const api = createServer((req, res) => {
  if (req.url === '/api/content/news') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify([...news, ...invalidNews]))
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
  // A news article has one H1; the shared footer must not jump straight to H3.
  const headingLevels = [...html.matchAll(/<h([1-6])\b[^>]*>/gi)].map(match => Number(match[1]))
  assert.ok(headingLevels.includes(1), 'La noticia debe tener un H1')
  for (let i = 1; i < headingLevels.length; i++) {
    assert.ok(headingLevels[i] <= headingLevels[i - 1] + 1,
      'El HTML SSR no debe saltar niveles de encabezados: ' + headingLevels.join(' → '))
  }
  if (cmsResponsiveSmoke) {
    // Check SSR output itself, not the client after hydration. Nuxt must
    // announce width candidates early enough for LCP discovery.
    assert.ok(html.includes('src="' + cmsImage + '"'), 'SSR missing canonical original CMS image')
    for (const width of [360, 720, 1080, 1600])
      assert.ok(html.includes(cmsImage + '?width=' + width + ' ' + width + 'w'),
        'Nuxt SSR missing CMS variant ' + width)
    assert.ok(/srcset="[^"]+"/.test(html), 'Nuxt SSR should render a real img srcset')
    console.log('PASS CMS responsive srcset rendered in Nuxt SSR article')
  }
  assert.match(html, /documentación aduanera/)
  assert.match(html, /application\/ld\+json/)
  assert.match(html, /schema.org/)
  assert.ok(html.includes('"sameAs":["https://www.linkedin.com/company/grupo-castro-fallas/"]'),
    'El nodo Organization debe vincular el perfil externo verificado de Grupo Castro Fallas')
  // The same published image should be announced to search/social crawlers.
  const expectedImageUrl = 'https://www.logisticacastrofallas.com' +
    (cmsResponsiveSmoke ? cmsImage : '/images/cover-logistics.jpeg')
  const ogImageTag = (html.match(/<meta\b[^>]*>/gi) || [])
    .find(tag => /(?:property|name)="og:image"/i.test(tag))
  assert.ok(ogImageTag?.includes('content="' + expectedImageUrl + '"'),
    'Open Graph debe apuntar a la imagen publicada de la noticia')
  assert.ok(html.includes('"image":"' + expectedImageUrl + '"'),
    'Article JSON-LD debe apuntar a la imagen publicada de la noticia')

  assert.match(html, /rel="canonical"/)
  const descriptionTag = (html.match(/<meta\b[^>]*>/g) || []).find(tag => /name="description"/.test(tag))
  const descriptionValue = descriptionTag?.match(/content="([^"]*)"/)?.[1] || ''
  assert.ok(descriptionValue.length > 0 && descriptionValue.length <= 155,
    'La meta description de una noticia no debe ser larga ni quedar vacía')
  const publicNewsResponse = await fetch(base + '/api/public-news')
  assert.equal(publicNewsResponse.status, 200)
  const publicArticles = await publicNewsResponse.json()
  assert.deepEqual(publicArticles.map(article => article.id), news.map(article => article.id),
    'La API pública debe excluir noticias no publicadas, caducadas o malformadas')

  const sitemap = await (await fetch(base + '/sitemap.xml')).text()
  const articleLinks = [...sitemap.matchAll(/<loc>([^<]+)<\\/loc>/g)]
    .map(match => match[1]).filter(url => url.includes('/noticias/'))
  assert.equal(articleLinks.length, publicArticles.length,
    'El sitemap debe anunciar exactamente los artículos accesibles en SSR')
  for (const articleUrl of articleLinks) {
    const response = await fetch(base + new URL(articleUrl).pathname)
    assert.equal(response.status, 200, 'El sitemap incluye una noticia inaccesible: ' + articleUrl)
  }
  assert.ok(sitemap.includes(slug), 'Noticia ausente en sitemap dinámico')
  assert.match(sitemap,
    /<url><loc>https:\/\/www\.logisticacastrofallas\.com\/servicios\/transporte-maritimo<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod><\/url>/,
    'El sitemap debe usar fechas editoriales conocidas en páginas de servicios')
  assert.match(sitemap,
    /<url><loc>https:\/\/www\.logisticacastrofallas\.com\/<\/loc><\/url>/,
    'No inventar lastmod para la portada sin fecha editorial confirmada')
  for (const fixture of approvedTitleFixtures) {
    const articleUrl = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map(match => match[1]).find(url => url.endsWith('-' + fixture.suffix))
    assert.ok(articleUrl, 'Falta noticia ' + fixture.suffix + ' en sitemap')
    const response = await fetch(base + new URL(articleUrl).pathname)
    assert.equal(response.status, 200)
    const articleHtml = await response.text()
    const metaTitle = articleHtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim()
    assert.equal(metaTitle, fixture.seoTitle, 'El título SEO aprobado debe respetarse')
    assert.ok(articleHtml.includes(fixture.title), 'No cambiar el titular visible original')
  }

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
    '/servicios/agenciamiento-aduanal'
  ]) {
    assert.ok(servicesHtml.includes('href="' + route + '"'), 'Falta enlace HTML SSR a ' + route)
  }
  for (const retired of ['/servicios/bodegaje-general', '/servicios/transporte-internacional']) {
    assert.ok(!servicesHtml.includes('href="' + retired + '"'), 'Servicios no debe enlazar a ' + retired)
    const removedPage = await fetch(base + retired)
    assert.equal(removedPage.status, 404, 'La página retirada debe devolver HTTP 404: ' + retired)
  }
  const missing = await fetch(base + '/noticias/no-existe')
  assert.equal(missing.status, 404)
  console.log('Noticias SSR, Article JSON-LD, sitemap dinámico y 404: OK')
} finally {
  nuxt.kill('SIGTERM')
  await new Promise(resolve => api.close(resolve))
}
