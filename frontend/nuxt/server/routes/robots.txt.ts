export default defineEventHandler(event => {
  const base = String(useRuntimeConfig(event).public.siteUrl).replace(/\/$/, '')
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  return [
    'User-agent: OAI-SearchBot',
    'Allow: /',
    'Disallow: /api/',
    '',
    'User-agent: ChatGPT-User',
    'Allow: /',
    '',
    'User-agent: GPTBot',
    'Disallow: /',
    '',
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /administracion',
    'Disallow: /admin/',
    'Disallow: /cotizaciones',
    'Disallow: /tracking',
    'Disallow: /itinerario',
    'Disallow: /bienvenidos',
    '',
    'Sitemap: ' + base + '/sitemap.xml',
    ''
  ].join('\n')
})
