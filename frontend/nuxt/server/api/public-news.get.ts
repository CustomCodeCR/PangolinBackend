import { isCrawlableNews, PUBLIC_NEWS_LIMIT } from '../../app/utils/news'
import type { PublicNews } from '../../app/utils/news'
export default defineCachedEventHandler(async (event): Promise<PublicNews[]> => {
  // URL fija del backend; no se recibe una URL arbitraria del visitante (sin SSRF).
  const base = String(useRuntimeConfig(event).cmsApiBase).replace(/\/$/, '')
  const result = await $fetch<unknown>(base + '/api/content/news', { timeout: 5000 })
  if (!Array.isArray(result)) throw createError({ statusCode: 502, statusMessage: 'Respuesta CMS inválida' })
  // Misma validación y límite que el sitemap para no anunciar URLs con 404.
  const now = Date.now()
  return result.filter((item): item is PublicNews => isCrawlableNews(item, now)).slice(0, PUBLIC_NEWS_LIMIT)
}, { maxAge: 120, swr: true, name: 'public-pangolin-news' })
