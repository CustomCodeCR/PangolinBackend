<script setup lang="ts">
import IconSymbol from '../components/IconSymbol.vue'
import SiteMedia from '../components/SiteMedia.vue'
import { siteText, siteVisual, siteCssImage } from '../siteCms'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { services as baseServices, type ServiceKey } from '../content'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import serviceFaqData from '../../seo/service-faqs.json'
import serviceGuides from '../../seo/service-landings.json'
import servicePages from '../../seo/service-pages.json'

const { t, locale } = useI18n({ useScope: 'global' })
// A formerly published FAQ can still be present in the CMS database.
 // Keep non-retired editorial customizations while suppressing the withdrawn offering.
const visibleFaqText=(key:string,fallback:string):string=>{
  const value=siteText(key,fallback,locale.value)
  return /bodegaje general|general warehousing/i.test(value) ? fallback : value
}
const serviceFaqs = computed(() => serviceFaqData.servicios.map((faq,i) => ({
  question: visibleFaqText('services.faq.' + i + '.q', locale.value.toLowerCase().startsWith('es') ? faq.question.es : faq.question.en),
  answer: visibleFaqText('services.faq.' + i + '.a', locale.value.toLowerCase().startsWith('es') ? faq.answer.es : faq.answer.en)
})))
const servicesFaqRef = ref<HTMLElement | null>(null)
const openServicesFaq = ref<number | null>(null)
const closeOtherServiceFaqs = (event: PointerEvent) => {
  if (openServicesFaq.value === null || !(event.target instanceof Node)) return
  const activeCard = servicesFaqRef.value?.querySelector<HTMLElement>(`[data-faq-index="${openServicesFaq.value}"]`)
  if (activeCard && !activeCard.contains(event.target)) openServicesFaq.value = null
}
const closeServiceFaqOnEscape = (event: KeyboardEvent) => {
  if (event.key === 'Escape') openServicesFaq.value = null
}
onMounted(() => {
  document.addEventListener('pointerdown', closeOtherServiceFaqs)
  document.addEventListener('keydown', closeServiceFaqOnEscape)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeOtherServiceFaqs)
  document.removeEventListener('keydown', closeServiceFaqOnEscape)
})
// Enlaces HTML visibles para que usuarios y rastreadores descubran las páginas
// comerciales. No dependen de abrir pestañas, modales ni ejecutar un clic.
const directoryGuideImages: Record<string, string> = {
  'almacenamiento-fiscal': '/images/services-warehouse.webp',
  'agenciamiento-aduanal': '/images/operation.webp',
  'consolidadora-de-carga': '/images/ship.webp'
}
const serviceDirectory = computed(() => {
  const lang: 'es' | 'en' = locale.value.toLowerCase().startsWith('es') ? 'es' : 'en'
  return [
    ...servicePages.map(item => ({
      href: '/servicios/' + item.slug, slug: item.slug, image: item.image,
      label: siteText('service.' + item.slug + '.title', item.title[lang], locale.value)
    })),
    ...Object.entries(serviceGuides).map(([href, guide]) => {
      const slug = href.split('/').pop() || ''
      const label = siteText('service.' + slug + '.label', guide[lang].label, locale.value)
      return { href, slug, image: directoryGuideImages[slug] || '/images/hero.webp',
        label: href === '/servicios/almacenamiento-fiscal' && lang === 'es'
          ? label.replace(/almacenamiento fiscal/gi, 'Almacén fiscal') : label }
    })
  ]
})
const serviceDirectoryGroups = computed(() => {
  const es = locale.value.toLowerCase().startsWith('es')
  return [
    {
      id: 'transport' as const,
      title: siteText('services.directory.transport.title', es ? 'Transporte de carga' : 'Freight transportation', locale.value),
      links: serviceDirectory.value.slice(0, servicePages.length)
    },
    {
      id: 'logistics' as const,
      title: siteText('services.directory.logistics.title', es ? 'Logística y aduanas' : 'Logistics and customs', locale.value),
      links: serviceDirectory.value.slice(servicePages.length)
    }
  ]
})
type DirectoryCategory = 'transport' | 'logistics'
const activeDirectoryCategory = ref<DirectoryCategory>('transport')
const changeDirectoryCategory = (category: DirectoryCategory, focus = false) => {
  activeDirectoryCategory.value = category
  if (focus) void nextTick(() => document.getElementById('services-directory-tab-' + category)?.focus())
}
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
        <div ref="servicesFaqRef" class="container services-faq__inner">
          <p class="section-tag center">{{ locale.toLowerCase().startsWith('es') ? 'PREGUNTAS FRECUENTES' : 'FREQUENTLY ASKED QUESTIONS' }}</p>
          <h2 id="services-faq-title" class="section-title centered">{{ siteText('services.faq.heading', locale.toLowerCase().startsWith('es') ? 'Más sobre nuestros servicios' : 'More about our services', locale) }}</h2>
          <div v-for="(faq, index) in serviceFaqs" :key="index"
            class="services-faq__item" :data-faq-index="index"
            :class="{ 'is-open': openServicesFaq === index }"
            @click="openServicesFaq = openServicesFaq === index ? null : index">
            <button type="button" class="services-faq__question"
              :aria-expanded="openServicesFaq === index"
              :aria-controls="`services-faq-answer-${index}`"
              @click.stop="openServicesFaq = openServicesFaq === index ? null : index">
              <span class="services-faq__arrow" aria-hidden="true">▸</span>
              <span>{{ faq.question }}</span>
            </button>
            <div :id="`services-faq-answer-${index}`" class="services-faq__panel"
              :class="{ 'is-open': openServicesFaq === index }"
              :aria-hidden="openServicesFaq !== index" :inert="openServicesFaq !== index">
              <div class="services-faq__panel-clip"><p>{{ faq.answer }}</p></div>
            </div>
          </div>
        </div>
      </section>

      <section class="section-spacing about-access services-page__digital">
        <div class="container">
          <p class="section-tag center">{{ $t('phrases.p060') }}</p>
          <h2 class="section-title centered">{{ siteText('services.access.heading1', $t('phrases.p061'), locale) }} <span>{{ siteText('services.access.heading2', $t('phrases.p062'), locale) }}</span></h2>
          <p class="section-desc centered">{{ siteText('services.access.intro', $t('phrases.p063'), locale) }}</p>
          <div class="access-grid"><a class="access-card access-card--tracking" href="/tracking" :style="{ '--cms-access-tracking': siteCssImage('services.tracking.media', '/images/tracking-red.webp') }">
                <SiteMedia v-if="siteVisual('services.tracking.media', '/images/tracking-red.webp').kind.startsWith('Video')" slot-key="services.tracking.media" fallback="/images/tracking-red.webp" background /><IconSymbol glyph="→" /><strong>{{ siteText('services.access.tracking', $t('custom.home.trackingTitle'), locale) }}</strong></a><a class="access-card access-card--quote" href="/cotizaciones" :style="{ '--cms-access-quote': siteCssImage('services.quote.media', '/images/services-crane.webp') }">
                <SiteMedia v-if="siteVisual('services.quote.media', '/images/services-crane.webp').kind.startsWith('Video')" slot-key="services.quote.media" fallback="/images/services-crane.webp" background /><IconSymbol glyph="➜" /><strong>{{ siteText('services.access.quote', $t('custom.home.quoteCardTitle'), locale) }}</strong></a></div>
        </div>
      </section>

      <section class="services-directory" aria-labelledby="services-directory-heading">
        <div class="container services-directory__container">
          <div class="services-directory__heading">
            <p class="section-tag center">{{ locale.toLowerCase().startsWith('es') ? 'EXPLORAR SERVICIOS' : 'EXPLORE SERVICES' }}</p>
            <h2 id="services-directory-heading" class="section-title centered">{{ siteText('services.directory.heading', locale.toLowerCase().startsWith('es') ? 'Conocé cada solución en detalle' : 'Explore each service in detail', locale) }}</h2>
            <p class="services-directory__intro">{{ siteText('services.directory.intro', locale.toLowerCase().startsWith('es') ? 'Todo lo que tu carga necesita, desde el primer movimiento hasta su destino.' : 'Everything your cargo needs, from its first move to its destination.', locale) }}</p>
          </div>
          <div class="services-directory__controls">
            <div class="services-directory__categories" role="tablist"
              :aria-label="locale.toLowerCase().startsWith('es') ? 'Categorías de servicios' : 'Service categories'">
              <button v-for="group in serviceDirectoryGroups" :id="'services-directory-tab-' + group.id"
                :key="group.id" type="button" role="tab"
                class="services-directory__category" :class="{ 'is-active': activeDirectoryCategory === group.id }"
                :aria-selected="activeDirectoryCategory === group.id"
                :aria-controls="'services-directory-panel-' + group.id"
                :tabindex="activeDirectoryCategory === group.id ? 0 : -1"
                @click="changeDirectoryCategory(group.id)"
                @keydown.left.prevent="changeDirectoryCategory(group.id === 'transport' ? 'logistics' : 'transport', true)"
                @keydown.right.prevent="changeDirectoryCategory(group.id === 'transport' ? 'logistics' : 'transport', true)"
                @keydown.home.prevent="changeDirectoryCategory('transport', true)"
                @keydown.end.prevent="changeDirectoryCategory('logistics', true)">
                <strong>{{ group.title }}</strong>
                <span>{{ String(group.links.length).padStart(2, '0') }} {{ locale.toLowerCase().startsWith('es') ? 'SERVICIOS' : 'SERVICES' }}</span>
              </button>
            </div>
          </div>
          <!-- A single visible carousel; keep both categories' real links in the DOM for crawlers.
               The second run closes the seamless loop and is skipped by keyboard/screen readers. -->
          <div class="services-directory__carousel">
            <section v-for="group in serviceDirectoryGroups" v-show="activeDirectoryCategory === group.id"
              :id="'services-directory-panel-' + group.id" :key="group.id"
              class="services-directory__panel" role="tabpanel"
              :aria-labelledby="'services-directory-tab-' + group.id">
              <div class="services-directory__track" :style="{ '--loop-duration': group.id === 'transport' ? '48s' : '34s' }">
                <div v-for="repeat in 2" :key="repeat" class="services-directory__run"
                  :class="{ 'is-clone': repeat === 2 }" :aria-hidden="repeat === 2 ? 'true' : undefined">
                  <a v-for="link in group.links" :key="link.href" :href="link.href"
                    class="services-directory__card" :tabindex="repeat === 2 ? -1 : undefined"
                    :aria-label="repeat === 2 ? undefined : link.label">
                    <span class="services-directory__card-media" aria-hidden="true">
                      <SiteMedia :slot-key="'services.directory.' + link.slug + '.media'"
                        :fallback="link.image" alt=""
                        sizes="(max-width: 620px) 60vw, (max-width: 1100px) 34vw, 360px" />
                    </span>
                    <strong class="services-directory__card-title">{{ link.label }}</strong>
                    <span class="services-directory__card-cta">
                      {{ locale.toLowerCase().startsWith('es') ? 'Ver más' : 'See more' }}
                      <span class="services-directory__card-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M7 17 17 7M8 7h9v9" /></svg></span>
                    </span>
                  </a>
                </div>
              </div>
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
/* Match the animated transport-service FAQs without changing the cards. */
.services-faq__item { cursor: pointer; }
.services-faq__question {
  display:flex;align-items:center;gap:10px;width:100%;padding:0;border:0;
  background:transparent;color:inherit;text-align:left;font:inherit;font-weight:800;cursor:pointer;
}
.services-faq__arrow { display:inline-block;flex:0 0 auto;transition:transform .28s ease; }
.services-faq__item.is-open .services-faq__arrow { transform:rotate(90deg); }
.services-faq__question:focus-visible { outline:2px solid #b20c2a;outline-offset:5px;border-radius:4px; }
.services-faq__panel {
  display:grid;grid-template-rows:0fr;opacity:0;visibility:hidden;
  transition:grid-template-rows .3s ease,opacity .25s ease,visibility .3s;
}
.services-faq__panel.is-open {
  grid-template-rows:1fr;opacity:1;visibility:visible;
  transition:grid-template-rows .3s ease,opacity .25s ease,visibility 0s;
}
.services-faq__panel-clip { min-height:0;overflow:hidden; }
@media(prefers-reduced-motion:reduce) {
  .services-faq__panel,.services-faq__panel.is-open,.services-faq__arrow { transition:none!important; }
}
/* Carrusel de servicios. Dos categorías comparten una sola superficie visual.
   Cada pista repite sus enlaces para un loop continuo sin parpadeos. */
.services-directory{position:relative;padding:clamp(54px,6vw,86px) 0 clamp(68px,7vw,100px);background:#fcf5f7;overflow-x:clip}
.services-directory__container{max-width:1260px}
.services-directory__heading{max-width:820px;margin:0 auto 38px;text-align:center}
.services-directory__heading .section-title{font-size:clamp(29px,3.3vw,44px);line-height:1.15;margin:9px 0 12px}
.services-directory__intro{max-width:600px;margin:0 auto;color:#68616a;font-size:14px;line-height:1.65}
.services-directory__controls{display:flex;align-items:center;justify-content:center;position:relative;gap:18px;margin:0 auto 25px}
.services-directory__categories{display:inline-flex;align-items:stretch;gap:6px;padding:6px;background:#fff;border:1px solid #e5ced4;border-radius:20px;box-shadow:0 5px 26px rgba(61,20,33,.06)}
.services-directory__category{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-width:220px;padding:15px 24px;border:1px solid transparent;border-radius:15px;background:transparent;color:#31303a;font:inherit;text-align:center;cursor:pointer;transition:background-color .2s,color .2s}
.services-directory__category strong{font-size:14px;line-height:1.25;font-weight:850}
.services-directory__category span{font-size:10px;letter-spacing:.1em;font-weight:800;opacity:.8}
.services-directory__category.is-active{background:#b20b2d;color:#fff}
.services-directory__category:not(.is-active):hover{background:#f9e7ec}
.services-directory__category:focus-visible{outline:3px solid #b20b2d;outline-offset:3px}
.services-directory__carousel{
 position:relative;left:50%;transform:translateX(-50%);
 width:100vw;max-width:100vw;overflow:hidden;
 padding:12px 0 22px;isolation:isolate;
 -webkit-mask-image:linear-gradient(to right,transparent 0,#000 52px,#000 calc(100% - 52px),transparent 100%);
 mask-image:linear-gradient(to right,transparent 0,#000 52px,#000 calc(100% - 52px),transparent 100%);
}
.services-directory__panel{width:100%;overflow:hidden}
.services-directory__track{display:flex;align-items:stretch;width:max-content;animation:services-directory-loop var(--loop-duration,45s) linear infinite;will-change:transform}
.services-directory__run{display:flex;align-items:stretch;gap:20px;flex:0 0 auto;padding-right:20px}
.services-directory__carousel:is(:hover,:focus-within) .services-directory__track{animation-play-state:paused}
@keyframes services-directory-loop{from{transform:translate3d(0,0,0)}to{transform:translate3d(-50%,0,0)}}
.services-directory__card{position:relative;isolation:isolate;display:block;flex:0 0 clamp(280px,26vw,365px);width:clamp(280px,26vw,365px);height:clamp(345px,33vw,415px);min-height:345px;overflow:hidden;border:1px solid rgba(255,255,255,.2);border-radius:25px;background:#142239;color:#fff;text-decoration:none;outline-offset:4px;box-shadow:none;transition:border-color .25s}
.services-directory__card::after{content:'';position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,rgba(5,13,27,.78),rgba(5,13,27,.15) 38%,rgba(5,13,27,.08) 62%,rgba(4,9,20,.64));pointer-events:none}
.services-directory__card-media{position:absolute;inset:0;z-index:0;display:block;overflow:hidden}
.services-directory__card-media :deep(img),.services-directory__card-media :deep(video){width:100%;height:100%;display:block;object-fit:cover;object-position:center;transition:transform .5s ease}
.services-directory__card:hover .services-directory__card-media :deep(img){transform:scale(1.045)}
.services-directory__card-title{position:absolute;z-index:2;top:26px;left:16px;right:16px;margin:0;color:#fff!important;-webkit-text-fill-color:#fff!important;text-align:center;text-wrap:balance;font-size:clamp(18px,1.65vw,23px);font-weight:900;line-height:1.26;text-shadow:0 2px 10px rgba(0,0,0,.65)}
.services-directory__card-cta{position:absolute;z-index:2;right:18px;bottom:20px;display:inline-flex;align-items:center;gap:16px;padding:7px 7px 7px 20px;border-radius:999px;background:#fff;color:#9a0825;font-size:13px;font-weight:850;line-height:1;box-shadow:0 3px 9px rgba(0,0,0,.12);transition:background-color .2s,color .2s}
.services-directory__card-arrow{display:grid;place-items:center;width:33px;height:33px;border-radius:50%;background:#b20b2d;color:#fff;transition:background-color .2s,color .2s}
.services-directory__card-arrow svg{display:block;margin:0;pointer-events:none}
.services-directory__card:is(:hover,:focus-visible){border-color:#f2a3b4;box-shadow:inset 0 0 0 2px rgba(242,163,180,.35)}
.services-directory__card:is(:hover,:focus-visible) .services-directory__card-cta{background:#b20b2d;color:#fff}
.services-directory__card:is(:hover,:focus-visible) .services-directory__card-arrow{background:#fff;color:#b20b2d}
.services-directory__card:focus-visible{outline:3px solid #b20b2d}
@media(max-width:980px){
 .services-directory__controls{justify-content:center}
 .services-directory__category{min-width:180px;padding:14px 15px}
}
@media(max-width:620px){
 .services-directory{padding:48px 0 66px}
 .services-directory__heading{margin-bottom:25px}
 .services-directory__controls{flex-wrap:wrap;justify-content:center;gap:12px;margin-bottom:16px}
 .services-directory__categories{width:100%;gap:4px;padding:4px}
 .services-directory__category{min-width:0;flex:1;padding:13px 9px}
 .services-directory__category strong{font-size:12px}
 .services-directory__category span{font-size:9px}
 .services-directory__run{gap:13px;padding-right:13px}
 .services-directory__card{flex-basis:min(59vw,230px);width:min(59vw,230px);height:clamp(270px,76vw,305px);min-height:270px;border-radius:19px}
 .services-directory__card-title{font-size:clamp(14px,3.9vw,17px);line-height:1.2;top:17px;left:11px;right:11px}
 .services-directory__card-cta{right:12px;bottom:12px;gap:8px;padding:5px 5px 5px 12px;font-size:11px}
 .services-directory__card-arrow{width:29px;height:29px}
 .services-directory__carousel{padding:7px 0 13px;-webkit-mask-image:linear-gradient(to right,transparent 0,#000 14px,#000 calc(100% - 14px),transparent 100%);mask-image:linear-gradient(to right,transparent 0,#000 14px,#000 calc(100% - 14px),transparent 100%)}
}
@media(prefers-reduced-motion:reduce){
 .services-directory__track{animation:none;transform:none;will-change:auto}
 .services-directory__panel{overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:thin}
 .services-directory__run.is-clone{display:none}
 .services-directory__card{scroll-snap-align:start;transition:none}
 .services-directory__card-media :deep(img){transition:none}
}
</style>
