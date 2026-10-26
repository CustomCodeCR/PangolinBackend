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
const requestedArticleSlug = window.location.pathname.match(/^\/noticias\/([^/]+)\/?$/)?.[1] ?? null
const isArticlePage = Boolean(requestedArticleId || requestedArticleSlug)
const managedNews = ref<ManagedNews[]>([])
const slugifyNewsTitle = (title: string) => title.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'noticia'
const articleSlug = (article: { id: string; title: string }) =>
  `${slugifyNewsTitle(article.title)}-${article.id.replace(/-/g, '').slice(-8).toLowerCase()}`
const articlePath = (article: { id: string; title: string }) => `/noticias/${articleSlug(article)}`
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
const activeArticle = computed(() => {
  if (requestedArticleId) return news.value.find(article => article.id === requestedArticleId) ?? null
  if (!requestedArticleSlug) return null
  return news.value.find(article => {
    const sourceArticle = managedNews.value.find(item => item.id === article.id)
    return sourceArticle && articleSlug(sourceArticle) === requestedArticleSlug
  }) ?? null
})
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
    if (!isArticlePage) startStoryTimer()
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
    <SiteHeader v-if="isArticlePage" active="noticias" />
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
    <main v-else id="noticia-completa" class="news-article-page">
      <template v-if="activeArticle">
        <nav class="container news-article-page__navigation" :aria-label="q('Navegación de noticias', 'News navigation')">
          <a href="/noticias"><IconSymbol glyph="←" /> {{ q('Volver a noticias', 'Back to news') }}</a>
          <span>{{ q('GRUPO CASTRO FALLAS / ACTUALIDAD', 'GRUPO CASTRO FALLAS / NEWS') }}</span>
        </nav>
        <article class="news-article-page__article">
          <div class="container news-article-page__stage">
            <div class="news-article-page__panel">
              <div class="news-article-page__hero">
                <figure class="news-article-page__visual">
                  <img :src="activeArticle.image" :alt="activeArticle.title" fetchpriority="high" decoding="async" />
                  <figcaption class="news-article-page__visual-mark">
                    <span class="news-article-page__visual-dot" aria-hidden="true"></span>
                    {{ q('HISTORIAS QUE NOS CONECTAN', 'STORIES THAT CONNECT US') }}
                  </figcaption>
                </figure>
                <header class="news-article-page__heading">
                  <div class="news-article-page__eyebrow">
                    <span>CF <span aria-hidden="true">/</span> {{ q('NOTICIAS', 'NEWS') }}</span>
                    <span>{{ q('EDICIÓN DIGITAL', 'DIGITAL EDITION') }}</span>
                  </div>
                  <div class="news-article-page__headline">
                    <p class="news-article-page__overline">{{ activeArticle.category }}</p>
                    <h1>{{ activeArticle.title }}</h1>
                    <p v-if="activeArticle.description?.trim() && activeArticle.description.trim() !== activeArticle.body.trim()" class="news-article-page__teaser">{{ activeArticle.description }}</p>
                  </div>
                  <a class="news-article-page__read" href="#contenido-noticia">
                    {{ q('Leer noticia completa', 'Read full article') }}
                    <span aria-hidden="true"><IconSymbol glyph="↘" /></span>
                  </a>
                </header>
              </div>
              <div class="news-article-page__panel-footer">
                <span>GRUPO CASTRO FALLAS <span class="news-article-page__footer-divider" aria-hidden="true">/</span> {{ q('ACTUALIDAD', 'LATEST') }}</span>
                <span class="news-article-page__panel-category">{{ activeArticle.category }}</span>
                <a href="#contenido-noticia">{{ q('EXPLORAR ARTÍCULO', 'EXPLORE ARTICLE') }} <IconSymbol glyph="↓" /></a>
              </div>
            </div>
          </div>
          <div class="container news-article-page__layout">
            <aside class="news-article-page__rail" :aria-label="q('Información de la publicación', 'Publication information')">
              <p class="news-article-page__rail-index">01 <span>/</span> {{ q('EN DETALLE', 'IN DETAIL') }}</p>
              <div class="news-article-page__rail-rule" aria-hidden="true"></div>
              <p>{{ q('Información y novedades del mundo logístico.', 'Updates and insights from the logistics world.') }}</p>
            </aside>
            <section id="contenido-noticia" class="news-article-page__content" :aria-label="q('Contenido de la noticia', 'Article content')">
              <p class="news-article-page__content-kicker">{{ activeArticle.category }} <span aria-hidden="true">/</span> {{ q('ARTÍCULO COMPLETO', 'FULL ARTICLE') }}</p>
              <div class="news-article-page__body">{{ activeArticle.body }}</div>
              <div class="news-article-page__closing">
                <span class="news-article-page__closing-line" aria-hidden="true"></span>
                <span>{{ q('FIN DEL ARTÍCULO', 'END OF ARTICLE') }}</span>
              </div>
              <a class="news-article-page__back" href="/noticias"><IconSymbol glyph="←" /> {{ q('Ver todas las noticias', 'View all news') }}</a>
            </section>
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

/* Vista editorial exclusiva del detalle de noticias, sin modificar la portada. */
.news-article-page{
  --article-ink:#192439;--article-muted:#647084;--article-line:rgba(21,35,55,.14);--article-accent:#ad1230;
  min-height:70vh;padding:23px 0 clamp(76px,9vw,132px);background:#fff;color:var(--article-ink);
}
.news-article-page__navigation,.news-article-page__stage,.news-article-page__layout{
  width:min(1320px,calc(100% - 64px));max-width:none;margin-inline:auto;
}
.news-article-page__navigation{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:23px}
.news-article-page__navigation a,.news-article-page__back{display:inline-flex;align-items:center;gap:10px;color:var(--article-accent);font-size:12px;font-weight:800;text-decoration:none}
.news-article-page__navigation>span{color:var(--article-muted);font-size:10px;font-weight:800;letter-spacing:.13em}
.news-article-page__navigation a:hover,.news-article-page__back:hover{text-decoration:underline}
.news-article-page__panel{overflow:hidden;border:1px solid var(--article-line);border-radius:5px;background:#fafbfc;box-shadow:0 24px 75px rgba(20,30,46,.09)}
.news-article-page__hero{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(0,.88fr);min-height:485px}
.news-article-page__visual{position:relative;min-width:0;min-height:485px;margin:0;overflow:hidden;background:#182339}
.news-article-page__visual::after{position:absolute;inset:45% 0 0;content:"";background:linear-gradient(180deg,transparent,rgba(0,10,25,.54));pointer-events:none}
.news-article-page__visual img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover;object-position:center}
.news-article-page__visual-mark{position:absolute;z-index:1;right:24px;bottom:24px;left:26px;display:flex;align-items:center;gap:9px;margin:0;color:#fff;font-size:10px;font-weight:800;letter-spacing:.13em;text-shadow:0 1px 6px rgba(0,0,0,.35)}
.news-article-page__visual-dot{width:7px;height:7px;flex:none;border-radius:50%;background:#eb3656}
.news-article-page__heading{position:relative;display:flex;min-width:0;flex-direction:column;justify-content:space-between;gap:36px;padding:clamp(28px,3.8vw,62px);border-right:7px solid var(--article-accent);background:#fafbfc}
.news-article-page__eyebrow{display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;color:#677185;font-size:9px;font-weight:850;letter-spacing:.13em}
.news-article-page__eyebrow>span:first-child{color:var(--article-ink)}
.news-article-page__eyebrow span[aria-hidden]{margin:0 7px;color:var(--article-accent)}
.news-article-page__headline{min-width:0;margin-block:auto}
.news-article-page__overline{margin:0 0 18px;color:var(--article-accent);font-size:11px;font-weight:850;letter-spacing:.12em;text-transform:uppercase;overflow-wrap:anywhere}
.news-article-page__heading h1{margin:0;color:var(--article-ink);font-family:Inter,"Helvetica Neue",Arial,system-ui,sans-serif;font-size:clamp(32px,3.7vw,60px);font-weight:700;letter-spacing:-.053em;line-height:1.075;overflow-wrap:anywhere}
.news-article-page__teaser{max-width:43ch;margin:24px 0 0;color:#576377;font-size:clamp(14px,1.24vw,17px);line-height:1.65;white-space:pre-line;overflow-wrap:anywhere}
.news-article-page__read{display:inline-flex;align-items:center;align-self:flex-start;gap:16px;color:var(--article-ink);font-size:11px;font-weight:800;text-decoration:none}
.news-article-page__read>span{display:grid;width:38px;height:38px;flex:none;place-items:center;border:1px solid var(--article-line);border-radius:50%;color:var(--article-accent);font-size:19px;transition:transform .2s ease,background .2s ease}
.news-article-page__read:hover>span{transform:translate(2px,2px);background:rgba(175,18,50,.09)}
.news-article-page__panel-footer{display:flex;align-items:center;justify-content:space-between;gap:20px;min-height:64px;padding:17px clamp(24px,3.5vw,48px);border-top:1px solid var(--article-line);color:#606d81;font-size:10px;font-weight:850;letter-spacing:.095em}
.news-article-page__footer-divider{margin-inline:9px;color:var(--article-accent)}
.news-article-page__panel-category{max-width:32ch;overflow-wrap:anywhere;text-align:center}
.news-article-page__panel-footer a{display:inline-flex;align-items:center;gap:12px;color:var(--article-ink);text-decoration:none}
.news-article-page__panel-footer a:hover{color:var(--article-accent)}
.news-article-page__layout{display:grid;grid-template-columns:minmax(170px,.34fr) minmax(0,1fr);gap:clamp(38px,6vw,100px);padding-top:clamp(66px,8vw,122px)}
.news-article-page__rail{max-width:220px;padding-top:7px}
.news-article-page__rail-index,.news-article-page__content-kicker{margin:0;color:var(--article-accent);font-size:11px;font-weight:850;letter-spacing:.12em;text-transform:uppercase}
.news-article-page__rail-index span{margin-inline:7px;color:#a9b2c1}
.news-article-page__rail-rule{width:min(100%,150px);height:1px;margin:23px 0;background:var(--article-line)}
.news-article-page__rail>p:last-child{max-width:20ch;color:var(--article-muted);font-size:13px;line-height:1.7}
.news-article-page__content{min-width:0;max-width:850px;scroll-margin-top:100px}
.news-article-page__content-kicker{margin-bottom:29px}
.news-article-page__content-kicker span{margin-inline:10px;color:#a9b2c1}
.news-article-page__body{color:var(--article-ink);font-size:clamp(17px,1.45vw,19px);font-weight:400;line-height:1.95;white-space:pre-line;overflow-wrap:anywhere}
.news-article-page__closing{display:flex;align-items:center;gap:20px;margin-top:clamp(48px,7vw,92px);color:var(--article-muted);font-size:10px;font-weight:800;letter-spacing:.12em;white-space:nowrap}
.news-article-page__closing-line{width:64px;height:2px;background:var(--article-accent)}
.news-article-page__back{margin-top:27px;padding-top:20px;border-top:1px solid var(--article-line)}
.news-article-page__empty{padding:80px 0 130px}
.news-article-page__empty h1{font-size:clamp(30px,4vw,48px)}
.news-article-page__empty a{color:var(--article-accent)}
.news-article-page a:focus-visible{outline:2px solid var(--article-accent);outline-offset:5px}
/* Fondo de dark mode preservado para compatibilidad con la página actual. */
:global(html.theme-dark .app-site.news-page main.news-article-page){--article-ink:#f4f6fa;--article-muted:#abb7cc;--article-line:rgba(235,241,252,.17);--article-accent:#ff5a76;background:#01081d;color:var(--article-ink)}
:global(html.theme-dark) .news-article-page__panel{background:#101a30;box-shadow:0 24px 75px rgba(0,0,0,.24)}
:global(html.theme-dark) .news-article-page__heading{background:#101a30}
:global(html.theme-dark) .news-article-page__eyebrow{color:#a3afc4}
:global(html.theme-dark) .news-article-page__teaser{color:#bac4d5}
:global(html.theme-dark) .news-article-page__panel-footer{color:#b4bfd1}
:global(html.theme-dark) .news-article-page__empty a{color:#ff5a76}
@media(max-width:1000px){
  .news-article-page__hero{grid-template-columns:minmax(0,1fr) minmax(0,1fr);min-height:415px}
  .news-article-page__visual{min-height:415px}
  .news-article-page__heading{padding:28px}
  .news-article-page__heading h1{font-size:clamp(30px,4.2vw,44px)}
  .news-article-page__layout{grid-template-columns:150px minmax(0,1fr);gap:32px}
}
@media(max-width:720px){
  .news-article-page{padding-top:16px;padding-bottom:64px}
  .news-article-page__navigation,.news-article-page__stage,.news-article-page__layout{width:calc(100% - 32px)}
  .news-article-page__navigation{padding-bottom:17px}
  .news-article-page__navigation>span{display:none}
  .news-article-page__hero{display:block;min-height:0}
  .news-article-page__visual{height:clamp(230px,63vw,380px);min-height:0}
  .news-article-page__visual-mark{right:18px;bottom:18px;left:18px;font-size:9px}
  .news-article-page__heading{gap:30px;padding:28px 25px 32px;border-right-width:5px}
  .news-article-page__heading h1{font-size:clamp(30px,8vw,48px)}
  .news-article-page__teaser{margin-top:18px}
  .news-article-page__panel-footer{min-height:58px;padding:17px 22px}
  .news-article-page__panel-category{display:none}
  .news-article-page__layout{display:block;padding-top:52px}
  .news-article-page__rail{display:none}
  .news-article-page__content-kicker{margin-bottom:25px}
  .news-article-page__body{font-size:17px;line-height:1.85}
}
@media(max-width:380px){
  .news-article-page__panel-footer{flex-wrap:wrap;row-gap:10px;font-size:9px}
  .news-article-page__eyebrow{font-size:8px}
  .news-article-page__visual-mark{letter-spacing:.07em}
}
@media(prefers-reduced-motion:reduce){.news-article-page__read>span{transition:none}}

.news-empty-hero { position: relative; z-index: 2; min-height: 320px; padding-top: 135px; padding-bottom: 95px; color: #fff; }
.news-empty-hero h1 { font-size: clamp(42px, 6vw, 76px); line-height: 1.1; margin: 18px 0; }
.news-empty-hero p:last-child { max-width: 640px; font-size: clamp(16px, 1.7vw, 20px); }
.news-editorial-hero:has(.news-empty-hero) { min-height: 0; background: linear-gradient(120deg, #980c26, #142240); }
</style>
