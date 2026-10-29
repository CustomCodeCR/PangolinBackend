<script setup lang="ts">
import IconSymbol from '../components/IconSymbol.vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EmblaCarousel, { type EmblaCarouselType } from 'embla-carousel'
import type { ManagedNews } from '../adminContent'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import { subscribeToChanges } from '../services/realtime'

// Los enlaces anteriores con article=ID siguen funcionando mientras cada noticia usa una ruta legible.
const requestedArticleId = new URLSearchParams(window.location.search).get('article')
const requestedArticleSlug = window.location.pathname.match(/^\/noticias\/([^/]+)\/?$/)?.[1] ?? null
const isArticlePage = Boolean(requestedArticleId || requestedArticleSlug)
const managedNews = ref<ManagedNews[]>([])
const newsExpirationClock = ref(Date.now())
const slugifyNewsTitle = (title: string) => title.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'noticia'
const articleSlug = (article: { id: string; title: string; publishedAt?: string | null }) =>
  `${article.publishedAt?.slice(0,10) || 'sin-fecha'}-${slugifyNewsTitle(article.title)}-${article.id.replace(/-/g, '').slice(-8).toLowerCase()}`
const articlePath = (article: { id: string; title: string; publishedAt?: string | null }) => `/noticias/${articleSlug(article)}`
const articleHref = (id: string) => {
  const article = managedNews.value.find(item => item.id === id)
  return article ? articlePath(article) : '/noticias'
}
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
const news = computed(() => managedNews.value.filter(article => article.published && article.title.trim() &&
  (!article.expiresAt || Date.parse(article.expiresAt) > newsExpirationClock.value)).map(article => {
  const cached = englishNews.value[article.id]
  const english = locale.value === 'en' && cached?.source === fingerprint(article) ? cached.translated : null
  return {
    id: article.id,
    category: english?.category ?? article.category,
    title: english?.title ?? article.title,
    description: english?.description ?? article.description,
    body: english?.body ?? (article.body?.trim() || article.description),
    image: article.image || '/images/cover-logistics.jpeg',
    author: article.author || '',
    publishedAt: article.publishedAt || null
  }
}))
// Traducción bajo demanda; el backend cachea cada artículo y jamás expone la clave IA.
async function translateNewsToEnglish() {
  if (locale.value !== 'en') return
  const pending = managedNews.value.filter(article => article.published && article.title.trim() &&
    (!article.expiresAt || Date.parse(article.expiresAt) > newsExpirationClock.value) &&
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
const formatArticleDate = (iso: string | null | undefined) => iso
  ? new Intl.DateTimeFormat(locale.value === 'en' ? 'en-US' : 'es-CR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso)) : ''
const leadStory = computed(() => news.value[activeStoryIndex.value] ?? news.value[0])
const carouselStories = computed(() => news.value.map((article, index) => ({ ...article, index })))
const activeArticle = computed(() => {
  if (requestedArticleId) return news.value.find(article => article.id === requestedArticleId) ?? null
  const idSuffix = requestedArticleSlug?.match(/-([a-f0-9]{8})$/i)?.[1]
  if (!idSuffix) return null
  return news.value.find(article => article.id.replace(/-/g, '').toLowerCase().endsWith(idSuffix.toLowerCase())) ?? null
})
const articleTextOpen = ref(false)
const articleDragging = ref(false)
const articleDragOffset = ref(0)
const articleScrollProgress = ref(0)
const articleStage = ref<HTMLElement | null>(null)
const articleStoryPanel = ref<HTMLElement | null>(null)
const articleRevealProgress = computed(() => {
  if (!articleDragging.value) {
    if (window.matchMedia('(max-width: 720px)').matches) return articleTextOpen.value ? 1 : 0
    return articleScrollProgress.value
  }
  const progress = articleTextOpen.value
    ? 1 - articleDragOffset.value / 220
    : -articleDragOffset.value / 220
  return Math.max(0, Math.min(1, progress))
})
let articleScrollFrame = 0
function updateArticleScrollProgress() {
  if (window.matchMedia('(max-width: 720px)').matches) {
    articleScrollProgress.value = 0
    return
  }
  const stage = articleStage.value
  const storyPanel = articleStoryPanel.value
  if (!stage || !storyPanel) {
    articleScrollProgress.value = 0
    return
  }
  const revealDistance = Math.max(0, stage.getBoundingClientRect().height - 86 - storyPanel.getBoundingClientRect().top)
  const revealRange = Math.max(1, stage.getBoundingClientRect().height - 86)
  articleScrollProgress.value = Math.max(0, Math.min(1, revealDistance / revealRange))
}
function scheduleArticleScrollProgress() {
  if (articleScrollFrame) return
  articleScrollFrame = window.requestAnimationFrame(() => {
    articleScrollFrame = 0
    updateArticleScrollProgress()
  })
}
const articlePanelMarginTop = computed(() => {
  const base = window.matchMedia('(max-width: 720px)').matches ? -52 : -86
  const offset = articleDragging.value
    ? (articleTextOpen.value ? -220 + articleDragOffset.value : articleDragOffset.value)
    : articleTextOpen.value ? -220 : 0
  return `${base + offset}px`
})
const articleVisualStyle = computed(() => ({
  '--article-reveal-progress': articleRevealProgress.value.toFixed(3),
  '--article-visual-filter': `blur(${(articleRevealProgress.value * 12).toFixed(1)}px)`,
  '--article-visual-opacity': `${(1 - articleRevealProgress.value * 0.22).toFixed(3)}`
}))
const articleReadingDragMaxHeight = computed(() => {
  if (!articleDragging.value) return undefined
  const collapsedHeight = window.matchMedia('(max-width: 720px)').matches ? 250 : 235
  const revealDistance = articleTextOpen.value
    ? Math.max(0, articleDragOffset.value)
    : Math.max(0, -articleDragOffset.value)
  const height = articleTextOpen.value
    ? Math.max(collapsedHeight, 5000 - revealDistance * 26)
    : Math.min(5000, collapsedHeight + revealDistance * 26)
  return `${height}px`
})
let articleDragStartY = 0
let articleDragPointerId = -1
let articleDidDrag = false
let suppressArticleHandleClick = false
function startArticlePanelDrag(event: PointerEvent) {
  // Mouse has its own fallback below: this keeps desktop dragging reliable in
  // browsers that stop delivering pointer moves after a transformed handle.
  if (event.pointerType === 'mouse' || articleDragging.value) return
  beginArticlePanelDrag(event.clientY)
  articleDragPointerId = event.pointerId
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  // Track movement on the window so the panel keeps following the cursor even
  // if the handle moves away from underneath it while the panel is dragged.
  window.addEventListener('pointermove', moveArticlePanelDrag, { capture: true, passive: true })
  window.addEventListener('pointerup', finishArticlePanelDrag, true)
  window.addEventListener('pointercancel', cancelArticlePanelDrag, true)
}
function moveArticlePanelDrag(event: PointerEvent) {
  if (!articleDragging.value || event.pointerId !== articleDragPointerId) return
  updateArticlePanelDrag(event.clientY)
}
function beginArticlePanelDrag(clientY: number) {
  if (articleDragging.value) return
  articleDragStartY = clientY
  articleDragOffset.value = 0
  articleDragging.value = true
  articleDidDrag = false
}
function updateArticlePanelDrag(clientY: number) {
  if (!articleDragging.value) return
  const distance = clientY - articleDragStartY
  articleDidDrag ||= Math.abs(distance) > 8
  articleDragOffset.value = articleTextOpen.value
    ? Math.max(-55, Math.min(190, distance))
    : Math.max(-190, Math.min(55, distance))
}
function finishArticlePanelDrag(event: PointerEvent) {
  if (!articleDragging.value || event.pointerId !== articleDragPointerId) return
  const distance = event.clientY - articleDragStartY
  stopArticlePanelDragTracking()
  settleArticlePanelDrag(distance)
}
function settleArticlePanelDrag(distance: number) {
  articleDragging.value = false
  articleDragOffset.value = 0
  if (!articleDidDrag) return
  suppressArticleHandleClick = true
  if (!articleTextOpen.value && distance < -45) articleTextOpen.value = true
  else if (articleTextOpen.value && distance > 45) articleTextOpen.value = false
  window.setTimeout(() => { suppressArticleHandleClick = false }, 250)
}
function cancelArticlePanelDrag(event: PointerEvent) {
  if (!articleDragging.value || event.pointerId !== articleDragPointerId) return
  stopArticlePanelDragTracking()
  articleDragging.value = false
  articleDragOffset.value = 0
}
function stopArticlePanelDragTracking() {
  articleDragPointerId = -1
  window.removeEventListener('pointermove', moveArticlePanelDrag, true)
  window.removeEventListener('pointerup', finishArticlePanelDrag, true)
  window.removeEventListener('pointercancel', cancelArticlePanelDrag, true)
}
function startArticlePanelMouseDrag(event: MouseEvent) {
  if (event.button !== 0 || articleDragging.value) return
  event.preventDefault()
  beginArticlePanelDrag(event.clientY)
  window.addEventListener('mousemove', moveArticlePanelMouseDrag, true)
  window.addEventListener('mouseup', finishArticlePanelMouseDrag, true)
}
function moveArticlePanelMouseDrag(event: MouseEvent) {
  updateArticlePanelDrag(event.clientY)
}
function finishArticlePanelMouseDrag(event: MouseEvent) {
  if (!articleDragging.value) return
  const distance = event.clientY - articleDragStartY
  window.removeEventListener('mousemove', moveArticlePanelMouseDrag, true)
  window.removeEventListener('mouseup', finishArticlePanelMouseDrag, true)
  settleArticlePanelDrag(distance)
}
function toggleArticleText() {
  if (suppressArticleHandleClick) { suppressArticleHandleClick = false; return }
  articleTextOpen.value = !articleTextOpen.value
}
onUnmounted(() => {
  stopArticlePanelDragTracking()
  window.removeEventListener('mousemove', moveArticlePanelMouseDrag, true)
  window.removeEventListener('mouseup', finishArticlePanelMouseDrag, true)
})
// Render the CMS plain text as readable HTML paragraphs without changing its wording.
const activeArticleParagraphs = computed(() => (activeArticle.value?.body ?? '')
  .split(/\n\s*\n/)
  .map(paragraph => paragraph.trim())
  .filter(Boolean))
function setNewsMeta(attribute: 'name' | 'property', key: string, content: string | null) {
  const selector = `meta[${attribute}="${key}"]`
  let element = document.head.querySelector<HTMLMetaElement>(selector)
  if (!content) {
    element?.remove()
    return
  }
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.append(element)
  }
  element.content = content
}
watch(activeArticle, article => {
  if (!article) return
  const title = `Grupo Castro Fallas | ${article.title}`
  document.title = title
  setNewsMeta('name', 'description', article.description)
  setNewsMeta('property', 'og:title', title)
  setNewsMeta('property', 'og:description', article.description)
  setNewsMeta('property', 'og:type', 'article')
  setNewsMeta('property', 'og:site_name', 'Grupo Castro Fallas')
  setNewsMeta('name', 'twitter:title', title)
  setNewsMeta('name', 'twitter:description', article.description)

  const host = window.location.hostname.toLowerCase()
  const isOfficialHost = host === 'logisticacastrofallas.com' || host === 'www.logisticacastrofallas.com'
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!isOfficialHost) {
    canonical?.remove()
    setNewsMeta('property', 'og:url', null)
    return
  }
  const sourceArticle = managedNews.value.find(item => item.id === article.id)
  const canonicalPath = sourceArticle ? articlePath(sourceArticle) : window.location.pathname
  const canonicalUrl = new URL(canonicalPath, 'https://www.logisticacastrofallas.com')
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.rel = 'canonical'
    document.head.append(canonical)
  }
  canonical.href = canonicalUrl.href
  setNewsMeta('property', 'og:url', canonicalUrl.href)

  if (window.location.pathname !== canonicalPath || new URLSearchParams(window.location.search).has('article')) {
    const query = new URLSearchParams(window.location.search)
    query.delete('article')
    const queryString = query.toString()
    window.history.replaceState(window.history.state, '', canonicalPath + (queryString ? `?${queryString}` : '') + window.location.hash)
  }
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
  if (!isArticlePage && storyTimer === undefined) startStoryTimer()
}
function selectStory(index: number) {
  activeStoryIndex.value = index
  emblaApi?.scrollTo(index)
  startStoryTimer()
}
let disposed = false
let requestVersion = 0
let newsExpirationTimer: number | undefined
function scheduleNewsExpiration() {
  if (newsExpirationTimer !== undefined) window.clearTimeout(newsExpirationTimer)
  newsExpirationTimer = undefined
  const nextExpiry = Math.min(...managedNews.value
    .filter(article => article.published && article.expiresAt)
    .map(article => Date.parse(article.expiresAt!))
    .filter(value => Number.isFinite(value) && value > Date.now()))
  if (!Number.isFinite(nextExpiry)) return
  // Los navegadores limitan setTimeout a ~24 días; reprogramar si vence después.
  const delay = Math.min(2_147_000_000, Math.max(1000, nextExpiry - Date.now() + 1000))
  newsExpirationTimer = window.setTimeout(() => {
    newsExpirationClock.value = Date.now()
    void loadPublicNews()
  }, delay)
}
function refreshVisibleNews() {
  if (document.visibilityState === 'visible') void loadPublicNews()
}
async function loadPublicNews() {
  newsExpirationClock.value = Date.now()
  const request = ++requestVersion
  try {
    const response = await fetch('/api/content/news', { cache: 'no-store' })
    if (!response.ok) throw new Error('No se pudieron consultar las noticias.')
    const items: unknown = await response.json()
    if (!Array.isArray(items)) throw new Error('Respuesta de noticias inválida.')
    if (disposed || request !== requestVersion) return
    managedNews.value = items as ManagedNews[]
    scheduleNewsExpiration()
    newsError.value = false
    if (locale.value === 'en') void translateNewsToEnglish()
    if (activeStoryIndex.value >= news.value.length) activeStoryIndex.value = 0
    await nextTick()
    updateArticleScrollProgress()
    if (!news.value.length) { emblaApi?.destroy(); emblaApi = null }
    else if (!emblaApi && emblaViewport.value) {
      emblaApi = EmblaCarousel(emblaViewport.value, { align: 'start', loop: news.value.length > 1 })
      emblaApi.on('select', () => { activeStoryIndex.value = emblaApi?.selectedScrollSnap() ?? 0 })
    } else { emblaApi?.reInit({ loop: news.value.length > 1 }) }
    if (!isArticlePage) startStoryTimer()
  } catch { if (!disposed && request === requestVersion) newsError.value = true }
  finally { if (!disposed && request === requestVersion) newsLoaded.value = true }
}
const unsubscribeNews = subscribeToChanges('news', () => { void loadPublicNews() })
const unsubscribeSync = subscribeToChanges('sync', () => { void loadPublicNews() })
onMounted(() => {
  window.addEventListener('scroll', scheduleArticleScrollProgress, { passive: true })
  window.addEventListener('resize', scheduleArticleScrollProgress, { passive: true })
  document.addEventListener('visibilitychange', refreshVisibleNews)
  void loadPublicNews()
})

onUnmounted(() => {
  window.removeEventListener('scroll', scheduleArticleScrollProgress)
  window.removeEventListener('resize', scheduleArticleScrollProgress)
  document.removeEventListener('visibilitychange', refreshVisibleNews)
  if (newsExpirationTimer !== undefined) window.clearTimeout(newsExpirationTimer)
  if (articleScrollFrame) window.cancelAnimationFrame(articleScrollFrame)
  disposed = true
  unsubscribeNews(); unsubscribeSync()
  pauseStoryTimer()
  emblaApi?.destroy()
  emblaApi = null
})
</script>

<template>
  <div class="app-site news-page" :class="{ 'news-article-mode': isArticlePage }">
    <SiteHeader v-if="isArticlePage" active="noticias" overlay />
    <template v-if="!isArticlePage">
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

    <!-- Detalle editorial: página completa, sin alterar la portada. -->
    <main v-else id="noticia-completa" class="news-article-page" :class="{ 'is-article-dragging': articleDragging }" :style="articleVisualStyle">
      <template v-if="activeArticle">
        <nav class="container news-article-page__navigation" :aria-label="q('Navegación de noticias', 'News navigation')">
          <a href="/noticias"><IconSymbol glyph="←" /> {{ q('Volver a noticias', 'Back to news') }}</a>
          <span>{{ q('GRUPO CASTRO FALLAS / ACTUALIDAD', 'GRUPO CASTRO FALLAS / NEWS') }}</span>
        </nav>
        <article class="news-article-page__article">
          <div ref="articleStage" class="container news-article-page__stage">
            <div class="news-article-page__panel">
              <div class="news-article-page__hero">
                <figure class="news-article-page__visual">
                  <img :src="activeArticle.image" :alt="activeArticle.title" fetchpriority="high" decoding="async" />
                  <figcaption class="news-article-page__visual-mark">
                    <span class="news-article-page__visual-dot" aria-hidden="true"></span>
                    {{ q('HISTORIAS QUE NOS CONECTAN', 'STORIES THAT CONNECT US') }}
                  </figcaption>
                </figure>
              </div>
            </div>
          </div>
          <div ref="articleStoryPanel" class="news-article-page__story-panel" :class="{ 'is-expanded': articleTextOpen, 'is-dragging': articleDragging }" :style="{ marginTop: articlePanelMarginTop }">
            <button
              class="news-article-page__handle"
              type="button"
              :aria-expanded="articleTextOpen"
              aria-controls="contenido-noticia"
              :aria-label="articleTextOpen ? q('Cerrar texto de la noticia', 'Close article text') : q('Deslizá hacia arriba para leer la noticia', 'Drag up to read the article')"
              @pointerdown="startArticlePanelDrag"
              @mousedown="startArticlePanelMouseDrag"
              @click="toggleArticleText"
            ><span aria-hidden="true"></span></button>
            <header class="news-article-page__story-heading">
              <div class="news-article-page__heading-eyebrow">
                <p class="news-article-page__overline">{{ activeArticle.category }}</p>
                <time v-if="activeArticle.publishedAt" class="news-article-page__date" :datetime="activeArticle.publishedAt">{{ formatArticleDate(activeArticle.publishedAt) }}</time>
              </div>
              <h1>{{ activeArticle.title }}</h1>
            </header>
            <div class="container news-article-page__meta" :aria-label="q('Datos de la noticia', 'Article details')">
              <p class="news-article-page__publisher"><span aria-hidden="true">CF</span>{{ q('GRUPO CASTRO FALLAS', 'GRUPO CASTRO FALLAS') }}</p>
              <p class="news-article-page__meta-category"><span aria-hidden="true"></span>{{ activeArticle.category }}</p>
            </div>
            <div class="news-article-page__reading" :class="{ 'is-expanded': articleTextOpen, 'is-dragging': articleDragging }" :style="{ maxHeight: articleReadingDragMaxHeight }">
              <figure class="news-article-page__side-image" aria-hidden="true">
                <img :src="activeArticle.image" alt="" loading="lazy" />
              </figure>
              <section id="contenido-noticia" class="news-article-page__content" :aria-label="q('Contenido de la noticia', 'Article content')">
                <p class="news-article-page__content-kicker">{{ activeArticle.category }} <span aria-hidden="true">/</span> {{ q('ARTÍCULO COMPLETO', 'FULL ARTICLE') }}</p>
                <p v-if="activeArticle.description?.trim() && activeArticle.description.trim() !== activeArticle.body?.trim()" class="news-article-page__standfirst">{{ activeArticle.description }}</p>
                <div class="news-article-page__body">
                  <p v-for="(paragraph, index) in activeArticleParagraphs" :key="index">{{ paragraph }}</p>
                </div>
                <p v-if="activeArticle.author" class="news-article-page__author">{{ q('Autor:', 'Author:') }} <strong>{{ activeArticle.author }}</strong></p>
                <div class="news-article-page__closing">
                  <span class="news-article-page__closing-line" aria-hidden="true"></span>
                  <span>{{ q('FIN DEL ARTÍCULO', 'END OF ARTICLE') }}</span>
                </div>
                <a class="news-article-page__back" href="/noticias"><IconSymbol glyph="←" /> {{ q('Ver todas las noticias', 'View all news') }}</a>
              </section>
            </div>
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
.news-article-page{--article-ink:#16181d;--article-muted:#626873;--article-line:rgba(20,24,32,.15);--article-accent:#c8102e;position:relative;min-height:0;padding:0 0 0;background:#fff;color:var(--article-ink)}
.news-article-page__navigation{position:absolute;z-index:6;top:clamp(88px,10vh,112px);left:0;right:0;display:flex;align-items:center;justify-content:space-between;gap:20px;width:min(1480px,calc(100% - 64px));max-width:none;margin-inline:auto;padding-block:15px 20px}
.news-article-page__stage{--article-hero-flow-height:clamp(430px,58vh,680px);position:sticky;top:0;z-index:0;width:100%;max-width:none;height:var(--article-hero-flow-height);margin:0 auto}
.news-article-page__navigation a,.news-article-page__back{display:inline-flex;align-items:center;gap:10px;font-size:12px;font-weight:800;text-decoration:none}
.news-article-page__navigation a{color:#fff!important;text-shadow:0 1px 8px rgba(0,0,0,.65)}
.news-article-page__navigation>span{color:#fff!important;text-shadow:0 1px 8px rgba(0,0,0,.65)}
.news-article-page__back{color:#16181d}
.news-article-page__navigation>span{color:var(--article-muted);font-size:10px;font-weight:800;letter-spacing:.13em}
.news-article-page__navigation a:hover,.news-article-page__back:hover{text-decoration:underline}
.news-article-page__panel{height:100%;overflow:hidden;border:0;border-radius:0;background:#f3f3f3;box-shadow:none}
.news-article-page__hero{position:relative;display:flex;align-items:flex-end;height:100%;min-height:0}
.news-article-page__visual{position:absolute;z-index:0;inset:0;min-width:0;min-height:0;margin:0;overflow:hidden;background:#182339}
.news-article-page__visual::after{position:absolute;inset:0;content:"";background:linear-gradient(0deg,rgba(3,7,16,.56) 0%,rgba(3,7,16,.2) 23%,transparent 58%),linear-gradient(90deg,rgba(200,16,46,calc(var(--article-reveal-progress,0)*.16)) 0%,transparent 82%);pointer-events:none;transition:background .22s linear}
.news-article-page__visual img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover;object-position:center 42%;filter:var(--article-visual-filter,blur(0));opacity:var(--article-visual-opacity,1);transform:scale(1.04);transition:filter .22s linear,opacity .22s linear}
.news-article-page.is-article-dragging .news-article-page__visual img{transition:none}
.news-article-page__visual-mark{position:absolute;z-index:1;top:26px;right:28px;display:flex;align-items:center;gap:9px;margin:0;color:#fff;font-size:10px;font-weight:800;letter-spacing:.13em;text-shadow:0 1px 6px rgba(0,0,0,.45)}
.news-article-page__visual-mark{top:auto;right:auto;bottom:clamp(105px,12vh,155px);left:clamp(24px,5vw,72px)}
.news-article-page__visual-dot{width:7px;height:7px;flex:none;border-radius:50%;background:#c8102e}
.news-article-page__overline{display:flex;align-items:center;gap:10px;margin:0 0 15px;color:#fff;font-size:11px;font-weight:850;letter-spacing:.15em;text-transform:uppercase;text-shadow:0 1px 8px rgba(0,0,0,.55);overflow-wrap:anywhere}
.news-article-page__overline::before{width:23px;height:2px;flex:none;background:#c8102e;content:""}
.news-article-page__story-panel{position:relative;z-index:4;width:100%;max-width:1600px;margin:-86px auto 0;padding:20px clamp(28px,5.5vw,88px) 70px;overflow:hidden;border:1px solid rgba(20,24,32,.12);border-radius:42px 42px 0 0;background:radial-gradient(ellipse 72% 60% at 0% 0%,rgba(200,16,46,.12),transparent 74%),#fff;box-shadow:0 -22px 72px rgba(0,0,0,.1),inset 0 1px 0 rgba(255,255,255,.7);transition:margin-top .45s cubic-bezier(.2,.72,.25,1)}
.news-article-page__story-panel.is-dragging{transition:none}
.news-article-page__handle{display:none;position:relative;z-index:2;width:100%;height:30px;place-items:center;margin:0 auto 16px;padding:0;border:0;border-radius:99px;background:transparent;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}
.news-article-page__handle:active{cursor:grabbing}
.news-article-page__handle span{display:none}
.news-article-page__handle:focus-visible{outline:2px solid rgba(237,41,70,.75);outline-offset:3px}
.news-article-page__story-heading{width:100%;max-width:none;margin:0 0 8px;padding-top:32px}
.news-article-page__heading-eyebrow{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 18px;margin-bottom:13px}
.news-article-page__story-heading .news-article-page__overline{flex:1 1 160px;min-width:0;margin-bottom:0;color:var(--article-accent);text-shadow:none}
.news-article-page__story-heading h1{max-width:1000px;margin:0;color:var(--article-ink);font-family:"Arial Black",Impact,system-ui,sans-serif;font-size:clamp(36px,5.2vw,70px);font-weight:900;letter-spacing:-.055em;line-height:1.02;overflow-wrap:anywhere}
.news-article-page__story-panel>.news-article-page__meta{width:100%;margin-inline:auto}
.news-article-page__meta{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-block:19px;border-bottom:1px solid var(--article-line)}
.news-article-page__publisher,.news-article-page__meta-category{display:flex;align-items:center;gap:10px;margin:0;color:var(--article-muted);font-size:10px;font-weight:850;letter-spacing:.1em}
.news-article-page__publisher>span{display:grid;width:30px;height:30px;place-items:center;border-radius:50%;background:#c8102e;color:#fff;font-size:9px;letter-spacing:0}
.news-article-page__meta-category>span{width:7px;height:7px;border-radius:50%;background:#c8102e}
.news-article-page__reading{position:relative;display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,.8fr);align-items:start;gap:clamp(30px,5vw,66px);max-height:none;overflow:visible;padding-top:clamp(27px,3.2vw,42px)}
.news-article-page__reading.is-expanded{max-height:none}
.news-article-page__reading.is-dragging{transition:none}
.news-article-page__content{min-width:0;max-width:700px;scroll-margin-top:100px}
.news-article-page__content-kicker{margin:0 0 25px;color:var(--article-accent);font-size:10px;font-weight:850;letter-spacing:.13em;text-transform:uppercase}
.news-article-page__content-kicker span{margin-inline:9px;color:#a9b2c1}
.news-article-page__standfirst{margin:0 0 27px;color:#202329;font-size:clamp(21px,2.3vw,29px);font-weight:750;letter-spacing:-.035em;line-height:1.35;overflow-wrap:anywhere}
.news-article-page__body{color:var(--article-ink);font-size:clamp(16px,1.3vw,18px);font-weight:400;line-height:1.85;overflow-wrap:anywhere}
.news-article-page__body p{margin:0 0 1.35em;white-space:pre-line}
.news-article-page__side-image{position:relative;align-self:start;top:auto;min-width:0;margin:0;overflow:hidden;aspect-ratio:1.55;border-radius:20px;background:#131c2b}
.news-article-page__side-image img{display:block;width:100%;height:100%;object-fit:cover;object-position:center 42%}
.news-article-page__closing{display:flex;align-items:center;gap:16px;margin-top:clamp(42px,6vw,76px);color:var(--article-muted);font-size:10px;font-weight:800;letter-spacing:.12em;white-space:nowrap}
.news-article-page__closing-line{width:56px;height:2px;background:#c8102e}
.news-article-page__story-heading{position:relative;min-height:50px}
.news-article-page__date{display:block;flex:0 1 auto;max-width:100%;margin:0 0 0 auto;color:var(--article-muted);font-size:12px;font-weight:800;letter-spacing:.035em;text-align:right}
.news-article-page__author{margin:35px 0 0;padding-top:20px;border-top:1px solid var(--article-line);color:var(--article-muted);font-size:14px}
.news-article-page__author strong{color:var(--article-ink);font-weight:800}
.news-article-page__back{margin-top:25px;padding-top:19px;border-top:1px solid var(--article-line)}
.news-article-page__empty{padding:80px 0 130px}
.news-article-page__empty h1{font-size:clamp(30px,4vw,48px)}
.news-article-page__empty a{color:var(--article-accent)}
.news-article-page a:focus-visible{outline:2px solid var(--article-accent);outline-offset:5px}
:global(html:not(.theme-dark) .app-site.news-page.news-article-mode){background:radial-gradient(ellipse 68% 520px at 0% 0%,rgba(200,16,46,.12) 0%,rgba(200,16,46,.055) 38%,rgba(200,16,46,.02) 60%,transparent 80%),#fff fixed!important;background-attachment:fixed!important;color:#16181d}
:global(html:not(.theme-dark) .app-site.news-page main.news-article-page){--article-ink:#16181d;--article-muted:#626873;--article-line:rgba(20,24,32,.15);--article-accent:#c8102e;background:radial-gradient(ellipse 68% 520px at 0% 0%,rgba(200,16,46,.12) 0%,rgba(200,16,46,.055) 38%,rgba(200,16,46,.02) 60%,transparent 80%),#fff fixed!important;background-attachment:fixed!important;color:var(--article-ink)}
:global(html:not(.theme-dark) .app-site.news-page .news-article-page__navigation a),:global(html:not(.theme-dark) .app-site.news-page .news-article-page__navigation>span){color:#fff!important;text-shadow:0 1px 8px rgba(0,0,0,.65)!important}
:global(html:not(.theme-dark) .news-article-page__visual-mark){color:#fff;text-shadow:0 1px 8px rgba(0,0,0,.65)}
:global(html.theme-dark .app-site.news-page main.news-article-page){--article-ink:#f2f3f6;--article-muted:#b5bac6;--article-line:rgba(235,241,252,.16);--article-accent:#ed2946;background:radial-gradient(ellipse 68% 520px at 0% 0%,rgba(214,14,52,.3) 0%,rgba(178,11,45,.16) 38%,rgba(126,10,34,.06) 60%,transparent 80%),linear-gradient(90deg,#211018 0%,#160d17 46%,#01081d 100%),#01081d fixed!important;background-attachment:fixed!important;color:var(--article-ink)}
:global(html.theme-dark .app-site.news-page.news-article-mode){background:radial-gradient(ellipse 68% 520px at 0% 0%,rgba(214,14,52,.3) 0%,rgba(178,11,45,.16) 38%,rgba(126,10,34,.06) 60%,transparent 80%),linear-gradient(90deg,#211018 0%,#160d17 46%,#01081d 100%) fixed!important;background-attachment:fixed!important}
:global(html.theme-dark .site-header.site-header--overlay){position:absolute!important;top:0;left:0;width:100%;background:linear-gradient(180deg,rgba(1,8,29,.72),rgba(1,8,29,.2) 72%,transparent)!important}
:global(body:has(.news-article-page) .site-header.site-header--overlay .menu-toggle){border:1px solid rgba(255,255,255,.46)!important;border-radius:50%!important;background:rgba(255,255,255,.12)!important;box-shadow:none!important;color:#fff!important;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
:global(html.theme-dark .news-article-page__navigation a),:global(html.theme-dark .news-article-page__navigation>span){color:#fff;text-shadow:0 1px 8px rgba(0,0,0,.55)}
:global(html.theme-dark .news-article-page__meta){border-color:rgba(235,241,252,.16)}
:global(html.theme-dark .news-article-page__visual::after){background:linear-gradient(0deg,rgba(3,7,16,.56) 0%,rgba(3,7,16,.2) 23%,transparent 58%),linear-gradient(90deg,rgba(3,9,24,calc(var(--article-reveal-progress,0)*.3)) 0%,transparent 82%)}
:global(html.theme-dark .news-article-page__story-panel){border-color:rgba(235,241,252,.16);background:radial-gradient(ellipse 78% 75% at 0% 0%,rgba(178,11,45,.25),transparent 72%),linear-gradient(110deg,rgba(10,14,29,.98) 0%,rgba(3,11,32,.98) 72%);box-shadow:0 -24px 72px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.1);-webkit-backdrop-filter:blur(16px) saturate(135%);backdrop-filter:blur(16px) saturate(135%)}
:global(html.theme-dark .news-article-page__story-heading .news-article-page__overline){color:#ff687c}
:global(html.theme-dark .news-article-page__story-heading h1){color:#f7f8fb}
:global(html.theme-dark .news-article-page__publisher>span){background:#c8102e}
:global(html.theme-dark .news-article-page__standfirst){color:#e9edf4}
:global(html.theme-dark .news-article-page__empty a){color:#ff5a76}
@media(max-width:720px){
  .news-article-page{padding-bottom:0}
  .news-article-page__stage{--article-hero-flow-height:clamp(430px,62vh,560px)}
  .news-article-page__navigation{top:82px;width:calc(100% - 32px);padding-block:12px 16px}
  .news-article-page__navigation>span{font-size:8px;letter-spacing:.08em}
  .news-article-page__story-panel{width:100%;margin-top:-52px;padding:14px 22px 48px;border-radius:30px 30px 0 0}
  .news-article-page__handle{display:grid;width:100%;height:26px;margin-bottom:10px}
  .news-article-page__navigation{padding-block:17px}
  .news-article-page__navigation>span{display:none}
  .news-article-page__panel{border-radius:14px}
  .news-article-page__visual-mark{bottom:clamp(98px,14vh,132px);left:22px;font-size:8px;letter-spacing:.08em}
  .news-article-page__story-heading{margin-bottom:6px}
  .news-article-page__story-heading h1{font-size:clamp(34px,9vw,48px)}
  .news-article-page__meta{align-items:center;justify-content:flex-end;gap:16px;padding-block:16px}
  .news-article-page__publisher,.news-article-page__meta-category{gap:7px;font-size:8px;letter-spacing:.07em}
  .news-article-page__publisher>span{width:25px;height:25px}
  .news-article-page__reading{grid-template-columns:minmax(0,1fr);gap:22px;max-height:250px;overflow:hidden;padding-top:22px;transition:max-height .55s cubic-bezier(.2,.72,.25,1)}
  .news-article-page__reading.is-expanded{max-height:5000px}
  .news-article-page__content-kicker{margin-bottom:17px}
  .news-article-page__standfirst{margin-bottom:21px;font-size:23px}
  .news-article-page__body{font-size:16px;line-height:1.8}
  .news-article-page__side-image{position:static;aspect-ratio:1.35;border-radius:15px}
}
@media(max-width:380px){.news-article-page__visual-mark{font-size:7px}.news-article-page__story-heading h1{font-size:32px}}
@media(prefers-reduced-motion:reduce){.news-article-page__story-panel,.news-article-page__visual img,.news-article-page__reading{transition:none}}

.news-empty-hero { position: relative; z-index: 2; min-height: 320px; padding-top: 135px; padding-bottom: 95px; color: #fff; }
.news-empty-hero h1 { font-size: clamp(42px, 6vw, 76px); line-height: 1.1; margin: 18px 0; }
.news-empty-hero p:last-child { max-width: 640px; font-size: clamp(16px, 1.7vw, 20px); }
.news-editorial-hero:has(.news-empty-hero) { min-height: 0; background: linear-gradient(120deg, #980c26, #142240); }

/* En móvil el artículo completo se muestra de entrada, sin abrir una pestaña. */
@media (max-width:720px) {
  .news-article-page__handle { display:none; }
  .news-article-page__reading,
  .news-article-page__reading.is-expanded,
  .news-article-page__reading.is-dragging {
    max-height:none !important;
    overflow:visible !important;
    transition:none;
  }
  .news-article-page__story-panel { margin-top:-52px !important; }
}

/* El texto rodea la imagen y aprovecha todo el ancho debajo de ella. */
@media (min-width:721px) {
  .news-article-page__reading { display:flow-root; }
  .news-article-page__side-image {
    float:right;
    width: min(42%, 650px);
    margin:0 0 28px clamp(24px, 4vw, 66px);
  }
  .news-article-page__content { max-width:none; }
}
@media (max-width:720px) {
  .news-article-page__reading { display:flow-root; }
  .news-article-page__side-image { float:none; width:100%; margin:0 0 24px; }
  .news-article-page__content { max-width:none; }
}
</style>
