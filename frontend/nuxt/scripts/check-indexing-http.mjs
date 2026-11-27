// Contrato de indexabilidad HTTP para Nuxt SSR, ejecutado contra un servidor real.
// Detecta sitemap con URLs rotas, canonicals incoherentes y "soft 404" por HTTP 200.
// No consulta Search Console ni promete indexación por parte de Google.
import assert from 'node:assert/strict'

// Scope: crawler groups and ASCII prefix / end-anchor paths used by this
// site's policy. Not a general-purpose RFC 9309 URL normalization library.
// Google merges matching groups, ignores blank/comment/unknown lines, and
// uses the most specific agent instead of inheriting the wildcard rules.
// https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec
function parseRobotsGroups(robots) {
  const groups = []
  let group = null
  let sawRule = false
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.split('#', 1)[0].trim()
    const match = /^(user-agent|allow|disallow)\s*:\s*(.*)$/i.exec(line)
    if (!match) continue
    const field = match[1].toLowerCase()
    const value = match[2].trim()
    if (field === 'user-agent') {
      const agent = /^(\*|[a-z0-9_-]+)/i.exec(value)?.[1]?.toLowerCase()
      if (!agent) continue
      if (!group || sawRule) {
        group = { agents: [], rules: [] }
        groups.push(group)
        sawRule = false
      }
      group.agents.push(agent)
    } else if (group) {
      sawRule = true
      if (value.startsWith('/')) group.rules.push({ allow: field === 'allow', path: value })
    }
  }
  return groups
}

function canCrawl(groups, agent, route) {
  const token = agent.toLowerCase()
  const ranked = groups.map(group => ({
    group,
    rank: Math.max(-1, ...group.agents.map(name =>
      name === '*' ? 0 : token.startsWith(name) ? name.length : -1))
  }))
  const best = Math.max(-1, ...ranked.map(item => item.rank))
  if (best < 0) return true
  const rules = ranked.filter(item => item.rank === best).flatMap(item => item.group.rules)
  const matched = rules.filter(rule => {
    const exactPath = rule.path.endsWith('$')
    const prefix = exactPath ? rule.path.slice(0, -1) : rule.path
    // Current production policy uses prefix and end-anchor rules only.
    // Reject unsupported wildcard patterns rather than silently misread them.
    if (prefix.includes('*')) throw new Error('Unsupported robots.txt path pattern: ' + rule.path)
    return exactPath ? route === prefix : route.startsWith(prefix)
  })
  matched.sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow))
  return matched.length ? matched[0].allow : true
}

function testRobotsGroups() {
  const site = [
    'Allow: /', 'Allow: /api/content/media/', 'Allow: /api/content/news$',
    'Allow: /api/content/site$', 'Allow: /api/public-news$',
    'Disallow: /api/', 'Disallow: /cotizaciones', 'Disallow: /tracking'
  ].join('\n')
  const origin = ['OAI-SearchBot', 'ChatGPT-User', '*'].map(agent =>
    'User-agent: ' + agent + '\n' + site).join('\n\n') + '\n\nUser-agent: GPTBot\nDisallow: /'
  const cloudflare = [
    '# BEGIN Cloudflare Managed content', 'User-agent: *',
    'Content-Signal: search=yes,ai-train=no,use=reference', 'Allow: /',
    '', 'User-agent: Google-Extended', 'Disallow: /',
    'User-agent: AwarioSmartBot', 'User-agent: AwarioRssBot', 'Disallow: /',
    'User-agent: GPTBot', 'Disallow: /', '# END Cloudflare Managed Content'
  ].join('\n')
  const publicPaths = ['/', '/noticias', '/api/content/media/example/file',
    '/api/content/news', '/api/content/site', '/api/public-news']
  const privatePaths = ['/api/auth/me', '/api/admin/content/news',
    '/api/hubs/updates/negotiate', '/api/content/news/00000000-0000-0000-0000-000000000000/translation',
    '/cotizaciones?service=fcl', '/tracking']
  for (const fixture of [origin, cloudflare + '\n\n' + origin, origin + '\n\n' + cloudflare]) {
    const groups = parseRobotsGroups(fixture)
    for (const agent of ['Googlebot', 'Googlebot-Image', 'OAI-SearchBot', 'ChatGPT-User']) {
      for (const path of publicPaths) assert.equal(canCrawl(groups, agent, path), true, agent + ' public ' + path)
      for (const path of privatePaths) assert.equal(canCrawl(groups, agent, path), false, agent + ' private ' + path)
    }
    for (const path of publicPaths) assert.equal(canCrawl(groups, 'GPTBot', path), false)
  }
  const check = (fixture, agent, route, expected) =>
    assert.equal(canCrawl(parseRobotsGroups(fixture), agent, route), expected, agent + ' ' + route)
  // Negative controls: a genuinely unsafe policy must remain detectable.
  check('User-agent: *\nAllow: /', 'Googlebot', '/api/auth/me', true)
  check(origin + '\nUser-agent: Googlebot\nAllow: /', 'Googlebot', '/api/auth/me', true)
  check(origin + '\nUser-agent: Googlebot\nAllow: /', 'Googlebot-Image', '/api/auth/me', true)
  check(origin + '\nUser-agent: Googlebot-Image\nDisallow: /', 'Googlebot-Image', '/noticias', false)
  check(origin + '\nUser-agent: *\nDisallow: /api/content/news$', 'Googlebot', '/api/content/news', true)
  check('User-agent: *\nDisallow: /api/\nUser-agent: *\nAllow: /api/auth/me$', 'Googlebot', '/api/auth/me', true)
  check('User-agent: *\nDisallow: /api/\nUser-agent: *\nDisallow: /noticias', 'Googlebot', '/noticias', false)
  check('User-agent: a\n\nSitemap: https://example.test/sitemap.xml\n# comment\nUser-agent: B\nDisallow: /', 'b', '/', false)
  check('User-agent: a\n\nSitemap: https://example.test/sitemap.xml\nUser-agent: b\nDisallow: /', 'a', '/', false)
  check('\uFEFFUSER-AGENT : *\r\nDisallow: /api/ # private\r\nAllow: /api/content/news$', 'Googlebot', '/api/auth/me', false)
  check('User-agent: *\nDisallow:\nAllow: /', 'Googlebot', '/', true)
  check('User-agent: *\nDisallow: /api/\nUser-agent: Googlebot\nDisallow: /news\nUser-agent: Googlebot\nDisallow: /other', 'Googlebot', '/other', false)
  assert.throws(() => canCrawl(parseRobotsGroups('User-agent: *\nDisallow: /*.php'), 'Googlebot', '/'), /Unsupported/)
}

testRobotsGroups()
if (process.argv[2] === '--robots-self-test') {
  console.log('PASS SEO robots.txt: grupos repetidos, Cloudflare y controles negativos')
  process.exit(0)
}


const previewOrigin = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '')
const canonicalOrigin = 'https://www.logisticacastrofallas.com'
const privatePrefixes = ['/api', '/admin', '/administracion', '/bienvenidos', '/cotizaciones', '/tracking', '/itinerario']
const requiredPaths = ['/', '/nosotros', '/servicios', '/noticias']
const conciseServiceTitles = new Set([
  '/servicios/agenciamiento-aduanal',
  '/servicios/almacenamiento-fiscal',
  '/servicios/consolidadora-de-carga'
])
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
assert.ok(!paths.some(path => path === '/empresas' || path.startsWith('/empresas/')), 'Empresas no debe publicarse en el sitemap')
for (const retired of ['/servicios/bodegaje-general', '/servicios/transporte-internacional']) {
  assert.ok(!paths.includes(retired), 'Servicio retirado aún anunciado en sitemap: ' + retired)
}

for (const path of paths) {
  try {
    const response = await get(path)
    if (response.status !== 200) {
      fail(path, 'sitemap apunta a HTTP ' + response.status)
      continue
    }
    const html = await response.text()
    const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] || ''
    if (!/\blang=["'](?:es|en)(?:-[A-Za-z]+)?["']/i.test(htmlTag)) {
      fail(path, 'falta atributo lang en <html> SSR')
    }
    const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim()
    if (!title) fail(path, 'falta título SSR')
    if (conciseServiceTitles.has(path) && title?.length > 60) {
      fail(path, 'metatítulo del servicio supera 60 caracteres: ' + title.length)
    }
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

for (const unknown of ['/ruta-seo-inexistente-qa-94329', '/servicios/ruta-inexistente', '/servicios/bodegaje-general', '/servicios/transporte-internacional', '/empresas', '/empresas/aduanera-castro-fallas', '/empresas/transporte-castro-fallas', '/empresas/neriteka', '/empresas/ruta-inexistente', '/noticias/ruta-inexistente']) {
  const response = await get(unknown)
  if (response.status !== 404) fail(unknown, 'posible soft 404: HTTP ' + response.status + ' en una ruta inexistente')
}
for (const alias of ['/home', '/home/']) {
  const home = await get(alias)
  const location = home.headers.get('location') || ''
  const destination = new URL(location || alias, previewOrigin)
  if (home.status !== 301 || destination.pathname !== '/' || destination.search !== '') {
    fail(alias, 'alias no redirige permanentemente al inicio sin parámetros')
  }
  if (paths.includes(alias)) fail(alias, 'alias de redirección incluido en sitemap')
}

const robotsResponse = await get('/robots.txt')
if (robotsResponse.status !== 200) fail('/robots.txt', 'HTTP ' + robotsResponse.status)
else {
  const robots = await robotsResponse.text()
  if (!robots.includes('Sitemap: ' + canonicalOrigin + '/sitemap.xml')) fail('/robots.txt', 'Sitemap no canónico')
  const groups = parseRobotsGroups(robots)
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
    for (const path of publicResources) if (!canCrawl(groups, agent, path)) fail('/robots.txt', agent + ' no puede rastrear recurso público ' + path)
    for (const path of internalResources) if (canCrawl(groups, agent, path)) fail('/robots.txt', agent + ' puede rastrear API interna ' + path)
  }
  for (const path of ['/', '/noticias', '/api/content/media/18f28700-8a4c-470c-b2db-8ea661fbd038/file']) {
    if (canCrawl(groups, 'GPTBot', path)) fail('/robots.txt', 'Se modificó la política existente de GPTBot para ' + path)
  }
}

if (failed.length) {
  for (const issue of failed) console.error('FAIL SEO:', issue)
  process.exitCode = 1
} else {
  console.log('PASS SEO indexación HTTP:', paths.length, 'URLs del sitemap con 200, H1, canonical único y robots indexable; 404 reales, /home 301 y robots.txt')
}
