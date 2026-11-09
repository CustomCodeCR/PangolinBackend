// Un grupo User-agent específico no hereda las restricciones del grupo general.
export default defineEventHandler(event => {
  const base = String(useRuntimeConfig(event).public.siteUrl).replace(/\/$/, '')
  const privatePaths = ['/api/', '/administracion', '/admin/', '/cotizaciones', '/tracking', '/itinerario', '/bienvenidos']
  // /api sigue bloqueada para rastreadores salvo recursos que el backend publica
  // sin autenticación: noticias, configuración CMS visible y medios PUBLICADOS.
  // El backend valida la publicación de cada medio antes de servir el archivo.
  const publicResources = [
    'Allow: /api/content/media/',
    'Allow: /api/content/news
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  return [
    ...policy('OAI-SearchBot'),
    ...policy('ChatGPT-User'),
    'User-agent: GPTBot', 'Disallow: /', '',
    ...policy('*'),
    'Sitemap: ' + base + '/sitemap.xml', ''
  ].join('\n')
})
,
    'Allow: /api/content/site
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  return [
    ...policy('OAI-SearchBot'),
    ...policy('ChatGPT-User'),
    'User-agent: GPTBot', 'Disallow: /', '',
    ...policy('*'),
    'Sitemap: ' + base + '/sitemap.xml', ''
  ].join('\n')
})
,
    'Allow: /api/public-news
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  return [
    ...policy('OAI-SearchBot'),
    ...policy('ChatGPT-User'),
    'User-agent: GPTBot', 'Disallow: /', '',
    ...policy('*'),
    'Sitemap: ' + base + '/sitemap.xml', ''
  ].join('\n')
})

  ]
  const policy = (agent: string) => [
    'User-agent: ' + agent, 'Allow: /',
    ...publicResources,
    ...privatePaths.map(path => 'Disallow: ' + path),
    ''
  ]
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  return [
    ...policy('OAI-SearchBot'),
    ...policy('ChatGPT-User'),
    'User-agent: GPTBot', 'Disallow: /', '',
    ...policy('*'),
    'Sitemap: ' + base + '/sitemap.xml', ''
  ].join('\n')
})
