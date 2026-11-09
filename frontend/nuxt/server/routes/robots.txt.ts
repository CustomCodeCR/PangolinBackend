// Un grupo User-agent específico no hereda las restricciones del grupo general.
export default defineEventHandler(event => {
  const base = String(useRuntimeConfig(event).public.siteUrl).replace(/\/$/, '')
  const privatePaths = ['/api/', '/administracion', '/admin/', '/cotizaciones', '/tracking', '/itinerario', '/bienvenidos']
  // Los recursos CMS publicados sí pueden ser leídos por Googlebot.
  // El backend sigue validando si cada archivo fue publicado antes de servirlo.
  const publicResources = [
    'Allow: /api/content/media/',
    'Allow: /api/content/news$',
    'Allow: /api/content/site$',
    'Allow: /api/public-news$'
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
