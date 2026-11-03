import type { PublicNews } from '../../app/utils/news'
export default defineCachedEventHandler(async (event): Promise<PublicNews[]> => {
  // URL fija del backend; no se recibe una URL arbitraria del visitante (sin SSRF).
  const base = String(useRuntimeConfig(event).cmsApiBase).replace(/\/$/, '')
  const result = await $fetch<unknown>(base + '/api/content/news', { timeout: 5000 })
  if (!Array.isArray(result)) throw createError({ statusCode: 502, statusMessage: 'Respuesta CMS inválida' })
  // La API .NET filtra por publicadas y vigentes; se valida de nuevo por seguridad.
  const now = Date.now()
  return result.filter((item): item is PublicNews => {
    if (!item || typeof item !== 'object') return false
    const news = item as Record<string, unknown>
    return typeof news.id === 'string' && typeof news.title === 'string' &&
      news.title.trim().length > 0 && news.published !== false &&
      (!news.expiresAt || (typeof news.expiresAt === 'string' && Date.parse(news.expiresAt) > now))
  }).slice(0, 250)
}, { maxAge: 300, swr: true, name: 'public-pangolin-news' })
