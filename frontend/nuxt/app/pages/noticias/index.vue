<script setup lang="ts">
import seoRoutes from '../../../../seo/routes.json'
import LegacyNews from '@legacy/pages/News.vue'
import type { ManagedNews } from '@legacy/adminContent'
import type { PublicNews } from '../../utils/news'
import { articlePath } from '../../utils/news'
const { data, error } = await useFetch<PublicNews[]>('/api/public-news', { key: 'public-news', server: true })
if (error.value) throw createError({ statusCode: 503, statusMessage: 'Noticias temporalmente no disponibles' })
usePublicSeo({
  path: '/noticias', title: seoRoutes['/noticias'].title,
  description: seoRoutes['/noticias'].description,
  image: '/images/cover-logistics.jpeg'
})
const route = useRoute()
// Previous /noticias?article=UUID links remain valid and consolidate to
// the permanent article URL on the server, without client-only redirects.
const legacyId = route.query.article
if (typeof legacyId === 'string') {
  const requested = (data.value || []).find(item => item.id === legacyId)
  if (requested) await navigateTo(articlePath(requested), { redirectCode: 301, replace: true })
}
const articles = computed(() => data.value || [])

const legacyNews = computed<ManagedNews[]>(() => articles.value.map(article => ({
  id: article.id, title: article.title, category: article.category || '',
  description: article.description || '', body: article.body || '',
  image: article.image || '/images/cover-logistics.jpeg',
  published: article.published !== false, author: article.author || undefined,
  publishedAt: article.publishedAt || null, expiresAt: article.expiresAt || null,
  slug: article.slug || null, contentModifiedAt: article.contentModifiedAt || null
})))
</script>
<template>
  <LegacyNews :initial-news="legacyNews" server-path="/noticias" />
</template>
