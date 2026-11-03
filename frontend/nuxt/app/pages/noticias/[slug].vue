<script setup lang="ts">
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
<template>
  <PublicLayout>
    <main class="site-main">
      <article class="article">
        <p class="eyebrow">{{ article.category || 'Noticias' }}</p>
        <h1>{{ article.title }}</h1>
        <time v-if="article.publishedAt" :datetime="article.publishedAt">{{ article.publishedAt.slice(0,10) }}</time>
        <p v-if="article.author">Autor: {{ article.author }}</p>
        <img v-if="article.image" :src="article.image" :alt="article.title" loading="eager" />
        <p class="lead">{{ article.description }}</p>
        <div class="content-block"><p style="white-space:pre-line">{{ body }}</p></div>
        <p><a href="/noticias">Ver otras noticias</a></p>
      </article>
    </main>
  </PublicLayout>
</template>
