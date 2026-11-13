// Contrato de indexabilidad HTTP para Nuxt SSR, ejecutado contra un servidor real.
// Detecta sitemap con URLs rotas, canonicals incoherentes y "soft 404" por HTTP 200.
// No consulta Search Console ni promete indexación por parte de Google.
import assert from 'node:assert/strict'

const previewOrigin = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '')
const canonicalOrigin = 'https://www.logisticacastrofallas.com'
const privatePrefixes = ['/api', '/admin', '/administracion', '/bienvenidos', '/cotizaciones', '/tracking', '/itinerario']
const requiredPaths = ['/', '/nosotros', '/servicios', '/noticias', '/empresas']
const failed = []
const htmlAttribute = (tag, name) => tag.match(new RegExp('\\b' + name + '="([^"]*)"', 'i'))?.[1]

async function get(path) {
  return fetch(previewOrigin + path, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
}
function isPrivate(pathname) {
  return privatePrefixes.some(prefix => pathname === prefix || pathname.startsWith(prefix + '/'))
}
function fail(path, reason) {
  failed.push(path + ': ' + reason)
}
const sitemapResponse = await get('/sitemap.xml')
assert.equal(sitemapResponse.status, 200, 'El sitemap debe devolver HTTP 200')
assert.match(sitemapResponse.headers.get('content-type') || '', /xml/, 'El sitemap debe servirse como XML')
const sitemap = await sitemapResponse.text()
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1].replace(/&amp;/g, '&'))
assert.ok(sitemapUrls.length >= 15, 'El sitemap contiene menos URLs públicas de las esperadas')
assert.equal(new Set(sitemapUrls).size, sitemapUrls.length, 'URLs duplicadas en el sitemap')
const paths = sitemapUrls.map((loc) => {
  const url = new URL(loc)
  assert.equal(url.origin, canonicalOrigin, 'Dominio no canónico en sitemap: ' + loc)
  assert.equal(url.search, '', 'Sitemap con parámetros de consulta: ' + loc)
  assert.equal(url.hash, '', 'Sitemap con fragmentos: ' + loc)
  assert.equal(isPrivate(url.pathname), false, 'Ruta privada anunciada en sitemap: ' + loc)
  return url.pathname
})
for (const path of requiredPaths) assert.ok(paths.includes(path), 'Falta ruta principal en sitemap: ' + path)

for (const path of paths) {
  try {
    const response = await get(path)
    if (response.status !== 200) {
      fail(path, 'sitemap apunta a HTTP ' + response.status)
      continue
    }
    const html = await response.text()
    const htmlTag = html.match(/<html\\b[^>]*>/i)?.[0] || ''
    if (!/\\blang=["'](?:es|en)(?:-[A-Za-z]+)?["']/i.test(htmlTag)) {
      fail(path, 'falta atributo lang en <html> SSR')
    }
    const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim()
    if (!title) fail(path, 'falta título SSR')
    if (!/<h1(?:\s|>)/i.test(html)) fail(path, 'falta H1 en HTML SSR')
    const canonicalTags = (html.match(/<link\b[^>]*>/gi) || []).filter(tag => /\brel=["']canonical["']/i.test(tag))
    if (canonicalTags.length !== 1) {
      fail(path, 'debe existir exactamente un canonical, hay ' + canonicalTags.length)
    } else {
      const canonical = htmlAttribute(canonicalTags[0], 'href')
      const expected = canonicalOrigin + path
      if (canonical !== expected) fail(path, 'canonical ' + canonical + ' distinto de ' + expected)
    }
    const robotTags = (html.match(/<meta\b[^>]*>/gi) || []).filter(tag => /\bname=["']robots["']/i.test(tag))
    const robots = robotTags.map(tag => htmlAttribute(tag, 'content') || '').join(',').toLowerCase()
    if (!robots.includes('index') || /(^|[,\s])noindex([,\s]|$)/.test(robots)) {
      fail(path, 'robots no permite indexar: ' + robots)
    }
  } catch (error) {
    fail(path, String(error))
  }
}

for (const unknown of ['/ruta-seo-inexistente-qa-94329', '/servicios/ruta-inexistente', '/empresas/ruta-inexistente', '/noticias/ruta-inexistente']) {
  const response = await get(unknown)
  if (response.status !== 404) fail(unknown, 'posible soft 404: HTTP ' + response.status + ' en una ruta inexistente')
}
const home = await get('/home')
if (home.status !== 301 || new URL(home.headers.get('location') || '', previewOrigin).pathname !== '/') {
  fail('/home', 'alias no redirige permanentemente al inicio')
}
if (paths.includes('/home')) fail('/home', 'alias de redirección incluido en sitemap')

const robotsResponse = await get('/robots.txt')
if (robotsResponse.status !== 200) fail('/robots.txt', 'HTTP ' + robotsResponse.status)
else {
  const robots = await robotsResponse.text()
  if (!robots.includes('Sitemap: ' + canonicalOrigin + '/sitemap.xml')) fail('/robots.txt', 'Sitemap no canónico')
  // Validar excepciones CMS públicas mediante la regla más específica.
  const groups = robots.trim().split(/\r?\n\s*\r?\n/).map(section => section.split(/\r?\n/).map(line => line.trim()).filter(Boolean))
  function canCrawl(agent, route) {
    const exact = groups.find(lines => lines.some(line => line.toLowerCase() === 'user-agent: ' + agent.toLowerCase()))
    const wildcard = groups.find(lines => lines.some(line => line.toLowerCase() === 'user-agent: *'))
    const lines = exact || wildcard || []
    const rules = lines.flatMap(line => {
      const match = /^(allow|disallow):\s*(\S+)/i.exec(line)
      if (!match) return []
      const rule = match[2]
      const exactPath = rule.endsWith('$')
      const prefix = exactPath ? rule.slice(0, -1) : rule
      const matches = exactPath ? route === prefix : route.startsWith(prefix)
      return matches ? [{ allow: match[1].toLowerCase() === 'allow', length: rule.length }] : []
    })
    rules.sort((a, b) => b.length - a.length || Number(b.allow) - Number(a.allow))
    return rules.length ? rules[0].allow : true
  }
  const publicResources = [
    '/api/content/media/18f28700-8a4c-470c-b2db-8ea661fbd038/file',
    '/api/content/news',
    '/api/content/site',
    '/api/public-news'
  ]
  const internalResources = [
    '/api/auth/me',
    '/api/admin/content/news',
    '/api/hubs/updates/negotiate',
    '/api/content/news/00000000-0000-0000-0000-000000000000/translation'
  ]
  for (const agent of ['Googlebot', 'Googlebot-Image', 'OAI-SearchBot', 'ChatGPT-User']) {
    for (const path of publicResources) if (!canCrawl(agent, path)) fail('/robots.txt', agent + ' no puede rastrear recurso público ' + path)
    for (const path of internalResources) if (canCrawl(agent, path)) fail('/robots.txt', agent + ' puede rastrear API interna ' + path)
  }
  for (const path of ['/', '/noticias', '/api/content/media/18f28700-8a4c-470c-b2db-8ea661fbd038/file']) {
    if (canCrawl('GPTBot', path)) fail('/robots.txt', 'Se modificó la política existente de GPTBot para ' + path)
  }
}

if (failed.length) {
  for (const issue of failed) console.error('FAIL SEO:', issue)
  process.exitCode = 1
} else {
  console.log('PASS SEO indexación HTTP:', paths.length, 'URLs del sitemap con 200, H1, canonical único y robots indexable; 404 reales, /home 301 y robots.txt')
}
