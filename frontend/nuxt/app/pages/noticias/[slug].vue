<script setup lang="ts">
import LegacyNews from '@legacy/pages/News.vue'
import type { ManagedNews } from '@legacy/adminContent'
import type { PublicNews } from '../../utils/news'
import { articleSlug, articlePath, isCrawlableNews, plainArticleText } from '../../utils/news'
const route = useRoute()
const { data, error } = await useFetch<PublicNews[]>('/api/public-news', { key: 'public-news', server: true })
if (error.value) throw createError({ statusCode: 503, statusMessage: 'Noticias temporalmente no disponibles' })
const requestedSlug = String(route.params.slug || '')
const published = data.value || []
const exact = published.find(item => articleSlug(item) === requestedSlug)
// Legacy URLs include a stable 8-hex ID suffix even when their title/date
// changed. Redirect only an unambiguous match; never expose an unpublished post.
const oldSuffix = requestedSlug.match(/-([a-f0-9]{8})$/i)?.[1]?.toLowerCase()
const aliases = exact || !oldSuffix ? [] : published.filter(item =>
  item.id.replace(/-/g, '').slice(-8).toLowerCase() === oldSuffix)
const candidate = exact ?? (aliases.length === 1 ? aliases[0] : null)
if (!candidate) throw createError({ statusCode: 404, statusMessage: 'Noticia no encontrada' })
// The list may remain cached briefly after deletion; check the definitive row
// in PostgreSQL before generating 200 HTML, redirects, canonical or Article JSON-LD.
// This same-origin Nuxt endpoint uses a no-store CMS lookup by full UUID.
const { data: current, error: currentError } = await useFetch<PublicNews>('/api/public-news', {
  key: 'public-news-current-' + candidate.id,
  query: { id: candidate.id },
  server: true
})
if (currentError.value) {
  if (currentError.value.statusCode === 404)
    throw createError({ statusCode: 404, statusMessage: 'Noticia no encontrada' })
  throw createError({ statusCode: 503, statusMessage: 'Noticias temporalmente no disponibles' })
}
const article = current.value
if (!article || !isCrawlableNews(article) || article.id !== candidate.id)
  throw createError({ statusCode: 404, statusMessage: 'Noticia no encontrada' })
const path = articlePath(article)
if (requestedSlug !== articleSlug(article))
  await navigateTo(path, { redirectCode: 301, replace: true })
// Coincide con la fuente canónica de usePublicSeo también en previews.
const seoBase = String(useRuntimeConfig().public.siteUrl).replace(/\/$/, '')
const approvedNewsSeoTitles: Record<string, string> = {
  // Titles explicitly approved for search results; do not modify visible headlines.
  'f4c941bb': 'Hacienda refuerza control de ingreso de mercancías',
  '38e374a5': 'Puertos de China: posibles retrasos a Centroamérica',
  '294af1f0': 'Centroamérica aprueba nuevas regulaciones aduaneras'
}
const articleIdSuffix = article.id.replace(/-/g, '').slice(-8).toLowerCase()
const seoTitle = approvedNewsSeoTitles[articleIdSuffix] ?? article.title + ' | Grupo Castro Fallas'
// Reuse published CMS photos in Open Graph and Article JSON-LD.
// Only known same-origin paths are accepted, never arbitrary external URLs.
const imagePath = String(article.image || '')
const isStaticImage = /^\/images\/[a-z0-9/_-]+\.(?:avif|jpe?g|png|webp|svg)$/i.test(imagePath)
const isPublishedCmsImage = /^\/api\/content\/media\/[0-9a-f-]{36}\/file$/i.test(imagePath)
const image = (isStaticImage || isPublishedCmsImage) ? imagePath : '/images/cover-logistics.jpeg'
const rawDescription = plainArticleText(article.description || article.body)
const metaDescription = rawDescription.length > 155
  ? rawDescription.slice(0, 154).replace(/\s+\S*$/, '') + '…'
  : rawDescription
const schema = {
  '@type': 'Article',
  '@id': seoBase + path + '#articulo',
  headline: article.title,
  description: article.description || plainArticleText(article.body).slice(0, 170),
  mainEntityOfPage: seoBase + path,
  author: article.author ? { '@type': 'Person', name: article.author } : { '@type': 'Organization', name: 'Grupo Castro Fallas' },
  publisher: { '@id': seoBase + '/#organizacion' },
  ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
  ...(article.contentModifiedAt ? { dateModified: article.contentModifiedAt } : {}),
  image: seoBase + image
}
usePublicSeo({
  path, title: seoTitle,
  description: metaDescription,
  type: 'article', image, schema: [schema]
})
useSeoMeta({
  ...(article.publishedAt ? { articlePublishedTime: article.publishedAt } : {}),
  ...(article.contentModifiedAt ? { articleModifiedTime: article.contentModifiedAt } : {})
})
const body = plainArticleText(article.body || article.description)

const legacyNews = computed<ManagedNews[]>(() => (data.value || [])
  // Replace cached detail data with the authoritative, current CMS version.
  .map(item => item.id === article.id ? article : item)
  .map(item => ({
    id: item.id, title: item.title, category: item.category || '',
    description: item.description || '', body: item.body || '',
    image: item.image || '/images/cover-logistics.jpeg',
    published: item.published !== false, author: item.author || undefined,
    publishedAt: item.publishedAt || null, expiresAt: item.expiresAt || null,
    slug: item.slug || null, contentModifiedAt: item.contentModifiedAt || null
  })))
</script>
<template>
  <LegacyNews :initial-news="legacyNews" :server-path="path" />
</template>
