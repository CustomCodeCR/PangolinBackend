// Prueba HTTP de integridad semántica: no cambia metadatos ni contenido.
import assert from 'node:assert/strict'

const origin = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '')
const canonicalOrigin = 'https://www.logisticacastrofallas.com'
const organizationId = canonicalOrigin + '/#organizacion'
const websiteId = canonicalOrigin + '/#sitio-web'
const get = async path => {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(15000) })
  assert.equal(response.status, 200, path + ': respuesta HTTP inesperada')
  return response.text()
}

const sitemap = await get('/sitemap.xml')
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1].replace(/&amp;/g, '&'))
const paths = new Set(urls.map(url => new URL(url).pathname))
assert.ok(paths.size >= 15, 'Sitemap inesperadamente pequeño')
let serviceCount = 0
let articleCount = 0

for (const path of paths) {
  const html = await get(path)
  const canonical = canonicalOrigin + path
  const scripts = [...html.matchAll(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  const json = scripts.map((match, index) => {
    try { return JSON.parse(match[1]) }
    catch (error) { throw new Error(path + ': JSON-LD inválido en script ' + index + ': ' + error) }
  })
  const graphs = json.filter(item => item && item['@context'] === 'https://schema.org' && Array.isArray(item['@graph']))
  assert.equal(graphs.length, 1, path + ': se espera un grafo JSON-LD válido y único')
  const graph = graphs[0]['@graph']
  const byType = type => graph.filter(node => node && node['@type'] === type)
  for (const type of ['Organization', 'LocalBusiness', 'WebSite', 'WebPage']) {
    assert.equal(byType(type).length, 1, path + ': nodo estructurado ausente o duplicado: ' + type)
  }
  assert.equal(byType('Organization')[0]['@id'], organizationId, path + ': organización inconsistente')
  assert.equal(byType('WebSite')[0]['@id'], websiteId, path + ': WebSite inconsistente')
  assert.equal(byType('WebSite')[0].publisher?.['@id'], organizationId, path + ': editor inconsistente')
  const page = byType('WebPage')[0]
  assert.equal(page.url, canonical, path + ': URL de WebPage distinta del canonical')
  assert.equal(page['@id'], canonical + '#pagina', path + ': @id de WebPage inconsistente')
  assert.equal(page.isPartOf?.['@id'], websiteId, path + ': página no vinculada al WebSite')

  const ogUrl = (html.match(/<meta\b[^>]*\bproperty=["']og:url["'][^>]*>/i) || [])[0] || ''
  assert.ok(ogUrl.includes('content="' + canonical + '"'), path + ': og:url no coincide con canonical')

  if (path.startsWith('/servicios/')) {
    serviceCount++
    const service = byType('Service')
    const breadcrumbs = byType('BreadcrumbList')
    assert.equal(service.length, 1, path + ': falta schema Service')
    assert.equal(service[0].provider?.['@id'], organizationId, path + ': proveedor sin vínculo canónico')
    assert.equal(service[0].mainEntityOfPage?.['@id'], canonical + '#pagina', path + ': entidad principal incorrecta')
    assert.equal(breadcrumbs.length, 1, path + ': falta BreadcrumbList')
    const items = breadcrumbs[0].itemListElement
    assert.ok(Array.isArray(items) && items.length === 3, path + ': ruta de breadcrumbs incompleta')
    assert.deepEqual(items.map(item => item.position), [1, 2, 3], path + ': posiciones incorrectas')
    assert.equal(items[2].item, canonical, path + ': breadcrumbs no terminan en la URL canónica')
  }

  if (path.startsWith('/noticias/')) {
    articleCount++
    const articles = byType('Article')
    assert.equal(articles.length, 1, path + ': falta schema Article')
    const article = articles[0]
    assert.equal(article['@id'], canonical + '#articulo', path + ': @id de Article inconsistente')
    assert.equal(article.mainEntityOfPage, canonical, path + ': Article apunta a otro documento')
    assert.equal(article.publisher?.['@id'], organizationId, path + ': publisher inconsistente')
  }

  // Solo verificamos enlaces al catálogo de servicios: las páginas privadas
  // siguen fuera del sitemap y no se deben exigir como indexables.
  if (path === '/servicios') {
    const hrefs = [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)].map(match => match[1])
    for (const href of hrefs) {
      if (!href.startsWith('/') || href.startsWith('//')) continue
      const target = new URL(href, canonicalOrigin)
      if (target.pathname.startsWith('/servicios/')) {
        assert.ok(paths.has(target.pathname), '/servicios enlaza una ficha fuera del sitemap: ' + target.pathname)
      }
    }
  }
}
assert.ok(serviceCount >= 8, 'Faltan fichas de servicios en el sitemap')
console.log('PASS SEO semántico:', paths.size, 'páginas,', serviceCount, 'servicios,',
  articleCount, 'noticias; JSON-LD, OG y enlaces de catálogo consistentes')
