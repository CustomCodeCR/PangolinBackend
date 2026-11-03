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
