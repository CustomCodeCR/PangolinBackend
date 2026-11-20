<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import WorldGlobe from './components/WorldGlobe.vue'
import IconSymbol from './components/IconSymbol.vue'
import SiteMedia from './components/SiteMedia.vue'
import StaticOptimizedImage from './components/StaticOptimizedImage.vue'
import HomeInstagramReel from './components/HomeInstagramReel.vue'
import { siteText, siteVisual, siteCssImage } from './siteCms'
import { services as baseServices, faqs as baseFaqs, type ServiceKey } from './content'
import type { ManagedNews, ManagedComment } from './adminContent'
import { subscribeToChanges } from './services/realtime'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n({ useScope: 'global' })
type HomeServiceKey = ServiceKey | 'Fiscal' | 'Panama'
// Nuxt SSR cannot know the viewport width. Hydration must start from the
// SAME markup on server and client; otherwise a server-rendered open panel
// survives on compact screens as an orphan after a reload.
// Phones and narrow windows start with all six vertical tabs collapsed.
// Desktop selects Air after mount, when the media query can be evaluated.
const activeService = ref<HomeServiceKey | null>(null)
const compactServiceMode = ref(false)
const serviceAccordionRef = ref<HTMLElement | null>(null)
const serviceAccordionWidth = ref(0)
const serviceWindowStart = ref(0)
let serviceAccordionObserver: ResizeObserver | undefined
let serviceCompactQuery: MediaQueryList | undefined
function updateServiceLayout() {
  const compact = serviceCompactQuery?.matches ?? false
  if (compact !== compactServiceMode.value) {
    compactServiceMode.value = compact
    activeService.value = compact ? null : 'Air'
    serviceWindowStart.value = 0
  } else if (!compact && activeService.value === null) {
    activeService.value = 'Air'
  }
  serviceAccordionWidth.value = serviceAccordionRef.value?.clientWidth ?? 0
}

function activateHomeService(key: HomeServiceKey) {
  if (compactServiceMode.value) {
    const keys = transportServices.value.map(service => service.key)
    const index = keys.indexOf(key)
    const priorIndex = activeService.value === null ? -1 : keys.indexOf(activeService.value)
    const count = Math.min(keys.length, serviceAccordionWidth.value < 260 ? 3 : 4)
    const lastStart = Math.max(0, keys.length - count)
    if (index >= 0 && index !== priorIndex) {
      let start = serviceWindowStart.value
      if (priorIndex === -1) {
        // First opening: ensure its tab is visible in a balanced four-card row.
        start = index - Math.floor((count - 1) / 2)
      } else {
        // Each deliberate selection moves the window by AT MOST one tab in
        // the direction of travel, in either direction (unless a direct
        // keyboard activation needs to bring an offscreen tab into view).
        start += index > priorIndex ? 1 : -1
      }
      start = Math.max(0, Math.min(start, lastStart))
      serviceWindowStart.value = Math.max(index - count + 1, Math.min(start, index))
    }
  }
  activeService.value = key
}

// Compact-width hover can fire on page load, after refresh, or while the
// expanding cards move under a stationary cursor. Open these tabs ONLY on
// an intentional click/tap/keyboard activation; keep hover on desktop.
function openHomeServiceFromPointer(key: HomeServiceKey, event: PointerEvent) {
  if (compactServiceMode.value || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return
  activateHomeService(key)
}
function openHomeServiceFromFocus(key: HomeServiceKey) {
  if (!compactServiceMode.value) activateHomeService(key)
}
function toggleHomeService(key: HomeServiceKey) {
  if (compactServiceMode.value && activeService.value === key) {
    activeService.value = null
    serviceWindowStart.value = 0
  } else {
    activateHomeService(key)
  }
}

const localizedServices = computed(() => baseServices.map(service => ({
  ...service,
  photo: siteVisual(`home.services.${service.key.toLowerCase()}.media`, service.photo).src,
  kind: siteVisual(`home.services.${service.key.toLowerCase()}.media`, service.photo).kind,
  title: siteText(`home.services.${service.key.toLowerCase()}.title`, t(`content.services.${service.key}.title`), locale.value),
  label: t(`content.services.${service.key}.label`),
  description: t(`content.services.${service.key}.description`),
  detail: siteText(`home.services.${service.key.toLowerCase()}.detail`, service.key === 'Multimodal' ? (locale.value.startsWith('es') ? 'Especialistas en transporte desde Asia y Europa hacia Costa Rica, coordinando soluciones multimodales.' : 'Specialists in transport from Asia and Europe to Costa Rica, coordinating multimodal solutions.') : t(`content.services.${service.key}.detail`), locale.value)
})))
const newHomeServices = computed(() => {
  const es = locale.value.startsWith('es')
  return [
    { key: 'Fiscal' as const, photo: '/images/services-warehouse.webp', icon: 'warehouse',
      title: siteText('home.services.fiscal.title', es ? 'Almacén fiscal' : 'Bonded warehouse', locale.value),
      label: es ? 'ALMACÉN FISCAL' : 'BONDED WAREHOUSE',
      description: '', detail: siteText('home.services.fiscal.detail',
        es ? 'Almacenes fiscales A257 y A287. Manejo de carga peligrosa sujeto a condiciones y autorizaciones; control de inventario de rotación.'
           : 'Bonded warehouses A257 and A287. Dangerous goods handling subject to conditions and authorizations; rotating inventory management.', locale.value) },
    { key: 'Panama' as const, photo: '/images/truck.webp', icon: 'truck',
      title: siteText('home.services.panama.title', es ? 'Transporte Panamá–Costa Rica' : 'Panama–Costa Rica transport', locale.value),
      label: es ? 'PANAMÁ–COSTA RICA' : 'PANAMA–COSTA RICA',
      description: '', detail: siteText('home.services.panama.detail',
        es ? 'Más de 80 unidades caucionadas con rastreo, articuladas y no articuladas, de 28, 40, 45, 48 y 53 pies.'
           : 'More than 80 bonded transport units with tracking, articulated and non-articulated, in 28, 40, 45, 48 and 53-foot sizes.', locale.value) }
  ].map(service => ({ ...service, ...siteVisual(`home.services.${service.key.toLowerCase()}.media`, service.photo) }))
})
const transportServices = computed(() => [
  ...(['Air', 'Maritime', 'Land', 'Multimodal'] as ServiceKey[]).map(key => localizedServices.value.find(service => service.key === key)!),
  ...newHomeServices.value
])
// Match the original four-service accordion on phones: one expanded card
// and three narrow red tabs. The two added services take their turn in the
// same four positions instead of making the open card disproportionately wide.
// Only extremely narrow containers fall back to three visible services.
const visibleHomeServiceKeys = computed(() => {
  const all = transportServices.value.map(service => service.key)
  if (!compactServiceMode.value || !activeService.value) return new Set<HomeServiceKey>(all)
  const available = serviceAccordionWidth.value || 320
  const count = Math.min(all.length, available < 260 ? 3 : 4)
  const selectedIndex = all.indexOf(activeService.value)
  if (selectedIndex < 0) return new Set<HomeServiceKey>(all)
  // The visible window progresses automatically as the user opens neighboring
  // tabs: Air [0..3], Maritime [1..4], Land [2..5]. Reverse when moving left.
  const start = Math.max(0, Math.min(serviceWindowStart.value, all.length - count))
  return new Set<HomeServiceKey>(all.slice(start, start + count))
})

const selectedService = computed(() => localizedServices.value.find(service => service.key === activeService.value) ?? localizedServices.value[0])
const modalService = ref<HomeServiceKey | null>(null)
const modalPhoto = computed(() => siteCssImage(`home.services.${modalService.value?.toLowerCase()}.media`, transportServices.value.find(service => service.key === modalService.value)?.photo ?? '/images/hero.webp'))
const modalItemCounts: Record<ServiceKey, number[]> = { Maritime: [5, 4, 3], Land: [4, 4, 3], Air: [4, 3], Multimodal: [3, 3] }
const serviceInfo = computed(() => Object.fromEntries([ ...(['Maritime', 'Land', 'Air', 'Multimodal'] as ServiceKey[]).map(key => {
  const base = `custom.home.modal.${key}`
  return [key, {
    title: t(`${base}.title`),
    sections: modalItemCounts[key].map((itemCount, sectionIndex) => ({
      heading: t(`${base}.sections.${sectionIndex}.heading`),
      items: Array.from({ length: itemCount }, (_, itemIndex) => t(`${base}.sections.${sectionIndex}.items.${itemIndex}`))
    }))
  }]
}),
  ['Fiscal', { title: siteText('home.services.fiscal.title', locale.value.startsWith('es') ? 'Almacén fiscal' : 'Bonded warehouse', locale.value),
    sections: [{ heading: locale.value.startsWith('es') ? 'Instalaciones y operaciones' : 'Facilities and operations',
      items: [
        siteText('home.services.fiscal.locationA257', 'A257', locale.value),
        siteText('home.services.fiscal.locationA287', 'A287', locale.value),
        siteText('home.services.fiscal.hazardous', locale.value.startsWith('es') ? 'Manejo de carga peligrosa, sujeto a requisitos y autorizaciones.' : 'Dangerous goods handling, subject to applicable requirements and permits.', locale.value),
        siteText('home.services.fiscal.rotation', locale.value.startsWith('es') ? 'Manejo de inventario de rotación.' : 'Rotating inventory management.', locale.value)
      ] }] }],
  ['Panama', { title: siteText('home.services.panama.title', locale.value.startsWith('es') ? 'Transporte Panamá–Costa Rica' : 'Panama–Costa Rica transport', locale.value),
    sections: [{ heading: locale.value.startsWith('es') ? 'Beneficios' : 'Benefits',
      items: [locale.value.startsWith('es') ? 'Somos pioneros con amplia experiencia en el transporte de mercancía de Panamá - Costa Rica.' : 'We are pioneers with extensive experience in freight transport between Panama and Costa Rica.',
        locale.value.startsWith('es') ? 'Contamos con bodega propia en Zona Libre Colón.' : 'We have our own warehouse in the Colón Free Zone.',
        locale.value.startsWith('es') ? 'Ofrecemos salidas diarias con un tiempo de tránsito de 26 horas.' : 'We offer daily departures with a transit time of 26 hours.'] }] }]
 ]) as Record<HomeServiceKey, { title: string; sections: { heading: string; items: string[] }[] }>)
const expandedFaq = ref<number | null>(0)
const faqListRef = ref<HTMLElement | null>(null)
const closeFaqOnOutsidePointer = (event: PointerEvent) => {
  if (expandedFaq.value === null || !(event.target instanceof Node)) return
  const activeItem = faqListRef.value?.querySelector<HTMLElement>(`[data-faq-index="${expandedFaq.value}"]`)
  if (activeItem && !activeItem.contains(event.target)) expandedFaq.value = null
}
const closeFaqOnEscape = (event: KeyboardEvent) => {
  if (event.key === 'Escape') expandedFaq.value = null
}
const faqs = computed(() => baseFaqs.map((faq, index) => ({
  ...faq,
  q: siteText(`home.faq.${index}.q`, t(`content.faqs.${index}.q`), locale.value),
  a: siteText(`home.faq.${index}.a`, t(`content.faqs.${index}.a`), locale.value)
})))
const stats = computed(() => [
  { value: '+25', label: siteText('home.stats.0.label', t('custom.home.stats.0'), locale.value) },
  { value: '#1', label: siteText('home.stats.1.label', t('custom.home.stats.1'), locale.value) },
  { value: '+105', label: siteText('home.stats.2.label', t('custom.home.stats.2'), locale.value) },
  { value: '24/7', label: siteText('home.stats.3.label', t('custom.home.stats.3'), locale.value) }
])
const publicComments = ref<ManagedComment[]>([])
const commentsLoaded = ref(false)
const commentsSection = ref<HTMLElement | null>(null)
let commentsObserver: IntersectionObserver | undefined
let commentsRequested = false
const carouselComments = computed(() => publicComments.value.length > 1
  ? [...publicComments.value, ...publicComments.value]
  : publicComments.value)
async function loadPublicComments() {
  try {
    const response = await fetch('/api/content/comments', { cache: 'no-store' })
    if (!response.ok) throw new Error('No se pudieron consultar comentarios.')
    const list: unknown = await response.json()
    publicComments.value = Array.isArray(list) ? (list as ManagedComment[]).filter(item => item.published).slice(0, 6) : []
  } catch { publicComments.value = [] }
  finally { commentsLoaded.value = true }
}
const managedNews = ref<ManagedNews[]>([])
const homeNewsLoaded = ref(false)
const homeNewsError = ref(false)
const homeNews = computed(() => managedNews.value.filter(article => article.published && article.title.trim()).slice(0, 3).map(article => ({
  id: article.id, category: article.category, title: article.title,
  image: article.image || '/images/cover-logistics.jpeg'
})))


const activeStat = ref(0)
const newsScroller = ref<HTMLElement | null>(null)
const unsubscribeComments = typeof window === 'undefined' ? () => {} : subscribeToChanges('comments', () => {
  if (commentsRequested) void loadPublicComments()
})
let statsTimer: number | undefined
let newsTimer: number | undefined
let newsPauseUntil = 0

function pauseNews() {
  newsPauseUntil = Date.now() + 8000
}

function advanceNews() {
  const scroller = newsScroller.value
  if (!scroller || document.hidden || Date.now() < newsPauseUntil ||
      !window.matchMedia('(max-width: 800px)').matches ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const cards = scroller.querySelectorAll<HTMLElement>('.home-news-sidebar__group:first-child .home-hero-news__card')
  if (cards.length < 2) return
  const step = cards[1].getBoundingClientRect().left - cards[0].getBoundingClientRect().left
  if (step <= 0 || scroller.scrollWidth <= scroller.clientWidth) return

  const cycleWidth = step * cards.length
  // Si todas las noticias originales caben, no desplazar hacia la copia duplicada:
  // scrollLeft jamás alcanzaría cycleWidth y el carrusel quedaría detenido al final.
  if (cycleWidth <= scroller.clientWidth + 2) return
  if (scroller.scrollLeft >= cycleWidth - 2) scroller.scrollLeft -= cycleWidth
  const index = Math.round(scroller.scrollLeft / step)
  scroller.scrollTo({ left: Math.min(scroller.scrollWidth - scroller.clientWidth, (index + 1) * step), behavior: 'smooth' })
}

function showStat(index: number) {
  activeStat.value = (index + stats.value.length) % stats.value.length
}

function requestComments() {
  if (commentsRequested) return
  commentsRequested = true
  void loadPublicComments()
}

onMounted(async () => {
  serviceCompactQuery = window.matchMedia('(max-width: 800px)')
  serviceCompactQuery.addEventListener('change', updateServiceLayout)
  updateServiceLayout()
  if (serviceAccordionRef.value && typeof ResizeObserver !== 'undefined') {
    serviceAccordionObserver = new ResizeObserver(() => {
      serviceAccordionWidth.value = serviceAccordionRef.value?.clientWidth ?? 0
    })
    serviceAccordionObserver.observe(serviceAccordionRef.value)
  }
  document.addEventListener('pointerdown', closeFaqOnOutsidePointer)
  document.addEventListener('keydown', closeFaqOnEscape)
  // Comments live below the first screen; do not compete with hero/news on load.
  if (typeof IntersectionObserver === 'undefined' || !commentsSection.value) {
    requestComments()
  } else {
    commentsObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return
      commentsObserver?.disconnect()
      requestComments()
    }, { rootMargin: '700px 0px' })
    commentsObserver.observe(commentsSection.value)
  }
  statsTimer = window.setInterval(() => showStat(activeStat.value + 1), 2500)
  try {
    const response = await fetch('/api/content/news', { cache: 'no-store' })
    if (!response.ok) throw new Error('No se pudieron consultar las noticias.')
    const articles: unknown = await response.json()
    if (!Array.isArray(articles)) throw new Error('Formato de noticias inválido.')
    managedNews.value = articles as ManagedNews[]
    if (homeNews.value.length > 1) newsTimer = window.setInterval(advanceNews, 3400)
  } catch {
    homeNewsError.value = true
  } finally {
    homeNewsLoaded.value = true
  }
})

onUnmounted(() => {
  serviceAccordionObserver?.disconnect()
  serviceCompactQuery?.removeEventListener('change', updateServiceLayout)
  document.removeEventListener('pointerdown', closeFaqOnOutsidePointer)
  document.removeEventListener('keydown', closeFaqOnEscape)
  commentsObserver?.disconnect()
  unsubscribeComments()
  if (statsTimer) window.clearInterval(statsTimer)
  if (newsTimer) window.clearInterval(newsTimer)
})
</script>

<template>
  <div class="app-site home-page">
    <section class="home-hero" :class="{ 'cms-video-hero': siteVisual('home.hero.media', '/images/hero.webp').kind.startsWith('Video') }" :style="{ '--cms-home-hero': siteCssImage('home.hero.media', '/images/hero.webp') }">
      <SiteMedia v-if="siteVisual('home.hero.media', '/images/hero.webp').kind.startsWith('Video')" slot-key="home.hero.media" fallback="/images/hero.webp" background />
      <SiteHeader overlay active="principal" />

      <div class="container home-hero__layout">
        <div class="home-hero__content">
          <p class="section-tag light-tag">
            <span class="tag-line"></span>
            GRUPO CASTRO FALLAS
          </p>

          <h1>{{ siteText('home.hero.title1', $t('phrases.p000'), locale) }}<br /><span>{{ siteText('home.hero.title2', $t('phrases.p001'), locale) }}</span></h1>

          <p>
            {{ siteText('home.hero.intro', $t('phrases.p002'), locale) }}
          </p>

          <div class="hero-actions">
            <a href="#servicios" class="btn btn-primary">
              {{ $t('phrases.p003') }} <IconSymbol glyph="↗" />
            </a>
            <a href="#contacto" class="btn btn-outline-light">
              {{ $t('phrases.p004') }} <IconSymbol glyph="↗" />
            </a>
          </div>
        </div>
      </div>

      <div class="hero-vertical-text">{{ $t('phrases.p005') }}</div>
      <div class="hero-bottom-gradient"></div>
    </section>

    <main>
      <section id="servicios" class="services-section section-spacing">
        <div class="container services-news-layout">
          <div class="services-main">
            <p class="section-tag center">{{ $t('phrases.p008') }}</p>
            <h2 class="section-title centered">
              {{ siteText('home.services.heading1', $t('phrases.p009'), locale) }} <span>{{ siteText('home.services.heading2', $t('phrases.p010'), locale) }}</span>
            </h2>
            <p class="section-desc centered">
              {{ siteText('home.services.intro', $t('phrases.p011'), locale) }}
            </p>

            <div ref="serviceAccordionRef" class="service-accordion" :class="{ 'is-collapsed': activeService === null }" :aria-label="$t('phrases.p134')">
              <article
                v-for="service in transportServices"
                :key="service.key"
                class="service-accordion__item"
                :class="{ 'is-open': activeService === service.key }"
                :hidden="compactServiceMode && !visibleHomeServiceKeys.has(service.key)"
                 :style="{ '--service-image': siteCssImage(`home.services.${service.key.toLowerCase()}.media`, transportServices.find(item => item.key === service.key)?.photo ?? '/images/hero.webp') }"
              >
                <SiteMedia v-if="service.kind.startsWith('Video')" :slot-key="`home.services.${service.key.toLowerCase()}.media`" :fallback="service.photo" background />
                <button
                  class="service-accordion__trigger"
                  type="button"
                  :aria-expanded="activeService === service.key"
                  :aria-controls="`home-service-panel-${service.key}`"
                  @pointerenter="openHomeServiceFromPointer(service.key, $event)"
                  @focus="openHomeServiceFromFocus(service.key)"
                  @click="toggleHomeService(service.key)"
                ><span class="service-accordion__name">{{ service.label }}</span></button>
                <div v-if="activeService === service.key" :id="`home-service-panel-${service.key}`" class="service-accordion__panel">
                  <div class="service-accordion__copy">
                    <h3>{{ service.title }}</h3>
                    <p>{{ service.detail }}</p>
                    <button class="btn btn-primary" type="button" @click="modalService = service.key">
                      {{ $t('custom.home.seeMore') }} <IconSymbol glyph="↗" />
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </div>

          <aside class="home-news-sidebar" :class="{ 'home-news-sidebar--single': homeNews.length === 1 }" :aria-label="$t('custom.home.newsAria')">
            <div class="home-hero-news__header">
              <span>{{ siteText('home.news.heading', $t('custom.home.newsHeader'), locale) }}</span>
              <a href="/noticias">{{ $t('custom.home.allNews') }}</a>
            </div>
            <p v-if="!homeNews.length" class="home-news-empty" role="status">{{ !homeNewsLoaded ? 'Cargando noticias…' : homeNewsError ? 'No se pudieron cargar las noticias.' : 'Próximamente compartiremos noticias y novedades.' }}</p>
            <div
              v-else
              ref="newsScroller"
              class="home-news-sidebar__list"
              tabindex="0"
              :aria-label="$t('custom.home.newsAria')"
              @touchstart.passive="pauseNews"
              @pointerdown="pauseNews"
              @focusin="pauseNews"
            >
              <div class="home-news-sidebar__track">
                <div v-for="copy in (homeNews.length > 1 ? 4 : 1)" :key="copy" class="home-news-sidebar__group" :aria-hidden="copy > 1">
                  <a
                    v-for="item in homeNews"
                    :key="`${copy}-${item.id}`"
                    class="home-hero-news__card"
                    :href="'/noticias?article=' + encodeURIComponent(item.id)"
                    :tabindex="copy > 1 ? -1 : 0"
                    :aria-label="`${$t('custom.home.newsAria')}: ${item.title}`"
                  >
                    <StaticOptimizedImage :src="item.image" :alt="item.title" sizes="(max-width: 720px) 46vw, 280px" loading="lazy" />
                    <span class="home-hero-news__copy">
                      <small>{{ item.category }}</small>
                      <strong>{{ item.title }}</strong>
                    </span>
                  </a>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section class="home-about-preview" :aria-label="$t('custom.about.title')">
        <div class="home-about-preview__copy">
          <p class="section-tag">{{ $t('custom.about.title') }}</p>
          <h2><strong>+48</strong><span>{{ $t('custom.about.years') }}</span></h2>
          <p class="home-about-preview__description">{{ siteText('home.about.intro', $t('custom.about.introduction'), locale) }}</p>
        </div>
        <div class="home-about-preview__image">
          <SiteMedia slot-key="home.about.media" fallback="/images/about-operations-enhanced.jpg" :alt="$t('phrases.p139')" />
        </div>
      </section>

      <section class="home-last-cta">
        <div class="container home-last-cta__inner">
          <div>
            <p class="section-tag">{{ $t('phrases.p035') }}</p>
            <h2>{{ siteText('home.quote.heading1', $t('phrases.p036'), locale) }}<br /><span>{{ siteText('home.quote.heading2', $t('phrases.p037'), locale) }}</span></h2>
          </div>
          <a href="/cotizaciones" class="btn btn-primary">
            {{ $t('custom.home.quoteNow') }} <IconSymbol glyph="↗" />
          </a>
        </div>
      </section>

      <section class="stats-band" :aria-label="$t('custom.home.statsAria')">
        <div class="container">
          <div class="stats-carousel">
            <Transition name="stat-slide" mode="out-in">
              <article :key="activeStat" class="stats-slide" aria-live="polite">
                <strong>{{ stats[activeStat].value }}</strong>
                <span>{{ stats[activeStat].label }}</span>
              </article>
            </Transition>
          </div>

          <div class="stats-carousel-dots">
            <button
              v-for="(stat, index) in stats"
              :key="stat.value"
              type="button"
              :class="{ active: index === activeStat }"
              :aria-label="`${$t('custom.home.showStat')} ${index + 1}: ${stat.value}`"
              @click="showStat(index)"
            ></button>
          </div>
        </div>
      </section>

      <section id="embarque" class="tracking-section section-spacing">
        <div class="container tracking-home-grid">
          <div class="tracking-home-copy">
            <p class="section-tag">{{ $t('phrases.p020') }}</p>
            <h2 class="section-title">{{ siteText('home.tracking.heading1', $t('phrases.p021'), locale) }}<br /><span>{{ siteText('home.tracking.heading2', $t('phrases.p022'), locale) }}</span></h2>
            <p class="section-desc">
              {{ siteText('home.tracking.intro', $t('phrases.p023'), locale) }}
            </p>
            <a class="btn btn-primary" href="/tracking">
              {{ $t('phrases.p024') }} <IconSymbol glyph="↗" />
            </a>
          </div>

          <WorldGlobe />
        </div>
      </section>

      <!-- Regional specialties: between the tracking globe and digital services. -->
      <section class="home-specialties" :aria-label="locale === 'es' ? 'Infraestructura y cobertura regional' : 'Regional infrastructure and coverage'">
        <div class="container home-specialties__inner">
          <p class="home-specialties__eyebrow">{{ siteText('home.specialties.heading', locale === 'es' ? 'INFRAESTRUCTURA Y COBERTURA' : 'INFRASTRUCTURE & COVERAGE', locale) }}</p>
          <div class="home-specialties__grid">
            <article class="home-specialties__item">
              <div class="home-specialties__icon-wrap" aria-hidden="true">
                <svg class="home-specialties__icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
              <path d="M5 24 32 7l27 17v5h-5v29H10V29H5v-5Z" />
              <path d="M17 57V28h30v29M22 57V35h20v22M22 41h20M22 46h20M22 51h20" />
              <path d="M29 18h6v6h-6z" />
            </svg>
              </div>
              <div class="home-specialties__copy">
                <span class="home-specialties__overline">{{ siteText('home.specialties.fiscal.eyebrow', locale === 'es' ? 'ALMACENAMIENTO' : 'WAREHOUSING', locale) }} <b>01</b></span>
                <h2 class="home-specialties__heading">
                  <span>{{ siteText('home.specialties.fiscal.lead', locale === 'es' ? 'Espacio para tu carga.' : 'Space for your cargo.', locale) }}</span>
                  <strong>{{ siteText('home.specialties.fiscal.title', locale === 'es' ? 'Almacén fiscal A257 · A287' : 'Bonded warehousing A257 · A287', locale) }}</strong>
                </h2>
              </div>
            </article>
            <article class="home-specialties__item">
              <div class="home-specialties__icon-wrap" aria-hidden="true">
                <svg class="home-specialties__icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
              <path d="m5 37 9 16h35l10-16-27-8L5 37Z" />
              <path d="M17 34V18h29v15M22 18V9h8v9M35 18V9h8v9M24 24h5v5h-5zM35 24h5v5h-5z" />
              <path d="M6 57c5 3 9 3 14 0 5 3 9 3 14 0 5 3 9 3 14 0" />
            </svg>
              </div>
              <div class="home-specialties__copy">
                <span class="home-specialties__overline">{{ siteText('home.specialties.panama.eyebrow', locale === 'es' ? 'TRANSPORTE REGIONAL' : 'REGIONAL TRANSPORT', locale) }} <b>02</b></span>
                <h2 class="home-specialties__heading">
                  <span>{{ siteText('home.specialties.panama.lead', locale === 'es' ? 'Movemos tu negocio.' : 'We move your business.', locale) }}</span>
                  <strong>{{ siteText('home.specialties.panama.title', locale === 'es' ? 'Transporte entre Costa Rica y Panamá' : 'Transport between Costa Rica and Panama', locale) }}</strong>
                </h2>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section id="soluciones" ref="commentsSection" class="experience-section section-spacing">
        <div class="container">
          <div class="experience-intro">
            <div>
              <p class="section-tag">{{ $t('phrases.p026') }}</p>
              <h2 class="section-title">
                {{ siteText('home.digital.heading1', $t('phrases.p027'), locale) }}<br />
                {{ siteText('home.digital.heading2', $t('phrases.p028'), locale) }} <span>{{ siteText('home.digital.heading3', $t('phrases.p029'), locale) }}</span>
              </h2>
            </div>
          </div>

          <div v-if="publicComments.length" class="promise-carousel" aria-label="Comentarios publicados">
            <div
              class="promise-track"
              :class="{ 'promise-track--static': publicComments.length === 1 }"
              :style="{ animationDuration: `${Math.max(18, publicComments.length * 6)}s` }"
            >
              <article
                v-for="(comment, index) in carouselComments"
                :key="`${comment.id}-${index}`"
                class="promise-card promise-card--comment"
                :aria-hidden="index >= publicComments.length ? 'true' : undefined"
              >
                <div class="promise-card__top">
                  <IconSymbol glyph="message-circle" :size="22" />
                  <small>{{ String((index % publicComments.length) + 1).padStart(2, '0') }}</small>
                </div>
                <div class="promise-card__comment-content">
                  <span v-if="comment.section" class="promise-card__section">{{ comment.section }}</span>
                  <p class="promise-card__message" :tabindex="index >= publicComments.length ? -1 : 0" :aria-label="comment.message">{{ comment.message }}</p>
                  <h3 :title="comment.author">{{ comment.author }}</h3>
                </div>
                <div class="promise-card__dash"></div>
              </article>
            </div>
          </div>
          <p v-else-if="commentsLoaded" class="experience-comments-empty" role="status">Todavía no hay comentarios publicados.</p>
        </div>
      </section>

      <section class="section-spacing about-access">
        <div class="container">
          <p class="section-tag center">{{ $t('phrases.p060') }}</p>
          <h2 class="section-title centered">
            {{ siteText('home.access.heading1', $t('phrases.p061'), locale) }} <span>{{ siteText('home.access.heading2', $t('phrases.p062'), locale) }}</span>
          </h2>
          <p class="section-desc centered">
            {{ siteText('home.digital.intro', $t('phrases.p063'), locale) }}
          </p>

          <div class="access-grid">
            <a class="access-card access-card--tracking" href="/tracking" :style="{ '--cms-access-tracking': siteCssImage('home.tracking.media', '/images/tracking-red.webp') }">
               <SiteMedia v-if="siteVisual('home.tracking.media', '/images/tracking-red.webp').kind.startsWith('Video')" slot-key="home.tracking.media" fallback="/images/tracking-red.webp" background />
              <IconSymbol glyph="→" :size="22" />
              <strong>{{ siteText('home.access.tracking', $t('custom.home.trackingTitle'), locale) }}</strong>
            </a>
            <a class="access-card access-card--quote" href="/cotizaciones" :style="{ '--cms-access-quote': siteCssImage('home.quote.media', '/images/services-crane.webp') }">
               <SiteMedia v-if="siteVisual('home.quote.media', '/images/services-crane.webp').kind.startsWith('Video')" slot-key="home.quote.media" fallback="/images/services-crane.webp" background />
              <IconSymbol glyph="➜" :size="22" />
              <strong>{{ siteText('home.access.quote', $t('custom.home.quoteCardTitle'), locale) }}</strong>
            </a>
          </div>
        </div>
      </section>

      <section class="faq-section section-spacing">
        <div class="faq-background"></div>
        <div class="container faq-content">
          <p class="section-tag light-tag center">{{ siteText('home.faq.heading1', $t('phrases.p032'), locale) }}</p>
          <h2 class="section-title centered white-title">
            {{ siteText('home.faq.heading2', $t('phrases.p033'), locale) }}<br />{{ siteText('home.faq.heading3', $t('phrases.p034'), locale) }}
          </h2>

          <div ref="faqListRef" class="faq-list">
            <div
              v-for="(faq, index) in faqs"
              :key="faq.q"
              class="faq-item"
              :data-faq-index="index"
              :class="{ 'faq-item--open': expandedFaq === index }"
              @click="expandedFaq = expandedFaq === index ? null : index"
            >
              <button
                :aria-expanded="expandedFaq === index"
                :aria-controls="`home-faq-answer-${index}`"
                type="button"
                @click.stop="expandedFaq = expandedFaq === index ? null : index"
              >
                <span>{{ faq.q }}</span>
                <IconSymbol :glyph="expandedFaq === index ? '−' : '+'" :size="18" />
              </button>
              <div :id="`home-faq-answer-${index}`" class="faq-answer-panel"
                :class="{ 'is-open': expandedFaq === index }"
                :aria-hidden="expandedFaq !== index" :inert="expandedFaq !== index">
                <div class="faq-answer-clip"><div class="faq-answer">{{ faq.a }}</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <HomeInstagramReel />

      <section id="contacto" class="home-contact-details" :aria-label="$t('custom.home.contactAria')">
        <div class="container home-contact-grid">
          <a class="home-contact-card" href="tel:+50622726772">
            <IconSymbol class="home-contact-icon" glyph="☎" :size="24" />
            <strong>{{ $t('custom.home.contact.0') }}</strong>
            <small>+506 2272-6772</small>
          </a>
          <a class="home-contact-card" href="mailto:comercial@castrofallas.com">
            <IconSymbol class="home-contact-icon" glyph="✉" :size="24" />
            <strong>{{ $t('custom.home.contact.1') }}</strong>
            <small>comercial@castrofallas.com</small>
          </a>
          <a class="home-contact-card" href="https://wa.me/50670786860" target="_blank" rel="noopener noreferrer">
            <IconSymbol class="home-contact-icon" glyph="◉" :size="24" />
            <strong>{{ $t('custom.home.contact.2') }}</strong>
            <small>+506 7078-6860</small>
          </a>
          <a class="home-contact-card" href="https://www.google.com/maps?cid=4581825598564937253" target="_blank" rel="noopener noreferrer">
            <IconSymbol class="home-contact-icon" glyph="⌖" :size="24" />
            <strong>{{ $t('custom.home.contact.3') }}</strong>
            <small>{{ $t('custom.home.officeAddress') }}</small>
          </a>
          <article class="home-contact-card">
            <IconSymbol class="home-contact-icon" glyph="◷" :size="24" />
            <strong>{{ $t('custom.home.contact.4') }}</strong>
            <small>{{ $t('custom.home.contact.5') }}</small>
          </article>
        </div>
      </section>

      <div v-if="modalService" class="service-modal-backdrop" @click.self="modalService = null">
        <section
          class="service-modal"
          role="dialog"
          aria-modal="true"
          :aria-label="serviceInfo[modalService].title"
          :style="{ '--modal-service-photo': modalPhoto }"
        >
          <SiteMedia v-if="siteVisual(`home.services.${modalService.toLowerCase()}.media`, transportServices.find(item => item.key === modalService)?.photo ?? '/images/hero.webp').kind === 'Video'"
            :slot-key="`home.services.${modalService.toLowerCase()}.media`" :fallback="baseServices.find(item => item.key === modalService)?.photo ?? '/images/hero.webp'" background />
          <button class="service-modal__close" type="button" :aria-label="$t('custom.home.close')" @click="modalService = null"><IconSymbol glyph="×" :size="20" /></button>
          <p class="section-tag">{{ $t('custom.home.modalEyebrow') }}</p>
          <h2>{{ serviceInfo[modalService].title }}</h2>
          <div class="service-modal__sections">
            <section v-for="group in serviceInfo[modalService].sections" :key="group.heading">
              <h3>{{ group.heading }}</h3>
              <ul>
                <li v-for="item in group.items" :key="item">{{ item }}</li>
              </ul>
            </section>
            <div v-if="modalService === 'Panama'" class="service-modal__warehouse">
              <section class="service-modal__warehouse-panel">
                <svg class="service-modal__warehouse-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6"/></svg>
                <div class="service-modal__warehouse-copy">
                  <strong>{{ locale.startsWith('es') ? 'Dirección de bodega:' : 'Warehouse address:' }}</strong>
                  <span>France Field Calle 7ma, Avenida 5ta, al lado de la Bodega Anker.</span>
                </div>
              </section>
              <a
                class="service-modal__route"
                href="https://www.google.com/maps/dir/?api=1&destination=France%20Field%20Calle%207ma%2C%20Avenida%205ta%2C%20al%20lado%20de%20la%20Bodega%20Anker%2C%20Zona%20Libre%20de%20Colon%2C%20Panama"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="locale.startsWith('es') ? 'Ver ruta a la bodega en Google Maps' : 'Get directions to the warehouse in Google Maps'"
              ><svg class="service-modal__route-icon" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a8 8 0 0 0-8 8c0 5.5 8 12 8 12s8-6.5 8-12a8 8 0 0 0-8-8Zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"/></svg><span>{{ locale.startsWith('es') ? 'Ver ruta' : 'Directions' }}</span></a>
            </div>
          </div>
          <a class="btn btn-primary" :href="modalService === 'Fiscal' ? '/servicios/almacenamiento-fiscal' : modalService === 'Panama' ? '/servicios/transporte-panama-costa-rica' : `/cotizaciones?servicio=${modalService}`">
            {{ modalService === 'Fiscal' || modalService === 'Panama' ? (locale.startsWith('es') ? 'Conocer el servicio' : 'Explore service') : $t('custom.home.requestRate') }} <IconSymbol glyph="↗" />
          </a>
        </section>
      </div>
    </main>

    <SiteFooter />
  </div>
</template>

<style scoped>
/* Keep the original benefits card; the address is a separate unboxed footer row. */
.service-modal__sections:has(> .service-modal__warehouse) { display: flex; flex-direction: column; gap: 0; }
.service-modal__warehouse { display: flex; align-items: center; gap: 12px; margin-top: 20px; padding: 20px 0 0; border-top: 1px solid rgba(50,55,65,.2); background: transparent; }
/* Both service cards use exactly the same translucent surface as frontend/src/style.css. */
.service-modal__sections > section,
.service-modal__warehouse-panel {
  background: rgba(255,255,255,.72) !important;
  border: 1px solid rgba(177,13,42,.15);
  border-radius: 15px;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
:global(html.theme-dark) .service-modal__sections > section,
:global(html.theme-dark) .service-modal__warehouse-panel {
  background: rgba(33,27,32,.78) !important;
  border-color: rgba(255,255,255,.14);
}
.service-modal__warehouse-panel { display: flex; align-items: center; gap: 12px; flex: 1 1 auto; min-width: 0; padding: 18px; }
.service-modal__warehouse-icon { flex: 0 0 34px; width: 34px; height: 34px; color: #b00929; }
.service-modal__warehouse-copy { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; gap: 6px; color: #30333c; line-height: 1.5; }
.service-modal__warehouse-copy strong { font-weight: 700; color: #b00929; }
.service-modal__route { display: inline-flex; align-items: center; justify-content: center; gap: 8px; flex: 0 0 auto; margin-left: auto; padding: 9px 15px; border: 1.5px solid #e58d9c; border-radius: 999px; color: #b00929; font-size: .86em; font-weight: 700; text-decoration: none; white-space: nowrap; background: rgba(255,225,232,.72); transition: background .2s ease, border-color .2s ease; }
.service-modal__route-icon { width: 19px; height: 19px; flex: none; }
.service-modal__route:hover, .service-modal__route:focus-visible { background: rgba(255,211,222,.94); border-color: #b00929; }
@media (max-width: 700px) { .service-modal__warehouse { align-items: flex-start; flex-wrap: wrap; gap: 12px; } .service-modal__warehouse-panel { flex: 1 1 100%; gap: 10px; } .service-modal__warehouse-icon { width: 26px; height: 26px; flex-basis: 26px; } .service-modal__route { margin-left: auto; } }

.home-news-empty { padding: 24px 16px; margin: 0; color: #5d6270; font-size: 14px; line-height: 1.5; }
/* The FAQ answer area is part of the same clickable card. */
.faq-list .faq-item { cursor: pointer; }
</style>

<style scoped>
.experience-comments-empty {
  margin: 18px 0 26px;
  color: #8c7480;
  font-size: 14px;
}
.promise-track--static {
  animation: none !important;
}
.promise-track:focus-within {
  animation-play-state: paused;
}
.promise-track .promise-card--comment {
  height: 265px;
}
.promise-card--comment .promise-card__comment-content {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  justify-content: flex-end;
  margin-top: 14px;
}
.promise-card--comment .promise-card__section {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  font-weight: 750;
  opacity: .85;
  margin-bottom: 8px;
  overflow-wrap: anywhere;
}
.promise-card--comment .promise-card__message {
  max-width: none;
  max-height: 110px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.promise-card--comment h3 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  margin: 11px 0 0;
  font-size: 17px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
@media (prefers-reduced-motion: reduce) {
  .promise-track {
    animation: none !important;
  }
  .promise-carousel {
    overflow-x: auto;
  }
}
</style>

<style scoped>
/* Regional home capabilities. Scoped to the two modules between globe and digital services. */
.home-specialties {
  position: relative;
  padding: clamp(28px, 4vw, 56px) 0 clamp(42px, 5vw, 64px);
}
.home-specialties__inner {
  width: min(1180px, calc(100% - 48px));
  margin-inline: auto;
}
.home-specialties__eyebrow {
  margin: 0 0 17px 4px;
  color: #b5092b;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .17em;
  line-height: 1.5;
}
.home-specialties__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: clamp(14px, 1.8vw, 24px);
}
.home-specialties__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: clamp(18px, 2vw, 26px);
  min-width: 0;
  min-height: 166px;
  padding: clamp(22px, 2.5vw, 30px);
  overflow: hidden;
  border-radius: 20px;
  background: rgba(255, 255, 255, .68);
  box-shadow: inset 0 0 0 1px rgba(175, 16, 47, .12), 0 14px 35px rgba(48, 10, 26, .055);
}
.home-specialties__item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 28px;
  width: 72px;
  height: 3px;
  border-radius: 0 0 5px 5px;
  background: linear-gradient(90deg, #b5092b, #f35b74);
}
.home-specialties__icon-wrap {
  display: grid;
  place-items: center;
  flex: 0 0 74px;
  width: 74px;
  height: 74px;
  border-radius: 18px;
  background: rgba(181, 9, 43, .055);
  color: #b5092b;
}
.home-specialties__icon {
  display: block;
  width: 49px;
  height: 49px;
}
.home-specialties__copy { min-width: 0; }
.home-specialties__overline {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 10px;
  color: #8a4b59;
  font-size: 10px;
  font-weight: 850;
  letter-spacing: .12em;
}
.home-specialties__overline b {
  font-size: 10px;
  color: #b5092b;
  font-weight: 900;
}
.home-specialties__heading {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 0;
  line-height: 1.13;
  letter-spacing: -.035em;
  font-size: clamp(23px, 2.25vw, 31px);
  font-weight: 850;
}
.home-specialties__heading span { color: #202127; }
.home-specialties__heading strong { color: #b5092b; font-size: clamp(17px, 1.52vw, 21px); font-weight: 800; line-height: 1.35; letter-spacing: -.012em; }
@media (max-width: 760px) {
  .home-specialties { padding: 26px 0 38px; }
  .home-specialties__inner { width: min(100%, calc(100% - 28px)); }
  .home-specialties__grid { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .home-specialties__item { min-height: 130px; padding: 20px; gap: 16px; }
  .home-specialties__icon-wrap { width: 60px; height: 60px; flex-basis: 60px; border-radius: 15px; }
  .home-specialties__icon { width: 42px; height: 42px; }
  .home-specialties__heading { font-size: clamp(21px, 5.2vw, 28px); }
  .home-specialties__overline { margin-bottom: 8px; }
}
@media (max-width: 360px) {
  .home-specialties__item { gap: 12px; padding: 16px; }
  .home-specialties__icon-wrap { width: 52px; height: 52px; flex-basis: 52px; }
  .home-specialties__icon { width: 37px; height: 37px; }
  .home-specialties__heading { font-size: 20px; }
}
</style>

<!-- Theme-specific colors are isolated from the site's global white-text override. -->
<style>
html.theme-dark .app-site.home-page .home-specialties .home-specialties__eyebrow,
html.theme-dark .app-site.home-page .home-specialties .home-specialties__overline b {
  color: #e21d3b !important;
  -webkit-text-fill-color: #e21d3b !important;
}
html.theme-dark .app-site.home-page .home-specialties .home-specialties__overline {
  color: #c4acb9 !important;
  -webkit-text-fill-color: #c4acb9 !important;
}
html.theme-dark .app-site.home-page .home-specialties .home-specialties__heading span {
  color: #fff !important;
  -webkit-text-fill-color: #fff !important;
}
html.theme-dark .app-site.home-page .home-specialties .home-specialties__heading strong {
  color: #e21d3b !important;
  -webkit-text-fill-color: #e21d3b !important;
}
/* Match the dark-blue contact tiles and their restrained red edge glow. */
html.theme-dark .app-site.home-page .home-specialties .home-specialties__item {
  background: linear-gradient(180deg, #020a24 0%, #01081d 100%) !important;
  border: 1px solid rgba(181, 9, 43, .45) !important;
  box-shadow:
    0 0 18px rgba(181, 9, 43, .18),
    0 0 34px rgba(181, 9, 43, .10),
    inset 0 0 0 1px rgba(181, 9, 43, .10) !important;
}
html.theme-dark .app-site.home-page .home-specialties .home-specialties__item::before {
  display: none;
}
html.theme-dark .app-site.home-page .home-specialties .home-specialties__icon-wrap {
  background: rgba(181, 9, 43, .22) !important;
  border-radius: 50%;
  color: #fff !important;
}
html.theme-dark .app-site.home-page .home-specialties .home-specialties__icon,
html.theme-dark .app-site.home-page .home-specialties .home-specialties__icon path {
  color: #fff !important;
  stroke: #fff !important;
}

/* Match the white contact cards in light mode (navy remains dark-only). */
html:not(.theme-dark) .app-site.home-page .home-specialties .home-specialties__item {
  background: #fff !important;
  border: 1px solid rgba(237, 23, 55, .38) !important;
  box-shadow:
    0 0 24px rgba(237, 23, 55, .12),
    0 0 5px rgba(237, 23, 55, .12) !important;
}
html:not(.theme-dark) .app-site.home-page .home-specialties .home-specialties__item::before {
  display: none;
}
html:not(.theme-dark) .app-site.home-page .home-specialties .home-specialties__icon-wrap {
  background: #fde9ed !important;
  border-radius: 50%;
  color: #b5092b !important;
}
html:not(.theme-dark) .app-site.home-page .home-specialties .home-specialties__icon,
html:not(.theme-dark) .app-site.home-page .home-specialties .home-specialties__icon path {
  color: #b5092b !important;
  stroke: #b5092b !important;
}
html:not(.theme-dark) .app-site.home-page .home-specialties .home-specialties__heading span {
  color: #202127 !important;
  -webkit-text-fill-color: #202127 !important;
}
html:not(.theme-dark) .app-site.home-page .home-specialties .home-specialties__heading strong,
html:not(.theme-dark) .app-site.home-page .home-specialties .home-specialties__overline b {
  color: #b5092b !important;
  -webkit-text-fill-color: #b5092b !important;
}
html:not(.theme-dark) .app-site.home-page .home-specialties .home-specialties__overline {
  color: #8a4b59 !important;
  -webkit-text-fill-color: #8a4b59 !important;
}
</style>

<style>
/* Home mobile keeps its original vertical layout, dimensions and colors.
   Only hide tabs when an open service needs extra room. */
@media (max-width: 800px) {
  /* Keep the original closed-tab width; only center the six-tab row.
     Do not stretch the cards to fill the row, so opening retains the old proportions. */
  html .app-site.home-page #servicios .service-accordion.is-collapsed {
    justify-content: center !important;
  }
  html .app-site.home-page #servicios .service-accordion__item[hidden] {
    display: none !important;
  }
  /* More specific than the older global mobile transition:none rule.
     Reuse the original .45s flex animation without altering layout sizing. */
  html .app-site.home-page #servicios .service-accordion__item {
    transition: flex .45s cubic-bezier(.2,.8,.2,1), border-color .25s !important;
  }
}
@media (prefers-reduced-motion: reduce) {
  html .app-site.home-page #servicios .service-accordion__item {
    transition: none !important;
  }
}
</style>
