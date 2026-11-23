import { isCrawlableNews, PUBLIC_NEWS_LIMIT } from '../../app/utils/news'
import type { PublicNews } from '../../app/utils/news'
// Keep the full feed cached for performance. Individual articles bypass that
// cache so a deleted/unpublished/expired article never gets a stale HTTP 200.
const cachedPublicNews = defineCachedEventHandler(async (event): Promise<PublicNews[]> => {
  // URL fija del backend; no se recibe una URL arbitraria del visitante (sin SSRF).
  const base = String(useRuntimeConfig(event).cmsApiBase).replace(/\/$/, '')
  const result = await $fetch<unknown>(base + '/api/content/news', { timeout: 5000 })
  if (!Array.isArray(result)) throw createError({ statusCode: 502, statusMessage: 'Respuesta CMS inválida' })
  // Misma validación y límite que el sitemap para no anunciar URLs con 404.
  const now = Date.now()
  return result.filter((item): item is PublicNews => isCrawlableNews(item, now)).slice(0, PUBLIC_NEWS_LIMIT)
}, { maxAge: 120, swr: true, name: 'public-pangolin-news' })

export default defineEventHandler(async event => {
  if (Object.prototype.hasOwnProperty.call(getQuery(event), 'id')) {
    const id = getQuery(event).id
    if (typeof id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      throw createError({ statusCode: 400, statusMessage: 'Identificador de noticia inválido' })
    setHeader(event, 'Cache-Control', 'no-store')
    const base = String(useRuntimeConfig(event).cmsApiBase).replace(/\\/$/, '')
    // This endpoint is backed by PostgreSQL and enforces Published/ExpiresAt.
    // Do not turn an upstream 404 into a successful empty news page.
    return await $fetch<PublicNews>(base + '/api/content/news/' + id, { timeout: 5000 })
  }
  return cachedPublicNews(event)
})

