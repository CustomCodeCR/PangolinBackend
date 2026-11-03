<script setup lang="ts">
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
</script>
<template>
  <PublicLayout>
    <main class="site-main">
      <p class="eyebrow">Actualidad logística</p>
      <h1>Noticias y comercio exterior</h1>
      <p class="lead">Información publicada por Grupo Castro Fallas.</p>
      <div class="cards"><article v-for="article in articles" :key="article.id" class="tile">
        <p class="eyebrow">{{ article.category || 'Noticias' }}</p>
        <h2><a :href="articlePath(article)">{{ article.title }}</a></h2>
        <time v-if="article.publishedAt" :datetime="article.publishedAt">{{ article.publishedAt.slice(0,10) }}</time>
        <p>{{ article.description }}</p>
      </article></div>
      <p v-if="!articles.length">Todavía no hay noticias publicadas.</p>
    </main>
  </PublicLayout>
</template>
