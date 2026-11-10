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
.services-directory {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  padding: 64px 0 88px;
  background: linear-gradient(140deg, #f8e8ec 0%, #fcf8f9 52%, #fff 100%);
}
.services-directory::before {
  content: "";
  position: absolute;
  inset: -180px auto auto -200px;
  width: 640px;
  height: 480px;
  background: radial-gradient(ellipse, rgba(177, 12, 43, .09), transparent 70%);
  pointer-events: none;
}
.services-directory__container { position: relative; z-index: 1; max-width: 1220px; }
.services-directory__heading { max-width: 780px; margin: 0 auto 48px; text-align: center; }
.services-directory__heading .section-title {
  font-size: clamp(32px, 3.5vw, 51px);
  line-height: 1.1;
  margin: 12px 0 14px;
}
.services-directory__intro {
  max-width: 590px;
  margin: 0 auto;
  color: #6c5a63;
  font-size: 15px;
  line-height: 1.65;
}
.services-directory__group + .services-directory__group { margin-top: 34px; }
.services-directory__group-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid rgba(114, 42, 56, .19);
  padding-bottom: 14px;
  margin-bottom: 16px;
}
.services-directory__group-heading h3 {
  margin: 0;
  color: #252630;
  font-size: 14px;
  font-weight: 850;
  letter-spacing: .075em;
  text-transform: uppercase;
}
.services-directory__count {
  color: #a95768;
  flex: none;
  font-size: 10px;
  font-weight: 850;
  letter-spacing: .15em;
}
.services-directory__links {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.services-directory__links--logistics { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.services-directory__card {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto 1fr;
  gap: 20px 12px;
  min-width: 0;
  min-height: 143px;
  padding: 22px;
  border: 1px solid rgba(113, 47, 62, .17);
  border-radius: 18px;
  background: linear-gradient(155deg, rgba(255, 255, 255, .94), rgba(255, 255, 255, .67));
  box-shadow: 0 5px 24px rgba(65, 17, 35, .045);
  color: #24252e;
  text-decoration: none;
  outline-offset: 4px;
  overflow: hidden;
  transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease, background-color .22s ease;
}
.services-directory__card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 22px;
  width: 48px;
  height: 3px;
  background: #b30c2d;
  border-radius: 0 0 3px 3px;
}
.services-directory__card-index {
  grid-column: 1;
  grid-row: 1;
  color: #ad1734;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .19em;
}
.services-directory__card-title {
  grid-column: 1;
  grid-row: 2;
  align-self: end;
  font-size: clamp(14px, 1.2vw, 17px);
  line-height: 1.35;
  font-weight: 850;
  overflow-wrap: break-word;
}
.services-directory__card-arrow {
  grid-column: 2;
  grid-row: 1 / 3;
  align-self: end;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid rgba(179, 12, 45, .22);
  border-radius: 50%;
  background: #f9e9ed;
  color: #b30c2d;
  font-size: 20px;
  font-weight: 650;
  line-height: 1;
  transition: background .22s ease, color .22s ease, transform .22s ease;
}
.services-directory__card:is(:hover, :focus-visible) {
  transform: translateY(-4px);
  border-color: rgba(179, 12, 45, .45);
  box-shadow: 0 16px 38px rgba(99, 15, 39, .12);
  background: #fff;
}
.services-directory__card:is(:hover, :focus-visible) .services-directory__card-arrow {
  transform: rotate(45deg);
  background: #b30c2d;
  color: #fff;
}
:global(html.theme-dark) .services-directory {
  background: linear-gradient(140deg, #0b1428, #151629 60%, #241320) !important;
}
:global(html.theme-dark) .services-directory__intro { color: #d4c7cf !important; }
:global(html.theme-dark) .services-directory__group-heading { border-color: rgba(255, 255, 255, .2) !important; }
:global(html.theme-dark) .services-directory__count { color: #ff9bab !important; }
:global(html.theme-dark) .services-directory__card {
  background: linear-gradient(150deg, rgba(255, 255, 255, .095), rgba(255, 255, 255, .035)) !important;
  border-color: rgba(255, 255, 255, .2) !important;
  box-shadow: 0 5px 25px rgba(0, 0, 0, .1);
}
:global(html.theme-dark) .services-directory__card-index { color: #ff91a3 !important; }
:global(html.theme-dark) .services-directory__card-arrow {
  background: rgba(179, 12, 45, .3) !important;
  border-color: rgba(255, 145, 163, .35) !important;
  color: #ffadb9 !important;
}
:global(html.theme-dark) .services-directory__card:is(:hover, :focus-visible) {
  border-color: rgba(255, 145, 163, .7) !important;
  background: rgba(178, 11, 45, .20) !important;
  box-shadow: 0 16px 40px rgba(0, 0, 0, .25);
}
:global(html.theme-dark) .services-directory__card:is(:hover, :focus-visible) .services-directory__card-arrow {
  background: #bd1435 !important;
  color: #fff !important;
}
@media (max-width: 920px) {
  .services-directory__links,
  .services-directory__links--logistics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 580px) {
  .services-directory { padding: 54px 0 64px; }
  .services-directory__heading { margin-bottom: 34px; }
  .services-directory__group-heading { align-items: center; }
  .services-directory__count { font-size: 9px; letter-spacing: .1em; }
  .services-directory__links,
  .services-directory__links--logistics { grid-template-columns: 1fr; gap: 10px; }
  .services-directory__card { min-height: 104px; padding: 17px 18px; gap: 12px; border-radius: 14px; }
  .services-directory__card::before { left: 18px; }
  .services-directory__card-title { font-size: 15px; }
  .services-directory__card-arrow { width: 34px; height: 34px; }
}
@media (prefers-reduced-motion: reduce) {
  .services-directory__card,
  .services-directory__card-arrow { transition: none; }
  .services-directory__card:is(:hover, :focus-visible) { transform: none; }
}
</style>
