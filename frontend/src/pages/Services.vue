<script setup lang="ts">
import IconSymbol from '../components/IconSymbol.vue'
import SiteMedia from '../components/SiteMedia.vue'
import { siteText, siteVisual, siteCssImage } from '../siteCms'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { services as baseServices, type ServiceKey } from '../content'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import serviceFaqData from '../../seo/service-faqs.json'
import serviceGuides from '../../seo/service-landings.json'
import servicePages from '../../seo/service-pages.json'

const { t, locale } = useI18n({ useScope: 'global' })
const serviceFaqs = computed(() => serviceFaqData.servicios.map(faq => ({
  question: locale.value.toLowerCase().startsWith('es') ? faq.question.es : faq.question.en,
  answer: locale.value.toLowerCase().startsWith('es') ? faq.answer.es : faq.answer.en
})))
// Enlaces HTML visibles para que usuarios y rastreadores descubran las páginas
// comerciales. No dependen de abrir pestañas, modales ni ejecutar un clic.
const serviceDirectory = computed(() => {
  const lang: 'es' | 'en' = locale.value.toLowerCase().startsWith('es') ? 'es' : 'en'
  return [
    ...servicePages.map(item => ({ href: '/servicios/' + item.slug, label: item.title[lang] })),
    ...Object.entries(serviceGuides).map(([href, guide]) => ({ href, label: guide[lang].label }))
  ]
})
const serviceDirectoryGroups = computed(() => {
  const es = locale.value.toLowerCase().startsWith('es')
  return [
    {
      id: 'transport',
      title: es ? 'Transporte de carga' : 'Freight transportation',
      links: serviceDirectory.value.slice(0, servicePages.length)
    },
    {
      id: 'logistics',
      title: es ? 'Logística y aduanas' : 'Logistics and customs',
      links: serviceDirectory.value.slice(servicePages.length)
    }
  ]
})
const activeService = ref<ServiceKey>('Air')
const modalService = ref<ServiceKey | null>(null)
const modalPhoto = computed(() => siteCssImage(`services.${modalService.value?.toLowerCase()}.media`, baseServices.find(service => service.key === modalService.value)?.photo ?? '/images/hero.webp'))
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
const services = computed(() => (['Air', 'Maritime', 'Land', 'Multimodal'] as ServiceKey[]).map(key => {
  const service = baseServices.find(item => item.key === key)!
  return {
    ...service,
    photo: siteVisual(`services.${key.toLowerCase()}.media`, service.photo).src,
    kind: siteVisual(`services.${key.toLowerCase()}.media`, service.photo).kind,
    title: siteText(`services.${key.toLowerCase()}.title`, t(`content.services.${key}.title`), locale.value),
    label: t(`content.services.${key}.label`),
    description: t(`content.services.${key}.description`),
    detail: siteText(`services.${key.toLowerCase()}.detail`, t(`content.services.${key}.detail`), locale.value)
  }
}))
</script>

<template>
  <div class="app-site services-page">
    <section class="inner-hero inner-hero--services" :style="{ '--cms-services-hero': siteCssImage('services.hero.media', '/images/services-crane.webp') }">
      <SiteMedia v-if="siteVisual('services.hero.media', '/images/services-crane.webp').kind.startsWith('Video')" slot-key="services.hero.media" fallback="/images/services-crane.webp" background />
      <SiteHeader active="soluciones" overlay />
      <div class="container inner-hero__copy">
        <p class="section-tag light-tag">{{ $t('phrases.p008') }}</p>
        <h1>{{ siteText('services.hero.heading1', $t('phrases.p009'), locale) }}<br /><span>{{ siteText('services.hero.heading2', $t('phrases.p010'), locale) }}</span></h1>
        <p>{{ siteText('services.hero.intro', $t('phrases.p011'), locale) }}</p>
        <a href="#nuestros-servicios" class="btn btn-primary">{{ $t('phrases.p003') }} <IconSymbol glyph="↓" /></a>
      </div>
    </section>
    <main>
      <section id="nuestros-servicios" class="services-section section-spacing">
        <div class="container services-page__transport">
          <p class="section-tag center">{{ $t('phrases.p008') }}</p>
          <h2 class="section-title centered">{{ siteText('services.catalog.heading1', $t('phrases.p009'), locale) }} <span>{{ siteText('services.catalog.heading2', $t('phrases.p010'), locale) }}</span></h2>
          <p class="section-desc centered">{{ siteText('services.catalog.intro', $t('phrases.p011'), locale) }}</p>
          <div class="services-showcase" :aria-label="$t('phrases.p134')">
            <div class="services-showcase__tabs" role="tablist">
              <button v-for="service in services" :key="service.key" class="services-showcase__tab" :class="{ 'is-active': activeService === service.key }" type="button" role="tab" :aria-selected="activeService === service.key" @click="activeService = service.key">
                <span aria-hidden="true"><IconSymbol :glyph="service.icon" :size="20" /></span><span>{{ service.title }}</span><i aria-hidden="true"></i>
              </button>
            </div>
            <article v-for="service in services" v-show="activeService === service.key" :key="service.key" class="services-showcase__feature"  :style="{ '--service-photo': siteCssImage(`services.${service.key.toLowerCase()}.media`, baseServices.find(item => item.key === service.key)?.photo ?? '/images/hero.webp') }" role="tabpanel">
              <SiteMedia v-if="service.kind.startsWith('Video')" :slot-key="`services.${service.key.toLowerCase()}.media`" :fallback="service.photo" background />
              <div class="services-showcase__copy">
                <p class="section-tag light-tag">{{ service.label }}</p>
                <h3>{{ service.title }}</h3>
                <p>{{ service.detail }}</p>
                  <button class="btn btn-primary" type="button" @click="modalService = service.key">{{ $t('custom.home.seeMore') }} <IconSymbol glyph="↗" /></button>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section class="complementary section-spacing" id="servicios-complementarios">
        <div class="container">
          <p class="section-tag center">{{ $t('phrases.p048') }}</p>
          <h2 class="section-title centered">{{ siteText('services.complementary.heading1', $t('phrases.p049'), locale) }} <span>{{ siteText('services.complementary.heading2', $t('phrases.p050'), locale) }}</span></h2>
          <p class="section-desc centered">{{ siteText('services.complementary.intro', $t('phrases.p051'), locale) }}</p>
          <div class="complementary-grid">
            <article class="complementary-card"><SiteMedia slot-key="services.complementary.customs.media" fallback="/images/services-crane.webp" :alt="$t('phrases.p140')" /><div><span class="section-tag light-tag">{{ $t('phrases.p052') }}</span><h3>{{ siteText('services.complementary.customs.title', $t('phrases.p053'), locale) }}</h3><p>{{ siteText('services.complementary.customs.intro', $t('phrases.p054'), locale) }}</p></div></article>
            <article class="complementary-card"><SiteMedia slot-key="services.complementary.warehouse.media" fallback="/images/warehouse-person.webp" :alt="$t('phrases.p141')" /><div><span class="section-tag light-tag">{{ $t('phrases.p056') }}</span><h3>{{ siteText('services.complementary.warehouse.title', $t('phrases.p057'), locale) }}</h3><p>{{ siteText('services.complementary.warehouse.intro', $t('phrases.p058'), locale) }}</p></div></article>
          </div>
        </div>
      </section>

      <section class="services-faq section-spacing" aria-labelledby="services-faq-title">
        <div class="container services-faq__inner">
          <p class="section-tag center">{{ locale.toLowerCase().startsWith('es') ? 'PREGUNTAS FRECUENTES' : 'FREQUENTLY ASKED QUESTIONS' }}</p>
          <h2 id="services-faq-title" class="section-title centered">{{ locale.toLowerCase().startsWith('es') ? 'Más sobre nuestros servicios' : 'More about our services' }}</h2>
          <details v-for="faq in serviceFaqs" :key="faq.question" class="services-faq__item">
            <summary>{{ faq.question }}</summary>
            <p>{{ faq.answer }}</p>
          </details>
        </div>
      </section>

      <section class="section-spacing about-access services-page__digital">
        <div class="container">
          <p class="section-tag center">{{ $t('phrases.p060') }}</p>
          <h2 class="section-title centered">{{ $t('phrases.p061') }} <span>{{ $t('phrases.p062') }}</span></h2>
          <p class="section-desc centered">{{ $t('phrases.p063') }}</p>
          <div class="access-grid"><a class="access-card access-card--tracking" href="/tracking" :style="{ '--cms-access-tracking': siteCssImage('services.tracking.media', '/images/tracking-red.webp') }">
                <SiteMedia v-if="siteVisual('services.tracking.media', '/images/tracking-red.webp').kind.startsWith('Video')" slot-key="services.tracking.media" fallback="/images/tracking-red.webp" background /><IconSymbol glyph="→" /><strong>{{ $t('custom.home.trackingTitle') }}</strong></a><a class="access-card access-card--quote" href="/cotizaciones" :style="{ '--cms-access-quote': siteCssImage('services.quote.media', '/images/services-crane.webp') }">
                <SiteMedia v-if="siteVisual('services.quote.media', '/images/services-crane.webp').kind.startsWith('Video')" slot-key="services.quote.media" fallback="/images/services-crane.webp" background /><IconSymbol glyph="➜" /><strong>{{ $t('custom.home.quoteCardTitle') }}</strong></a></div>
        </div>
      </section>

      <section class="services-directory" aria-labelledby="services-directory-heading">
        <div class="container services-directory__container">
          <div class="services-directory__heading">
            <p class="section-tag center">{{ locale.toLowerCase().startsWith('es') ? 'EXPLORAR SERVICIOS' : 'EXPLORE SERVICES' }}</p>
            <h2 id="services-directory-heading" class="section-title centered">{{ locale.toLowerCase().startsWith('es') ? 'Conocé cada solución en detalle' : 'Explore each service in detail' }}</h2>
            <p class="services-directory__intro">{{ locale.toLowerCase().startsWith('es') ? 'Todo lo que tu carga necesita, desde el primer movimiento hasta su destino.' : 'Everything your cargo needs, from its first move to its destination.' }}</p>
          </div>
          <div class="services-directory__groups">
            <section v-for="group in serviceDirectoryGroups" :key="group.id" class="services-directory__group">
              <div class="services-directory__group-heading">
                <h3>{{ group.title }}</h3>
                <span class="services-directory__count">{{ String(group.links.length).padStart(2, '0') }} {{ locale.toLowerCase().startsWith('es') ? 'SERVICIOS' : 'SERVICES' }}</span>
              </div>
              <nav class="services-directory__links" :class="`services-directory__links--${group.id}`" :aria-label="group.title">
                <a v-for="(link, index) in group.links" :key="link.href" :href="link.href" class="services-directory__card">
                  <span class="services-directory__card-index" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
                  <strong class="services-directory__card-title">{{ link.label }}</strong>
                  <span class="services-directory__card-arrow" aria-hidden="true">↗</span>
                </a>
              </nav>
            </section>
          </div>
        </div>
      </section>
    </main>
    <div v-if="modalService" class="service-modal-backdrop" @click.self="modalService = null">
      <section class="service-modal" role="dialog" aria-modal="true" :aria-label="serviceInfo[modalService].title" :style="{ '--modal-service-photo': modalPhoto }">
        <SiteMedia v-if="siteVisual(`services.${modalService.toLowerCase()}.media`, baseServices.find(item => item.key === modalService)?.photo ?? '/images/hero.webp').kind === 'Video'"
          :slot-key="`services.${modalService.toLowerCase()}.media`" :fallback="baseServices.find(item => item.key === modalService)?.photo ?? '/images/hero.webp'" background />
        <button class="service-modal__close" type="button" :aria-label="$t('custom.home.close')" @click="modalService = null"><IconSymbol glyph="×" :size="20" /></button>
        <p class="section-tag">{{ $t('custom.home.modalEyebrow') }}</p>
        <h2>{{ serviceInfo[modalService].title }}</h2>
        <div class="service-modal__sections">
          <section v-for="group in serviceInfo[modalService].sections" :key="group.heading">
            <h3>{{ group.heading }}</h3>
            <ul><li v-for="item in group.items" :key="item">{{ item }}</li></ul>
          </section>
        </div>
        <a class="btn btn-primary" :href="`/cotizaciones?servicio=${modalService}`">{{ $t('custom.home.requestRate') }} <IconSymbol glyph="↗" /></a>
      </section>
    </div>
    <SiteFooter />
  </div>
</template>

<style scoped>
/* Directorio SEO: mismo lenguaje visual de los FAQ y bloques de servicios.
   Las tarjetas son enlaces reales, compactos y visibles sin interacciones. */
.services-directory {
  position: relative;
  padding: 48px 0 64px;
  background: #fcf7f8;
}
.services-directory__container { max-width: 1180px; }
.services-directory__heading { max-width: 780px; margin: 0 auto 32px; text-align: center; }
.services-directory__heading .section-title {
  font-size: clamp(29px, 3vw, 43px);
  line-height: 1.13;
  margin: 9px 0 10px;
}
.services-directory__intro {
  max-width: 570px;
  margin: 0 auto;
  color: #68616a;
  font-size: 14px;
  line-height: 1.6;
}
.services-directory__group + .services-directory__group { margin-top: 26px; }
.services-directory__group-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(90, 61, 72, .18);
}
.services-directory__group-heading h3 {
  margin: 0;
  color: #272831;
  font-size: 12px;
  font-weight: 850;
  letter-spacing: .075em;
  text-transform: uppercase;
}
.services-directory__count {
  color: #a45164;
  flex: none;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .1em;
}
.services-directory__links {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.services-directory__links--logistics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.services-directory__card {
  position: relative;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 30px;
  align-items: center;
  gap: 12px;
  min-width: 0;
  min-height: 76px;
  padding: 13px 16px;
  border: 1px solid rgba(110, 71, 83, .22);
  border-radius: 13px;
  background: #fff;
  color: #24252e;
  text-decoration: none;
  box-shadow: 0 3px 12px rgba(50, 24, 36, .035);
  outline-offset: 3px;
  overflow: hidden;
  transition: border-color .2s ease, box-shadow .2s ease, background-color .2s ease;
}
.services-directory__card::before {
  content: "";
  position: absolute;
  inset: 13px auto 13px 0;
  width: 3px;
  background: #b30c2d;
  border-radius: 0 3px 3px 0;
}
.services-directory__card-index {
  grid-column: 1;
  color: #b30c2d;
  font-size: 10px;
  font-weight: 850;
  letter-spacing: .06em;
}
.services-directory__card-title {
  grid-column: 2;
  min-width: 0;
  color: #24252e;
  font-size: 14px;
  font-weight: 800;
  line-height: 1.35;
  overflow-wrap: break-word;
}
.services-directory__card-arrow {
  grid-column: 3;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(179, 12, 45, .25);
  border-radius: 50%;
  color: #af0d2d;
  background: #faeaf0;
  font-size: 17px;
  line-height: 1;
  transition: background-color .2s ease, color .2s ease;
}
.services-directory__card:is(:hover, :focus-visible) {
  border-color: #b30c2d;
  background: #fffafa;
  box-shadow: 0 6px 18px rgba(108, 15, 39, .11);
}
.services-directory__card:is(:hover, :focus-visible) .services-directory__card-arrow {
  background: #b30c2d;
  color: #fff;
}
.services-directory__card:focus-visible { outline: 2px solid #b30c2d; }

/* El CSS global de Castro Fallas fuerza texto blanco en modo oscuro.
   Forzamos TAMBIÉN la superficie de las tarjetas a azul oscuro sólido
   para evitar el bug de texto blanco sobre una tarjeta blanquecina. */
:global(html.theme-dark) .services-directory {
  background: #0b1428 !important;
}
:global(html.theme-dark) .services-directory__intro { color: #ced3df !important; }
:global(html.theme-dark) .services-directory__group-heading { border-color: rgba(255, 255, 255, .20) !important; }
:global(html.theme-dark) .services-directory__group-heading h3 { color: #f3f5fa !important; }
:global(html.theme-dark) .services-directory__count { color: #f5a0ae !important; }
:global(html.theme-dark) .services-directory .services-directory__card,
:global(html.theme-dark) .services-directory .services-directory__card:is(:link, :visited) {
  background: #101b30 !important;
  background-image: none !important;
  color: #f4f6fa !important;
  border-color: #39445a !important;
  box-shadow: none;
}
:global(html.theme-dark) .services-directory .services-directory__card-title { color: #f4f6fa !important; }
:global(html.theme-dark) .services-directory .services-directory__card-index { color: #ff8da1 !important; }
:global(html.theme-dark) .services-directory .services-directory__card-arrow {
  background: #291b31 !important;
  color: #ff9dad !important;
  border-color: #7b3b51 !important;
}
:global(html.theme-dark) .services-directory .services-directory__card:is(:hover, :focus-visible) {
  background: #182640 !important;
  border-color: #d43a59 !important;
  box-shadow: 0 6px 20px rgba(0, 0, 0, .22);
}
:global(html.theme-dark) .services-directory .services-directory__card:is(:hover, :focus-visible) .services-directory__card-arrow {
  background: #b30c2d !important;
  color: #fff !important;
}
:global(html.theme-dark) .services-directory .services-directory__card:focus-visible { outline-color: #ff97a9; }
@media (max-width: 980px) {
  .services-directory__links,
  .services-directory__links--logistics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 620px) {
  .services-directory { padding: 40px 0 52px; }
  .services-directory__heading { margin-bottom: 26px; }
  .services-directory__group-heading { align-items: center; }
  .services-directory__count { font-size: 9px; }
  .services-directory__links,
  .services-directory__links--logistics { grid-template-columns: 1fr; gap: 9px; }
  .services-directory__card { min-height: 66px; padding: 11px 13px; gap: 9px; }
  .services-directory__card::before { inset-block: 10px; }
  .services-directory__card-title { font-size: 13px; }
  .services-directory__card-arrow { width: 28px; height: 28px; }
}
@media (prefers-reduced-motion: reduce) {
  .services-directory__card,
  .services-directory__card-arrow { transition: none; }
}
</style>
