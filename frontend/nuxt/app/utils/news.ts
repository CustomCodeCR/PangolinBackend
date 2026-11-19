export type PublicNews = {
  id: string
  title: string
  category?: string | null
  description?: string | null
  body?: string | null
  image?: string | null
  published?: boolean
  author?: string | null
  publishedAt?: string | null
  expiresAt?: string | null
}
// El sitemap y la API pública deben compartir exactamente las mismas reglas.
// Un registro CMS malformado no debe causar HTTP 500 en el sitemap completo.
export const PUBLIC_NEWS_LIMIT = 250
export function isCrawlableNews(value: unknown, now = Date.now()): value is PublicNews {
  if (!value || typeof value !== 'object') return false
  const article = value as Record<string, unknown>
  if (typeof article.id !== 'string' || !article.id.trim() ||
      typeof article.title !== 'string' || !article.title.trim() ||
      article.published === false) return false
  // articleSlug necesita publishedAt como cadena para construir la URL.
  if (article.publishedAt != null && typeof article.publishedAt !== 'string') return false
  if (article.expiresAt != null && article.expiresAt !== '') {
    if (typeof article.expiresAt !== 'string') return false
    const expiresAt = Date.parse(article.expiresAt)
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return false
  }
  return true
}

export function articleSlug(article: PublicNews): string {
  const title = article.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'noticia'
  return `${article.publishedAt?.slice(0, 10) || 'sin-fecha'}-${title}-${article.id.replace(/-/g, '').slice(-8).toLowerCase()}`
}
export function articlePath(article: PublicNews): string {
  return '/noticias/' + articleSlug(article)
}
export function plainArticleText(content?: string | null): string {
  // Se muestra como interpolación de Vue, nunca como v-html: no renderiza scripts del CMS.
  return String(content || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
