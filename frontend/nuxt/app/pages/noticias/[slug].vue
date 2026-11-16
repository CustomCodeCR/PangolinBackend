<script setup lang="ts">
import LegacyNews from '@legacy/pages/News.vue'
import type { ManagedNews } from '@legacy/adminContent'
import type { PublicNews } from '../../utils/news'
import { articleSlug, plainArticleText } from '../../utils/news'
const route = useRoute()
const { data, error } = await useFetch<PublicNews[]>('/api/public-news', { key: 'public-news', server: true })
if (error.value) throw createError({ statusCode: 503, statusMessage: 'Noticias temporalmente no disponibles' })
const article = (data.value || []).find(item => articleSlug(item) === route.params.slug)
if (!article) throw createError({ statusCode: 404, statusMessage: 'Noticia no encontrada' })
const path = '/noticias/' + articleSlug(article)
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
  '@id': 'https://www.logisticacastrofallas.com' + path + '#articulo',
  headline: article.title,
  description: article.description || plainArticleText(article.body).slice(0, 170),
  mainEntityOfPage: 'https://www.logisticacastrofallas.com' + path,
  author: article.author ? { '@type': 'Person', name: article.author } : { '@type': 'Organization', name: 'Grupo Castro Fallas' },
  publisher: { '@id': 'https://www.logisticacastrofallas.com/#organizacion' },
  ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
  image: 'https://www.logisticacastrofallas.com' + image
}
usePublicSeo({
  path, title: seoTitle,
  description: metaDescription,
  type: 'article', image, schema: [schema]
})
useSeoMeta({
  ...(article.publishedAt ? { articlePublishedTime: article.publishedAt } : {})
})
const body = plainArticleText(article.body || article.description)

const legacyNews = computed<ManagedNews[]>(() => (data.value || []).map(item => ({
  id: item.id, title: item.title, category: item.category || '',
  description: item.description || '', body: item.body || '',
  image: item.image || '/images/cover-logistics.jpeg',
  published: item.published !== false, author: item.author || undefined,
  publishedAt: item.publishedAt || null, expiresAt: item.expiresAt || null
})))
</script>
<template>
  <LegacyNews :initial-news="legacyNews" :server-path="path" />
</template>
