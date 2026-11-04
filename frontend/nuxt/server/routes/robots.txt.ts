// Un grupo User-agent específico no hereda las restricciones del grupo general.
export default defineEventHandler(event => {
  const base = String(useRuntimeConfig(event).public.siteUrl).replace(/\/$/, '')
  const privatePaths = ['/api/', '/administracion', '/admin/', '/cotizaciones', '/tracking', '/itinerario', '/bienvenidos']
  const policy = (agent: string) => ['User-agent: ' + agent, 'Allow: /', ...privatePaths.map(path => 'Disallow: ' + path), '']
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  return [
    ...policy('OAI-SearchBot'),
    ...policy('ChatGPT-User'),
    'User-agent: GPTBot', 'Disallow: /', '',
    ...policy('*'),
    'Sitemap: ' + base + '/sitemap.xml', ''
  ].join('\n')
})
