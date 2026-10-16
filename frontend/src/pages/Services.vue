<script setup lang="ts">
import IconSymbol from '../components/IconSymbol.vue'
import SiteMedia from '../components/SiteMedia.vue'
import { siteText, siteVisual, siteCssImage } from '../siteCms'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { services as baseServices, type ServiceKey } from '../content'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'

const { t, locale } = useI18n({ useScope: 'global' })
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
    title: siteText(`home.services.${key.toLowerCase()}.title`, t(`content.services.${key}.title`), locale.value),
    label: t(`content.services.${key}.label`),
    description: t(`content.services.${key}.description`),
    detail: siteText(`home.services.${key.toLowerCase()}.detail`, t(`content.services.${key}.detail`), locale.value)
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
          <h2 class="section-title centered">{{ $t('phrases.p009') }} <span>{{ $t('phrases.p010') }}</span></h2>
          <p class="section-desc centered">{{ $t('phrases.p011') }}</p>
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
            <article class="complementary-card"><SiteMedia slot-key="services.complementary.customs.media" fallback="/images/services-crane.webp" :alt="$t('phrases.p140')" /><div><span class="section-tag light-tag">{{ $t('phrases.p052') }}</span><h3>{{ siteText('services.complementary.customs.title', $t('phrases.p053'), locale) }}</h3><p>{{ siteText('services.complementary.customs.intro', $t('phrases.p054'), locale) }}</p><a href="/cotizaciones">{{ $t('phrases.p055') }}</a></div></article>
            <article class="complementary-card"><SiteMedia slot-key="services.complementary.warehouse.media" fallback="/images/warehouse-person.webp" :alt="$t('phrases.p141')" /><div><span class="section-tag light-tag">{{ $t('phrases.p056') }}</span><h3>{{ siteText('services.complementary.warehouse.title', $t('phrases.p057'), locale) }}</h3><p>{{ siteText('services.complementary.warehouse.intro', $t('phrases.p058'), locale) }}</p><a href="/cotizaciones">{{ $t('phrases.p059') }}</a></div></article>
          </div>
        </div>
      </section>

      <section class="section-spacing about-access services-page__digital">
        <div class="container">
          <p class="section-tag center">{{ $t('phrases.p060') }}</p>
          <h2 class="section-title centered">{{ $t('phrases.p061') }} <span>{{ $t('phrases.p062') }}</span></h2>
          <p class="section-desc centered">{{ $t('phrases.p063') }}</p>
          <div class="access-grid"><a class="access-card access-card--tracking" href="/tracking" :style="{ '--cms-access-tracking': siteCssImage('services.tracking.media', '/images/tracking-red.webp') }">
                <SiteMedia v-if="siteVisual('services.tracking.media', '/images/tracking-red.webp').kind.startsWith('Video')" slot-key="services.tracking.media" fallback="/images/tracking-red.webp" background /><IconSymbol glyph="→" /><strong>{{ $t('custom.home.trackingTitle') }}</strong><small>{{ $t('phrases.p064') }}</small></a><a class="access-card access-card--quote" href="/cotizaciones" :style="{ '--cms-access-quote': siteCssImage('services.quote.media', '/images/services-crane.webp') }">
                <SiteMedia v-if="siteVisual('services.quote.media', '/images/services-crane.webp').kind.startsWith('Video')" slot-key="services.quote.media" fallback="/images/services-crane.webp" background /><IconSymbol glyph="➜" /><strong>{{ $t('custom.home.quoteCardTitle') }}</strong><small>{{ $t('phrases.p065') }}</small></a></div>
        </div>
      </section>
    </main>
    <div v-if="modalService" class="service-modal-backdrop" @click.self="modalService = null">
      <section class="service-modal" role="dialog" aria-modal="true" :aria-label="serviceInfo[modalService].title" :style="{ '--modal-service-photo': `url('${modalPhoto}')` }">
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
