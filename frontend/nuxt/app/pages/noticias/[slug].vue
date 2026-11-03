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
const image = article.image?.startsWith('/images/') ? article.image : '/images/cover-logistics.jpeg'
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
  path, title: article.title + ' | Grupo Castro Fallas',
  description: article.description || plainArticleText(article.body).slice(0, 160),
  type: 'article', image, schema: [schema]
})
useSeoMeta({
  ...(article.publishedAt ? { articlePublishedTime: article.publishedAt } : {})
})
const body = plainArticleText(article.body || article.description)
</script>

const legacyNews = computed<ManagedNews[]>(() => (data.value || []).map(item => ({
  id: item.id, title: item.title, category: item.category || '',
  description: item.description || '', body: item.body || '',
  image: item.image || '/images/cover-logistics.jpeg',
  published: item.published !== false, author: item.author || undefined,
  publishedAt: item.publishedAt || null, expiresAt: item.expiresAt || null
})))
<template>
  <LegacyNews :initial-news="legacyNews" :server-path="path" />
</template>
