<script setup lang="ts">
import IconSymbol from '../components/IconSymbol.vue'
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import EmblaCarousel, { type EmblaCarouselType } from 'embla-carousel'
import type { ManagedNews } from '../adminContent'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'

const activeArticleIndex = ref<number | null>(null)
const managedNews = ref<ManagedNews[]>([])
const newsLoaded = ref(false)
const newsError = ref(false)
const activeStoryIndex = ref(0)
const emblaViewport = ref<HTMLElement | null>(null)
let emblaApi: EmblaCarouselType | null = null
// Sólo se muestran publicaciones del CMS; sin noticias predeterminadas.
const news = computed(() => managedNews.value.filter(article => article.published && article.title.trim()).map(article => ({
  id: article.id, category: article.category, title: article.title, description: article.description,
  body: article.body?.trim() || article.description,
  image: article.image || '/images/cover-logistics.jpeg'
})))
const leadStory = computed(() => news.value[activeStoryIndex.value] ?? news.value[0])
const carouselStories = computed(() => news.value.map((article, index) => ({ ...article, index })))
const activeArticle = computed(() => activeArticleIndex.value === null ? null : news.value[activeArticleIndex.value])
let storyTimer: number | undefined
function startStoryTimer() {
  if (storyTimer !== undefined) window.clearInterval(storyTimer)
  if (news.value.length <= 1) { storyTimer = undefined; return }
  storyTimer = window.setInterval(() => {
    if (emblaApi) emblaApi.scrollNext()
    else activeStoryIndex.value = (activeStoryIndex.value + 1) % news.value.length
  }, 5500)
}
function pauseStoryTimer() {
  if (storyTimer !== undefined) window.clearInterval(storyTimer)
  storyTimer = undefined
}
function resumeStoryTimer() {
  if (activeArticleIndex.value === null && storyTimer === undefined) startStoryTimer()
}
function selectStory(index: number) {
  activeStoryIndex.value = index
  emblaApi?.scrollTo(index)
  startStoryTimer()
}
function openArticle(index: number) {
  activeArticleIndex.value = index
  pauseStoryTimer()
}
function closeArticle() {
  activeArticleIndex.value = null
  startStoryTimer()
}
function handleArticleKeydown(event: KeyboardEvent) { if (event.key === 'Escape') closeArticle() }
onMounted(async () => {
  try {
    const response = await fetch('/api/content/news', { cache: 'no-store' })
    if (!response.ok) throw new Error('No se pudieron consultar las noticias.')
    const items: unknown = await response.json()
    if (!Array.isArray(items)) throw new Error('Respuesta de noticias inválida.')
    managedNews.value = items as ManagedNews[]
  } catch {
    newsError.value = true
  } finally {
    newsLoaded.value = true
  }
  window.addEventListener('keydown', handleArticleKeydown)
  // Esperar el render de los artículos antes de iniciar Embla.
  await nextTick()
  if (news.value.length && emblaViewport.value) {
    emblaApi = EmblaCarousel(emblaViewport.value, { align: 'start', loop: news.value.length > 1 })
    emblaApi.on('select', () => { activeStoryIndex.value = emblaApi?.selectedScrollSnap() ?? 0 })
  }
  startStoryTimer()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleArticleKeydown)
  pauseStoryTimer()
  emblaApi?.destroy()
  emblaApi = null
})
</script>

<template>
  <div class="app-site news-page">
    <section class="news-editorial-hero" @mouseenter="pauseStoryTimer" @mouseleave="resumeStoryTimer">
      <SiteHeader active="noticias" overlay />
      <template v-if="news.length">
      <div ref="emblaViewport" class="news-editorial-hero__viewport" aria-hidden="true">
        <div class="news-editorial-hero__slides">
          <div v-for="(story, index) in news" :key="story.id" class="news-editorial-hero__slide">
            <img :src="story.image" alt="" :fetchpriority="index === 0 ? 'high' : 'auto'" decoding="async" />
          </div>
        </div>
      </div>
      <div class="news-editorial-hero__fade" aria-hidden="true"></div>
      <div class="container news-editorial-hero__layout">
        <div class="news-editorial-hero__lead" aria-live="polite">
          <p class="section-tag light-tag">{{ $t('phrases.p066') }} <span>· {{ leadStory.category }}</span></p>
          <p class="news-editorial-hero__index">{{ String(activeStoryIndex + 1).padStart(2, '0') }} <span>/ {{ String(news.length).padStart(2, '0') }}</span></p>
          <h1>{{ leadStory.title }}</h1>
          <p class="news-editorial-hero__description">{{ leadStory.description }}</p>
          <button type="button" class="news-editorial-hero__read" @click="openArticle(activeStoryIndex)"><IconSymbol glyph="↘" />{{ $t('custom.news.readArticle') }}</button>
        </div>
        <aside class="news-editorial-hero__sidebar" :aria-label="$t('phrases.p133')">
          <p class="news-editorial-hero__sidebar-title">{{ $t('phrases.p133') }}</p>
          <button v-for="article in carouselStories" :key="article.id" type="button" class="news-editorial-hero__teaser" :class="{ 'is-active': activeStoryIndex === article.index }" :aria-pressed="activeStoryIndex === article.index" @click="selectStory(article.index)">
            <span class="news-editorial-hero__teaser-number">{{ String(article.index + 1).padStart(2, '0') }} <small>{{ article.category }}</small></span>
            <strong>{{ article.title }}</strong>
            <span class="news-editorial-hero__teaser-arrow"><IconSymbol glyph="↗" /></span>
          </button>
        </aside>
        <div class="news-editorial-hero__bottomline">
          <span>{{ $t('phrases.p066') }}</span>
          <span>{{ String(news.length).padStart(2, '0') }} {{ $t('phrases.p074') }}</span>
          <span class="news-editorial-hero__bottomline-rule"></span>
          <a href="#historias-destacadas">{{ $t('phrases.p070') }} <IconSymbol glyph="↓" /></a>
        </div>
      </div>
      </template>
      <div v-else class="container news-empty-hero" role="status">
        <p class="section-tag light-tag">CASTRO FALLAS · ACTUALIDAD</p>
        <h1>Noticias</h1>
        <p v-if="!newsLoaded">Cargando publicaciones…</p>
        <p v-else-if="newsError">No pudimos cargar las noticias en este momento. Inténtalo de nuevo más tarde.</p>
        <p v-else>Aún no hay noticias publicadas. Pronto compartiremos novedades.</p>
      </div>
    </section>

    <main id="historias-destacadas" class="news-editorial-content section-spacing">
      <div class="container">
        <div v-if="news.length" class="news-editorial-section-heading">
          <div>
            <p class="section-tag">{{ $t('phrases.p066') }}</p>
            <h2 class="section-title">{{ $t('phrases.p072') }} <span>{{ $t('phrases.p073') }}</span></h2>
          </div>
          <span class="news-editorial-section-heading__count">{{ $t('phrases.p133') }} · 0{{ news.length }}</span>
        </div>
        <div v-if="news.length" class="news-editorial-grid">
          <article v-for="(article, index) in news" :key="article.id" class="news-editorial-card" :class="{ 'news-editorial-card--lead': index === 0 }">
            <div class="news-editorial-card__image"><img :src="article.image" :alt="article.title" loading="lazy" /><span>{{ String(index + 1).padStart(2, '0') }}</span></div>
            <div class="news-editorial-card__copy">
              <p class="section-tag">{{ article.category }} · {{ $t('phrases.p074') }}</p>
              <h3>{{ article.title }}</h3>
              <p>{{ article.description }}</p>
              <button type="button" @click="openArticle(index)">{{ $t('custom.news.readArticle') }} <IconSymbol glyph="↗" /></button>
            </div>
          </article>
        </div>
      </div>
    </main>

    <div v-if="activeArticle" class="news-article-modal-backdrop" @click.self="closeArticle">
      <article class="news-article-modal" role="dialog" aria-modal="true" :aria-label="activeArticle.title">
        <button class="news-article-modal__close" type="button" :aria-label="$t('custom.news.closeArticle')" @click="closeArticle">
          <IconSymbol glyph="×" :size="20" />
        </button>
        <img :src="activeArticle.image" :alt="activeArticle.title" />
        <div class="news-article-modal__copy">
          <p class="section-tag">{{ activeArticle.category }} · {{ $t('phrases.p074') }}</p>
          <h2>{{ activeArticle.title }}</h2>
          <p class="news-article-fulltext">{{ activeArticle.body }}</p>
        </div>
      </article>
    </div>

    <SiteFooter />
  </div>
</template>

<style scoped>
.news-article-fulltext { white-space: pre-line; overflow-wrap: anywhere; }
.news-empty-hero { position: relative; z-index: 2; min-height: 320px; padding-top: 135px; padding-bottom: 95px; color: #fff; }
.news-empty-hero h1 { font-size: clamp(42px, 6vw, 76px); line-height: 1.1; margin: 18px 0; }
.news-empty-hero p:last-child { max-width: 640px; font-size: clamp(16px, 1.7vw, 20px); }
.news-editorial-hero:has(.news-empty-hero) { min-height: 0; background: linear-gradient(120deg, #980c26, #142240); }
</style>
