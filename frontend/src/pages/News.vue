<script setup lang="ts">
import IconSymbol from '../components/IconSymbol.vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EmblaCarousel, { type EmblaCarouselType } from 'embla-carousel'
import type { ManagedNews } from '../adminContent'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import { subscribeToChanges } from '../services/realtime'

// Article links already use this URL from Inicio; render their content as a full page.
const requestedArticleId = new URLSearchParams(window.location.search).get('article')
const articleHref = (id: string) => '/noticias?article=' + encodeURIComponent(id)
const managedNews = ref<ManagedNews[]>([])
const newsLoaded = ref(false)
const newsError = ref(false)
const activeStoryIndex = ref(0)
const emblaViewport = ref<HTMLElement | null>(null)
let emblaApi: EmblaCarouselType | null = null
// Sólo se muestran publicaciones del CMS; sin noticias predeterminadas.
type EnglishNews = Pick<ManagedNews, 'title' | 'category' | 'description' | 'body'>
const { locale } = useI18n({ useScope: 'global' })
const q = (es: string, en: string) => locale.value === 'en' ? en : es
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
const activeArticle = computed(() => requestedArticleId ? news.value.find(article => article.id === requestedArticleId) ?? null : null)
watch(activeArticle, article => {
  if (article) document.title = article.title + ' | Noticias | Grupo Castro Fallas'
})
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
  if (!requestedArticleId && storyTimer === undefined) startStoryTimer()
}
function selectStory(index: number) {
  activeStoryIndex.value = index
  emblaApi?.scrollTo(index)
  startStoryTimer()
}
let disposed = false
let requestVersion = 0
async function loadPublicNews() {
  const request = ++requestVersion
  try {
    const response = await fetch('/api/content/news', { cache: 'no-store' })
    if (!response.ok) throw new Error('No se pudieron consultar las noticias.')
    const items: unknown = await response.json()
    if (!Array.isArray(items)) throw new Error('Respuesta de noticias inválida.')
    if (disposed || request !== requestVersion) return
    managedNews.value = items as ManagedNews[]
    newsError.value = false
    if (locale.value === 'en') void translateNewsToEnglish()
    if (activeStoryIndex.value >= news.value.length) activeStoryIndex.value = 0
    await nextTick()
    if (!news.value.length) { emblaApi?.destroy(); emblaApi = null }
    else if (!emblaApi && emblaViewport.value) {
      emblaApi = EmblaCarousel(emblaViewport.value, { align: 'start', loop: news.value.length > 1 })
      emblaApi.on('select', () => { activeStoryIndex.value = emblaApi?.selectedScrollSnap() ?? 0 })
    } else { emblaApi?.reInit({ loop: news.value.length > 1 }) }
    if (!requestedArticleId) startStoryTimer()
  } catch { if (!disposed && request === requestVersion) newsError.value = true }
  finally { if (!disposed && request === requestVersion) newsLoaded.value = true }
}
const unsubscribeNews = subscribeToChanges('news', () => { void loadPublicNews() })
const unsubscribeSync = subscribeToChanges('sync', () => { void loadPublicNews() })
onMounted(() => { void loadPublicNews() })

onUnmounted(() => {
  disposed = true
  unsubscribeNews(); unsubscribeSync()
  pauseStoryTimer()
  emblaApi?.destroy()
  emblaApi = null
})
</script>

<template>
  <div class="app-site news-page">
    <SiteHeader v-if="requestedArticleId" active="noticias" />
    <template v-if="!requestedArticleId">
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
          <a class="news-editorial-hero__read" :href="articleHref(leadStory.id)"><IconSymbol glyph="↘" />{{ $t('custom.news.readArticle') }}</a>
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
        <p class="section-tag light-tag">{{ q('CASTRO FALLAS · ACTUALIDAD', 'CASTRO FALLAS · LATEST UPDATES') }}</p>
        <h1>{{ q('Noticias', 'News') }}</h1>
        <p v-if="!newsLoaded">{{ q('Cargando publicaciones…', 'Loading news…') }}</p>
        <p v-else-if="newsError">{{ q('No pudimos cargar las noticias en este momento. Inténtalo de nuevo más tarde.', 'We could not load the news right now. Please try again later.') }}</p>
        <p v-else>{{ q('Aún no hay noticias publicadas. Pronto compartiremos novedades.', 'No news has been published yet. We will share updates soon.') }}</p>
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
              <a :href="articleHref(article.id)">{{ $t('custom.news.readArticle') }} <IconSymbol glyph="↗" /></a>
            </div>
          </article>
        </div>
      </div>
    </main>

    </template>

    <!-- A requested article is a normal, full-height document section, not a modal. -->
    <main v-else id="noticia-completa" class="news-article-page">
      <template v-if="activeArticle">
        <nav class="container news-article-page__navigation" :aria-label="q('Navegación de noticias', 'News navigation')">
          <a href="/noticias"><IconSymbol glyph="←" /> {{ q('Volver a noticias', 'Back to news') }}</a>
        </nav>
        <article class="news-article-page__article">
          <div class="news-article-page__cover">
            <img :src="activeArticle.image" :alt="activeArticle.title" fetchpriority="high" />
          </div>
          <div class="container news-article-page__layout">
            <header class="news-article-page__heading">
              <p class="section-tag">{{ activeArticle.category }} · {{ $t('phrases.p074') }}</p>
              <h1>{{ activeArticle.title }}</h1>
            </header>
            <div class="news-article-page__content">
              <p v-if="activeArticle.description?.trim() && activeArticle.description.trim() !== activeArticle.body.trim()" class="news-article-page__summary">{{ activeArticle.description }}</p>
              <div class="news-article-page__body">{{ activeArticle.body }}</div>
            </div>
            <a class="news-article-page__back" href="/noticias"><IconSymbol glyph="←" /> {{ q('Ver todas las noticias', 'View all news') }}</a>
          </div>
        </article>
      </template>
      <div v-else class="container news-article-page__empty" role="status">
        <h1>{{ !newsLoaded ? q('Cargando noticia…', 'Loading article…') : newsError ? q('No pudimos cargar la noticia.', 'We could not load this article.') : q('Noticia no disponible', 'Article unavailable') }}</h1>
        <p v-if="newsLoaded">{{ newsError ? q('Intentá nuevamente más tarde.', 'Please try again later.') : q('La noticia solicitada no existe o ya no está publicada.', 'The requested article does not exist or is no longer published.') }}</p>
        <a href="/noticias">{{ q('Volver a noticias', 'Back to news') }}</a>
      </div>
    </main>

    <SiteFooter />
  </div>
</template>

<style scoped>
.news-translation-feedback { padding-block: 10px; font-size: 13px; color: #aab8d0; }
.news-article-page { min-height:70vh; padding:24px 0 90px; background:#fff; color:#20242b; }
.news-article-page__navigation { padding-bottom:23px; }
.news-article-page__navigation a, .news-article-page__back { display:inline-flex; align-items:center; gap:10px; color:#ad0b26; text-decoration:none; font-size:13px; font-weight:850; }
.news-article-page__navigation a:hover, .news-article-page__back:hover { text-decoration:underline; }
.news-article-page__cover { height:clamp(240px,38vw,510px); overflow:hidden; background:#111a30; }
.news-article-page__cover img { display:block; width:100%; height:100%; object-fit:cover; }
.news-article-page__layout { max-width:1040px; padding-top:clamp(38px,5vw,70px); }
.news-article-page__heading { max-width:940px; padding-bottom:28px; border-bottom:1px solid rgba(23,35,54,.16); }
.news-article-page__heading .section-tag { margin:0 0 17px; color:#ad0b26; }
.news-article-page__heading h1 { margin:0; font-family:'Arial Black',system-ui,sans-serif; font-size:clamp(34px,5.5vw,70px); letter-spacing:-.045em; line-height:1.13; overflow-wrap:anywhere; }
.news-article-page__content { max-width:870px; padding:30px 0 48px; }
.news-article-page__summary { margin:0 0 30px; font-size:clamp(18px,2vw,23px); font-weight:600; line-height:1.65; }
.news-article-page__body { font-size:clamp(16px,1.5vw,19px); line-height:1.95; white-space:pre-line; overflow-wrap:anywhere; }
.news-article-page__back { padding-top:24px; border-top:1px solid rgba(23,35,54,.16); }
.news-article-page__empty { padding:80px 0 130px; }
.news-article-page__empty h1 { font-size:clamp(30px,4vw,48px); }
.news-article-page__empty a { color:#ad0b26; }
/* Override the site's broad `html.theme-dark .app-site main` gradient only on article pages. */
:global(html.theme-dark .app-site.news-page main.news-article-page) { background:#01081d; color:#fff; }
:global(html.theme-dark) .news-article-page__heading, :global(html.theme-dark) .news-article-page__back { border-color:rgba(255,255,255,.18); }
:global(html.theme-dark) .news-article-page__navigation a, :global(html.theme-dark) .news-article-page__back, :global(html.theme-dark) .news-article-page__empty a { color:#ff5570; }
:global(html.theme-dark) .news-article-page__heading .section-tag { color:#ff5570; }
@media (max-width:600px) { .news-article-page { padding-bottom:60px; } .news-article-page__navigation { padding-bottom:16px; } .news-article-page__cover { height:230px; } .news-article-page__layout { padding-top:30px; } .news-article-page__heading { padding-bottom:23px; } .news-article-page__content { padding-top:24px; } }
.news-empty-hero { position: relative; z-index: 2; min-height: 320px; padding-top: 135px; padding-bottom: 95px; color: #fff; }
.news-empty-hero h1 { font-size: clamp(42px, 6vw, 76px); line-height: 1.1; margin: 18px 0; }
.news-empty-hero p:last-child { max-width: 640px; font-size: clamp(16px, 1.7vw, 20px); }
.news-editorial-hero:has(.news-empty-hero) { min-height: 0; background: linear-gradient(120deg, #980c26, #142240); }
</style>
