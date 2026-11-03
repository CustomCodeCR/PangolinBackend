export default defineEventHandler(async event => {
  // Solo recursos públicos del CMS. No se publica un proxy genérico a /api/admin.
  const path = getRouterParam(event, 'path') || ''
  if (!/^[a-zA-Z0-9/_-]+$/.test(path) || path.includes('..')) throw createError({ statusCode: 400 })
  const config = useRuntimeConfig(event)
  const url = String(config.cmsApiBase).replace(/\/$/, '') + '/api/content/' + path
  return proxyRequest(event, url + (getRequestURL(event).search || ''))
})
