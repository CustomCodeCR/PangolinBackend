<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import WorldGlobe from './components/WorldGlobe.vue'
import IconSymbol from './components/IconSymbol.vue'
import SiteMedia from './components/SiteMedia.vue'
import { siteText, siteVisual, siteCssImage } from './siteCms'
import { services as baseServices, faqs as baseFaqs, type ServiceKey } from './content'
import type { ManagedNews } from './adminContent'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n({ useScope: 'global' })
const activeService = ref<ServiceKey>('Air')
const localizedServices = computed(() => baseServices.map(service => ({
  ...service,
  photo: siteVisual(`home.services.${service.key.toLowerCase()}.media`, service.photo).src,
  kind: siteVisual(`home.services.${service.key.toLowerCase()}.media`, service.photo).kind,
  title: siteText(`home.services.${service.key.toLowerCase()}.title`, t(`content.services.${service.key}.title`), locale.value),
  label: t(`content.services.${service.key}.label`),
  description: t(`content.services.${service.key}.description`),
  detail: siteText(`home.services.${service.key.toLowerCase()}.detail`, t(`content.services.${service.key}.detail`), locale.value)
})))
const transportServices = computed(() => (['Air', 'Maritime', 'Land', 'Multimodal'] as ServiceKey[]).map(key => localizedServices.value.find(service => service.key === key)!))
const selectedService = computed(() => localizedServices.value.find(service => service.key === activeService.value) ?? localizedServices.value[0])
const modalService = ref<ServiceKey | null>(null)
const modalPhoto = computed(() => siteCssImage(`home.services.${modalService.value?.toLowerCase()}.media`, baseServices.find(service => service.key === modalService.value)?.photo ?? '/images/hero.webp'))
const modalItemCounts: Record<ServiceKey, number[]> = { Maritime: [5, 4, 3], Land: [4, 4, 3], Air: [4, 3], Multimodal: [3, 3] }
const serviceInfo = computed(() => Object.fromEntries((['Maritime', 'Land', 'Air', 'Multimodal'] as ServiceKey[]).map(key => {
  const base = `custom.home.modal.${key}`
  return [key, {
    title: t(`${base}.title`),
    sections: modalItemCounts[key].map((itemCount, sectionIndex) => ({
      heading: t(`${base}.sections.${sectionIndex}.heading`),
      items: Array.from({ length: itemCount }, (_, itemIndex) => t(`${base}.sections.${sectionIndex}.items.${itemIndex}`))
    }))
  }]
})) as Record<ServiceKey, { title: string; sections: { heading: string; items: string[] }[] }>)
const expandedFaq = ref<number | null>(0)
const faqs = computed(() => baseFaqs.map((faq, index) => ({
  ...faq,
  q: siteText(`home.faq.${index}.q`, t(`content.faqs.${index}.q`), locale.value),
  a: siteText(`home.faq.${index}.a`, t(`content.faqs.${index}.a`), locale.value)
})))
const promises = computed(() => [0, 1, 2].map(index => ({
  icon: ['↗', '◎', '✦'][index],
  title: siteText(`home.digital.card.${index}.title`, t(`content.promises.${index}.title`), locale.value),
  subtitle: siteText(`home.digital.card.${index}.subtitle`, t(`content.promises.${index}.subtitle`), locale.value)
})))
const stats = computed(() => [
  { value: '+25', label: t('custom.home.stats.0') },
  { value: '#1', label: t('custom.home.stats.1') },
  { value: '+105', label: t('custom.home.stats.2') },
  { value: '24/7', label: t('custom.home.stats.3') }
])
const managedNews = ref<ManagedNews[]>([])
const homeNewsLoaded = ref(false)
const homeNewsError = ref(false)
const homeNews = computed(() => managedNews.value.filter(article => article.published && article.title.trim()).slice(0, 3).map(article => ({
  id: article.id, category: article.category, title: article.title,
  image: article.image || '/images/cover-logistics.jpeg'
})))


const activeStat = ref(0)
const newsScroller = ref<HTMLElement | null>(null)
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
  if (scroller.scrollLeft >= cycleWidth - 2) scroller.scrollLeft -= cycleWidth
  const index = Math.round(scroller.scrollLeft / step)
  scroller.scrollTo({ left: Math.min(scroller.scrollWidth - scroller.clientWidth, (index + 1) * step), behavior: 'smooth' })
}

function showStat(index: number) {
  activeStat.value = (index + stats.value.length) % stats.value.length
}

onMounted(async () => {
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
            <a href="mailto:comercial@castrofallas.com" class="btn btn-outline-light">
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
            <p class="home-route-seo">
              <a href="/transporte-panama-costa-rica/">Consolidados y transporte terrestre Panamá–Costa Rica <span aria-hidden="true">→</span></a>
            </p>

            <div class="service-accordion" :aria-label="$t('phrases.p134')">
              <article
                v-for="service in transportServices"
                :key="service.key"
                class="service-accordion__item"
                :class="{ 'is-open': activeService === service.key }"
                 :style="{ '--service-image': siteCssImage(`home.services.${service.key.toLowerCase()}.media`, baseServices.find(item => item.key === service.key)?.photo ?? '/images/hero.webp') }"
              >
                <SiteMedia v-if="service.kind.startsWith('Video')" :slot-key="`home.services.${service.key.toLowerCase()}.media`" :fallback="service.photo" background />
                <button
                  class="service-accordion__trigger"
                  type="button"
                  :aria-expanded="activeService === service.key"
                  @mouseenter="activeService = service.key"
                  @focus="activeService = service.key"
                  @click="activeService = service.key"
                ><span class="service-accordion__name">{{ service.label }}</span></button>
                <div v-if="activeService === service.key" class="service-accordion__panel">
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

          <aside class="home-news-sidebar" :aria-label="$t('custom.home.newsAria')">
            <div class="home-hero-news__header">
              <span>{{ $t('custom.home.newsHeader') }}</span>
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
                <div v-for="copy in (homeNews.length > 1 ? 2 : 1)" :key="copy" class="home-news-sidebar__group" :aria-hidden="copy === 2">
                  <a
                    v-for="item in homeNews"
                    :key="`${copy}-${item.id}`"
                    class="home-hero-news__card"
                    :href="'/noticias?article=' + encodeURIComponent(item.id)"
                    :tabindex="copy === 2 ? -1 : 0"
                    :aria-label="`${$t('custom.home.newsAria')}: ${item.title}`"
                  >
                    <img :src="item.image" :alt="item.title" loading="lazy" />
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
            <h2 class="section-title">{{ $t('phrases.p021') }}<br /><span>{{ $t('phrases.p022') }}</span></h2>
            <p class="section-desc">
              {{ $t('phrases.p023') }}
            </p>
            <a class="btn btn-primary" href="/tracking">
              {{ $t('phrases.p024') }} <IconSymbol glyph="↗" />
            </a>
            <small>
              {{ $t('phrases.p025') }}
            </small>
          </div>

          <WorldGlobe />
        </div>
      </section>

      <section id="soluciones" class="experience-section section-spacing">
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

          <div class="promise-carousel">
            <div class="promise-track">
              <article
                v-for="(promise, index) in [...promises, ...promises]"
                :key="index"
                class="promise-card"
              >
                <div class="promise-card__top">
                  <IconSymbol :glyph="promise.icon" :size="22" />
                  <small>0{{ (index % promises.length) + 1 }}</small>
                </div>
                <h3>{{ promise.title }}</h3>
                <p>{{ promise.subtitle }}</p>
                <div class="promise-card__dash"></div>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section class="section-spacing about-access">
        <div class="container">
          <p class="section-tag center">{{ $t('phrases.p060') }}</p>
          <h2 class="section-title centered">
            {{ $t('phrases.p061') }} <span>{{ $t('phrases.p062') }}</span>
          </h2>
          <p class="section-desc centered">
            {{ siteText('home.digital.intro', $t('phrases.p063'), locale) }}
          </p>

          <div class="access-grid">
            <a class="access-card access-card--tracking" href="/tracking" :style="{ '--cms-access-tracking': siteCssImage('home.tracking.media', '/images/tracking-red.webp') }">
               <SiteMedia v-if="siteVisual('home.tracking.media', '/images/tracking-red.webp').kind.startsWith('Video')" slot-key="home.tracking.media" fallback="/images/tracking-red.webp" background />
              <IconSymbol glyph="→" :size="22" />
              <strong>{{ $t('custom.home.trackingTitle') }}</strong>
              <small>{{ $t('phrases.p064') }}</small>
            </a>
            <a class="access-card access-card--quote" href="/cotizaciones" :style="{ '--cms-access-quote': siteCssImage('home.quote.media', '/images/services-crane.webp') }">
               <SiteMedia v-if="siteVisual('home.quote.media', '/images/services-crane.webp').kind.startsWith('Video')" slot-key="home.quote.media" fallback="/images/services-crane.webp" background />
              <IconSymbol glyph="➜" :size="22" />
              <strong>{{ $t('custom.home.quoteCardTitle') }}</strong>
              <small>{{ $t('phrases.p065') }}</small>
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

          <div class="faq-list">
            <div
              v-for="(faq, index) in faqs"
              :key="faq.q"
              class="faq-item"
              :class="{ 'faq-item--open': expandedFaq === index }"
            >
              <button
                :aria-expanded="expandedFaq === index"
                type="button"
                @click="expandedFaq = expandedFaq === index ? null : index"
              >
                <span>{{ faq.q }}</span>
                <IconSymbol :glyph="expandedFaq === index ? '−' : '+'" :size="18" />
              </button>
              <div v-if="expandedFaq === index" class="faq-answer">{{ faq.a }}</div>
            </div>
          </div>
        </div>
      </section>

      <section class="home-contact-details" :aria-label="$t('custom.home.contactAria')">
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
          <a class="home-contact-card" href="https://maps.google.com/?q=Frente+a+Caf%C3%A9+Volio,+Curridabat,+Costa+Rica" target="_blank" rel="noopener noreferrer">
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
          <SiteMedia v-if="siteVisual(`home.services.${modalService.toLowerCase()}.media`, baseServices.find(item => item.key === modalService)?.photo ?? '/images/hero.webp').kind === 'Video'"
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
          </div>
          <a class="btn btn-primary" :href="`/cotizaciones?servicio=${modalService}`">
            {{ $t('custom.home.requestRate') }} <IconSymbol glyph="↗" />
          </a>
        </section>
      </div>
    </main>

    <SiteFooter />
  </div>
</template>

<style scoped>
.home-news-empty { padding: 24px 16px; margin: 0; color: #5d6270; font-size: 14px; line-height: 1.5; }
.home-route-seo { text-align: center; margin: 0 0 1.5rem; }
.home-route-seo a { color: #af0922; font-weight: 700; text-underline-offset: 4px; }
.home-route-seo a:hover, .home-route-seo a:focus-visible { color: #8e071d; }
</style>
