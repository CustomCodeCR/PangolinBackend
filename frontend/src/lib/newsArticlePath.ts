/** Stable public CMS article paths. The GUID suffix keeps old slugs resolvable
 * after a headline/date edit, while the canonical URL always uses current data. */
export type NewsLink = { id: string; title: string; publicationDate?: string | null }

export function newsArticlePath(article: NewsLink): string {
  const title = article.title.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'noticia'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(article.publicationDate ?? '')
    ? article.publicationDate
    : 'sin-fecha'
  return `/noticias/${date}-${title}-${article.id.replace(/-/g, '').slice(-8).toLowerCase()}`
}
