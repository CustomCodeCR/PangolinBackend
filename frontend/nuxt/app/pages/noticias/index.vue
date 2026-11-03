<script setup lang="ts">
import LegacyNews from '@legacy/pages/News.vue'
import type { ManagedNews } from '@legacy/adminContent'
import type { PublicNews } from '../../utils/news'
import { articlePath } from '../../utils/news'
const { data, error } = await useFetch<PublicNews[]>('/api/public-news', { key: 'public-news', server: true })
if (error.value) throw createError({ statusCode: 503, statusMessage: 'Noticias temporalmente no disponibles' })
usePublicSeo({
  path: '/noticias', title: 'Noticias de logística y comercio exterior | Castro Fallas',
  description: 'Publicaciones del Grupo Castro Fallas sobre transporte de carga, logística y comercio exterior en Costa Rica y Centroamérica.',
  image: '/images/cover-logistics.jpeg'
})
const articles = computed(() => data.value || [])

const legacyNews = computed<ManagedNews[]>(() => articles.value.map(article => ({
  id: article.id, title: article.title, category: article.category || '',
  description: article.description || '', body: article.body || '',
  image: article.image || '/images/cover-logistics.jpeg',
  published: article.published !== false, author: article.author || undefined,
  publishedAt: article.publishedAt || null, expiresAt: article.expiresAt || null
})))
</script>
<template>
  <LegacyNews :initial-news="legacyNews" server-path="/noticias" />
</template>
