<script setup lang="ts">
import IconSymbol from '../components/IconSymbol.vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EmblaCarousel, { type EmblaCarouselType } from 'embla-carousel'
import { readManagedNews, type ManagedNews } from '../adminContent'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import { subscribeToChanges } from '../services/realtime'

const activeArticleIndex = ref<number | null>(null)
const managedNews = ref<ManagedNews[]>([])
const newsLoaded = ref(false)
const newsError = ref(false)
const activeStoryIndex = ref(0)
const emblaViewport = ref<HTMLElement | null>(null)
let emblaApi: EmblaCarouselType | null = null
// Sólo se muestran publicaciones del CMS; sin noticias predeterminadas.
type EnglishNews = Pick<ManagedNews, 'title' | 'category' | 'description' | 'body'>
const { locale } = useI18n({ useScope: 'global' })
const englishNews = ref<Record<string, { source: string; translated: EnglishNews }>>({})
const englishLoading = ref(false)
const englishError = ref(false)
const translating = new Map<string, Promise<void>>()
const fingerprint = (article: ManagedNews) =>
  JSON.stringify([article.title, article.category, article.description, article.body])
function validEnglish(value: unknown): value is EnglishNews {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return ['title', 'category', 'description', 'body'].every(key =>
    typeof row[key] === 'string' && (row[key] as string).trim().length > 0)
}
// El cambio de idioma no modifica el contenido original en español.
const news = computed(() => managedNews.value.filter(article => article.published && article.title.trim()).map(article => {
  const cached = englishNews.value[article.id]
  const english = locale.value === 'en' && cached?.source === fingerprint(article) ? cached.translated : null
  return {
    id: article.id,
    category: english?.category ?? article.category,
    title: english?.title ?? article.title,
    description: english?.description ?? article.description,
    body: english?.body ?? (article.body?.trim() || article.description),
    image: article.image || '/images/cover-logistics.jpeg'
  }
}))
// Traducción bajo demanda; el backend cachea cada artículo y jamás expone la clave IA.
async function translateNewsToEnglish() {
  if (locale.value !== 'en') return
  const pending = managedNews.value.filter(article => article.published && article.title.trim() &&
    englishNews.value[article.id]?.source !== fingerprint(article))
  if (!pending.length) return
  englishLoading.value = true
  englishError.value = false
  async function translateOne(article: ManagedNews) {
    const key = article.id + ':' + fingerprint(article)
    let job = translating.get(key)
    if (!job) {
      job = (async () => {
        let translated: EnglishNews
        const source = fingerprint(article)
        for (let attempt = 0; attempt < 4; attempt++) {
          if (disposed || locale.value !== 'en') throw new Error('Translation stopped')
          const response = await fetch(`/api/content/news/${encodeURIComponent(article.id)}/translation?lang=en`, { cache: 'no-store' })
          if (response.ok) {
            const result: unknown = await response.json()
            if (!validEnglish(result)) throw new Error('Invalid news translation')
            translated = result
            englishNews.value = { ...englishNews.value, [article.id]: { source, translated } }
            return
          }
          // 503 = provider not configured: retrying cannot help. 429 can be temporary.
          if (![429, 502, 504].includes(response.status) || attempt === 3)
            throw new Error(`Translation unavailable: ${response.status}`)
          const retryAfter = Number(response.headers.get('retry-after'))
          const delayMs = response.status === 429
            ? (Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 90000) : 65000)
            : (attempt + 1) * 6000
          await new Promise(resolve => setTimeout(resolve, delayMs))
        }
      })()
      translating.set(key, job)
      void job.finally(() => translating.delete(key)).catch(() => {})
    }
    try { await job }
    catch { englishError.value = true }
  }
  // Limitar concurrencia para proteger el proveedor y respetar su cuota.
  const workers = Array.from({ length: Math.min(3, pending.length) }, async (_, i) => {
    for (let index = i; index < pending.length; index += Math.min(3, pending.length))
      await translateOne(pending[index])
  })
  await Promise.all(workers)
  englishLoading.value = false
}
watch(locale, () => { if (locale.value === 'en') void translateNewsToEnglish() })
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
  const article = news.value[index]
  if (!article) return
  activeArticleIndex.value = index
  const url = new URL(window.location.href)
  url.searchParams.set('article', article.id)
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  pauseStoryTimer()
}
function closeArticle() {
  activeArticleIndex.value = null
  const url = new URL(window.location.href)
  if (url.searchParams.has('article')) {
    url.searchParams.delete('article')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }
  startStoryTimer()
}
function syncArticleFromUrl() {
  const id = new URLSearchParams(window.location.search).get('article')
  const index = id ? news.value.findIndex(article => article.id === id) : -1
  activeArticleIndex.value = index >= 0 ? index : null
  if (index >= 0) { activeStoryIndex.value = index; pauseStoryTimer() }
  else if (news.value.length) startStoryTimer()
}
function handleArticleKeydown(event: KeyboardEvent) { if (event.key === 'Escape') closeArticle() }
let disposed = false
let requestVersion = 0
async function loadPublicNews() {
  const request = ++requestVersion
  try {
    // Las noticias creadas en el administrador de demostración solo existen en este navegador.
    // Vite Development muestra esas noticias localmente; producción siempre usa PostgreSQL.
    const localPreview = import.meta.env.DEV ? readManagedNews() : []
    let items: unknown
    if (localPreview.length) {
      items = localPreview
    } else {
      const response = await fetch('/api/content/news', { cache: 'no-store' })
      if (!response.ok) throw new Error('No se pudieron consultar las noticias.')
      items = await response.json()
    }
    if (!Array.isArray(items)) throw new Error('Respuesta de noticias inválida.')
    if (disposed || request !== requestVersion) return
    managedNews.value = items as ManagedNews[]
    newsError.value = false
    if (locale.value === 'en') void translateNewsToEnglish()
    if (activeStoryIndex.value >= news.value.length) activeStoryIndex.value = 0
    // Conserva el artículo seleccionado mediante su id durante recargas SignalR.
    syncArticleFromUrl()
    await nextTick()
    if (!news.value.length) { emblaApi?.destroy(); emblaApi = null }
    else if (!emblaApi && emblaViewport.value) {
      emblaApi = EmblaCarousel(emblaViewport.value, { align: 'start', loop: news.value.length > 1 })
      emblaApi.on('select', () => { activeStoryIndex.value = emblaApi?.selectedScrollSnap() ?? 0 })
    } else { emblaApi?.reInit({ loop: news.value.length > 1 }) }
    if (activeArticleIndex.value === null) startStoryTimer()
  } catch { if (!disposed && request === requestVersion) newsError.value = true }
  finally { if (!disposed && request === requestVersion) newsLoaded.value = true }
}
const unsubscribeNews = subscribeToChanges('news', () => { void loadPublicNews() })
const unsubscribeSync = subscribeToChanges('sync', () => { void loadPublicNews() })
onMounted(() => { window.addEventListener('keydown', handleArticleKeydown); window.addEventListener('popstate', syncArticleFromUrl); void loadPublicNews() })

onUnmounted(() => {
  disposed = true
  unsubscribeNews(); unsubscribeSync()
  window.removeEventListener('keydown', handleArticleKeydown)
  window.removeEventListener('popstate', syncArticleFromUrl)
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
      <div v-if="locale === 'en' && (englishLoading || englishError)" class="container news-translation-feedback" role="status">
        {{ englishLoading ? 'Translating news into English…' : 'English translation is temporarily unavailable for some articles.' }}
      </div>
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
.news-translation-feedback { padding-block: 10px; font-size: 13px; color: #aab8d0; }
.news-article-fulltext { white-space: pre-line; overflow-wrap: anywhere; }
.news-empty-hero { position: relative; z-index: 2; min-height: 320px; padding-top: 135px; padding-bottom: 95px; color: #fff; }
.news-empty-hero h1 { font-size: clamp(42px, 6vw, 76px); line-height: 1.1; margin: 18px 0; }
.news-empty-hero p:last-child { max-width: 640px; font-size: clamp(16px, 1.7vw, 20px); }
.news-editorial-hero:has(.news-empty-hero) { min-height: 0; background: linear-gradient(120deg, #980c26, #142240); }
</style>
