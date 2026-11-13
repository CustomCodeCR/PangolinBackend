<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Target, Eye, Handshake, Scale, UsersRound, Award, ShieldCheck, Truck, ClipboardCheck, Globe2, Boxes, Ship, ChevronDown } from '@lucide/vue'
import IconSymbol from '../components/IconSymbol.vue'
import SiteMedia from '../components/SiteMedia.vue'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import { siteText, siteVisual, siteCssImage } from '../siteCms'

const { t, locale } = useI18n({ useScope: 'global' })
const values = computed(() => [0, 1, 2, 3, 4].map(index => siteText(`about.values.${index}`, t(`custom.about.values.${index}`), locale.value)))
const valueIcons = [Handshake, Scale, UsersRound, Award, ShieldCheck]
const capabilityIcons = [Truck, ClipboardCheck, Globe2, Boxes, Ship]
const openedValue = ref<number | null>(null)
const valuesAccordionRef = ref<HTMLElement | null>(null)
const closeValueOnOutsidePointer = (event: PointerEvent) => {
  if (openedValue.value === null || !(event.target instanceof Node)) return
  const openCard = valuesAccordionRef.value?.querySelector<HTMLElement>(`[data-value-index="${openedValue.value}"]`)
  if (openCard && !openCard.contains(event.target)) openedValue.value = null
}
const closeValueOnEscape = (event: KeyboardEvent) => {
  if (event.key === 'Escape') openedValue.value = null
}
onMounted(() => {
  document.addEventListener('pointerdown', closeValueOnOutsidePointer)
  document.addEventListener('keydown', closeValueOnEscape)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', closeValueOnOutsidePointer)
  document.removeEventListener('keydown', closeValueOnEscape)
})
// Pointer events distinguish desktop mouse hover from touch, including
// headless Chrome, where media queries for hover-capability are unreliable.
let lastPressedPointer: string | null = null
const onValuePointerEnter = (index: number, event: PointerEvent) => {
  if (event.pointerType === 'mouse') openedValue.value = index
}
const onValuePointerLeave = (index: number, event: PointerEvent) => {
  if (event.pointerType === 'mouse' && openedValue.value === index) openedValue.value = null
}
const onValuePointerDown = (event: PointerEvent) => {
  lastPressedPointer = event.pointerType
}
const toggleValue = (index: number, event: MouseEvent) => {
  // Mouse click keeps the hovered value open; touch and keyboard can toggle.
  if (event.detail > 0 && (lastPressedPointer === 'mouse' || (event as PointerEvent).pointerType === 'mouse')) {
    openedValue.value = index
  } else {
    openedValue.value = openedValue.value === index ? null : index
  }
  lastPressedPointer = null
}

// Proposed copy for review: mission and vision are not presented as officially approved statements.
const copy = computed(() => locale.value.startsWith('en') ? ({
  who: 'WHO WE ARE',
  heading: 'Castro Fallas International Logistics',
  description: 'We coordinate and supervise cargo transportation for import and export operations, nationally and internationally.',
  missionTag: 'OUR PURPOSE',
  mission: 'Mission',
  missionBody: 'To offer integrated, safe and efficient logistics solutions that support our clients’ domestic and international trade, with valuable and trustworthy service.',
  visionTag: 'OUR DIRECTION',
  vision: 'Vision',
  visionBody: 'To become a leading logistics solutions provider in the region, recognized for experience, reliability, innovation and commitment to excellent service.',
  culture: 'OUR CULTURE',
  valueLead: 'Principles that guide our daily work and strengthen the trust of our customers and partners.',
  historyAction: 'Discover our history',
  capabilitiesTitle: 'Our capabilities',
  capabilityNames: ['Logistics', 'Customs', 'International transport', 'Imports', 'Exports'],
  capabilityDetails: [
    'Coordinated solutions across the supply chain.',
    'Support with customs procedures and documentation.',
    'Cargo transportation across national and international routes.',
    'Coordination of incoming cargo operations.',
    'Support for exporting and moving cargo to other markets.'
  ],
  galleryAlts: ['Cargo storage in a logistics warehouse', 'Castro Fallas cargo truck and transport', 'Forklift and warehouse cargo handling'],
  valueDetails: [
    'We take ownership of every commitment and work toward dependable results.',
    'We act transparently and responsibly in every business relationship.',
    'Different perspectives and skills come together to serve our customers.',
    'Our experience helps us anticipate challenges and guide each operation.',
    'We pursue reliable processes and continuous improvement in our services.'
  ],
  servicesTag: 'WHAT WE DO',
  servicesTitle: 'Logistics solutions for every stage.',
  serviceAction: 'Explore our services',
  quoteAction: 'Request a quote',
  imageLabel: 'OPERATIONS IN COSTA RICA',
  purposeImage: 'LOGISTICS AND INTERNATIONAL TRADE'
}) : ({
  who: 'QUIÉNES SOMOS',
  heading: 'Castro Fallas Logística Internacional',
  description: 'Coordinamos y supervisamos el transporte de mercancías para operaciones de importación y exportación, a nivel nacional e internacional.',
  missionTag: 'NUESTRO PROPÓSITO',
  mission: 'Misión',
  missionBody: 'Brindar soluciones logísticas integrales, seguras y eficientes, que faciliten el comercio nacional e internacional de nuestros clientes, con un servicio de alto valor y confianza.',
  visionTag: 'HACIA DÓNDE VAMOS',
  vision: 'Visión',
  visionBody: 'Ser la empresa líder en soluciones logísticas en la región, reconocida por nuestra experiencia, confiabilidad, innovación y compromiso con la excelencia en el servicio.',
  culture: 'NUESTRA CULTURA',
  valueLead: 'Principios que guían nuestro trabajo diario y fortalecen la confianza de nuestros clientes, colaboradores y aliados estratégicos.',
  historyAction: 'Conocer nuestra historia',
  capabilitiesTitle: 'Nuestras capacidades',
  capabilityNames: ['Logística', 'Aduanas', 'Transporte internacional', 'Importación', 'Exportación'],
  capabilityDetails: [
    'Soluciones coordinadas para la cadena de suministro.',
    'Apoyo en trámites y documentación aduanera.',
    'Transporte de carga en rutas nacionales e internacionales.',
    'Coordinación de operaciones de ingreso de mercancías.',
    'Acompañamiento para enviar tu carga a otros mercados.'
  ],
  galleryAlts: ['Almacenamiento de mercancías en bodega logística', 'Camión de transporte de carga', 'Manejo de mercancías en bodega'],
  valueDetails: [
    'Asumimos nuestros compromisos con responsabilidad y orientación a resultados.',
    'Actuamos con transparencia y respeto en cada relación comercial.',
    'Sumamos conocimientos y capacidades para atender mejor cada operación.',
    'Nuestra trayectoria nos ayuda a anticipar desafíos y acompañar cada proceso.',
    'Buscamos procesos confiables y la mejora continua de nuestros servicios.'
  ],
  servicesTag: 'LO QUE HACEMOS',
  servicesTitle: 'Soluciones para cada etapa logística.',
  serviceAction: 'Conocer servicios',
  quoteAction: 'Solicitar cotización',
  imageLabel: 'OPERACIONES EN COSTA RICA',
  purposeImage: 'LOGÍSTICA Y COMERCIO INTERNACIONAL'
}))
</script>

<template>
  <div class="app-site about-reference-page about-refresh">
    <section class="inner-hero inner-hero--about about-refresh__hero" :style="{ '--cms-about-hero': siteCssImage('about.hero.media', '/images/about-operations-enhanced.jpg') }">
      <SiteMedia v-if="siteVisual('about.hero.media', '/images/about-operations-enhanced.jpg').kind.startsWith('Video')" slot-key="about.hero.media" fallback="/images/about-operations-enhanced.jpg" background />
      <SiteHeader active="nosotros" overlay />
      <div class="container inner-hero__copy about-hero__copy about-refresh__hero-copy">
        <h1>{{ siteText('about.hero.title', t('custom.about.title'), locale) }}</h1>
        <div class="big-years"><strong>+48</strong><span>{{ t('custom.about.years') }}</span></div>
      </div>
    </section>

    <main>
      <section class="about-refresh__intro section-spacing" id="quienes-somos">
        <div class="container about-refresh__intro-grid">
          <div class="about-refresh__intro-copy">
            <p class="about-refresh__eyebrow">{{ siteText('about.copy.who', copy.who, locale) }}</p>
            <h2>{{ siteText('about.copy.heading', copy.heading, locale) }}</h2>
            <p class="about-refresh__body">{{ siteText('about.intro', t('custom.about.introduction'), locale) }}</p>
            <a class="about-refresh__intro-link" href="#nuestra-historia">{{ siteText('about.copy.historyAction', copy.historyAction, locale) }} <IconSymbol glyph="↗" /></a>
          </div>
          <div class="about-refresh__photo about-image-card">
            <SiteMedia slot-key="about.operations.media" fallback="/images/about-operations-enhanced.jpg" :alt="copy.imageLabel" />
            <div class="image-stamp">{{ siteText('about.copy.imageLabel', copy.imageLabel, locale) }} <IconSymbol glyph="↗" /></div>
          </div>
        </div>
      </section>

      <section id="nuestra-historia" class="about-refresh__purpose section-spacing" :aria-label="locale.startsWith('en') ? 'Mission and vision' : 'Misión y visión'">
        <div class="container about-refresh__purpose-grid">
          <article class="about-refresh__purpose-card">
            <div class="about-refresh__purpose-symbol"><Target :size="30" :stroke-width="1.8" aria-hidden="true" /></div>
            <div class="about-refresh__purpose-content">
              <p class="about-refresh__eyebrow">{{ siteText('about.copy.missionTag', copy.missionTag, locale) }}</p>
              <h2>{{ siteText('about.copy.mission', copy.mission, locale) }}</h2>
              <p>{{ siteText('about.copy.missionBody', copy.missionBody, locale) }}</p>
            </div>
          </article>
          <article class="about-refresh__purpose-card">
            <div class="about-refresh__purpose-symbol"><Eye :size="30" :stroke-width="1.8" aria-hidden="true" /></div>
            <div class="about-refresh__purpose-content">
              <p class="about-refresh__eyebrow">{{ siteText('about.copy.visionTag', copy.visionTag, locale) }}</p>
              <h2>{{ siteText('about.copy.vision', copy.vision, locale) }}</h2>
              <p>{{ siteText('about.copy.visionBody', copy.visionBody, locale) }}</p>
            </div>
          </article>
        </div>
      </section>

      <section id="nuestros-valores" class="about-refresh__values section-spacing">
        <div class="container">
          <div class="about-refresh__section-heading">
            <div>
              <p class="about-refresh__eyebrow">{{ siteText('about.copy.culture', copy.culture, locale) }}</p>
              <h2>{{ siteText('about.values.heading', t('custom.about.valuesTitle'), locale) }}</h2>
            </div>
          </div>

          <div ref="valuesAccordionRef" class="about-refresh__accordion">
            <article v-for="(value, index) in values" :key="index" :data-value-index="index" class="about-refresh__value" :class="{ 'is-open': openedValue === index }" @pointerenter="onValuePointerEnter(index, $event)" @pointerleave="onValuePointerLeave(index, $event)" @pointerdown="onValuePointerDown($event)">
              <h3>
                <button type="button" class="about-refresh__value-trigger" :aria-expanded="openedValue === index" :aria-controls="`about-value-detail-${index}`" @click="toggleValue(index, $event)">
                  <span class="about-refresh__value-icon"><component :is="valueIcons[index]" :size="26" :stroke-width="1.8" aria-hidden="true" /></span>
                  <span class="about-refresh__value-text"><strong class="about-refresh__value-name">{{ value }}</strong></span>
                  <ChevronDown class="about-refresh__value-chevron" :size="22" :stroke-width="2" aria-hidden="true" />
                </button>
              </h3>
              <div :id="`about-value-detail-${index}`" class="about-refresh__value-panel" :class="{ 'is-open': openedValue === index }" :aria-hidden="openedValue !== index" :inert="openedValue !== index">
                <div class="about-refresh__value-inner">
                  <p>{{ siteText('about.valueDetails.' + index, copy.valueDetails[index], locale) }}</p>
                </div>
              </div>
            </article>
          </div>
          <div class="about-refresh__gallery">
            <SiteMedia slot-key="about.gallery.0.media" fallback="/images/services-warehouse.webp" :alt="copy.galleryAlts[0]" />
            <SiteMedia slot-key="about.gallery.1.media" fallback="/images/truck.webp" :alt="copy.galleryAlts[1]" />
            <SiteMedia slot-key="about.gallery.2.media" fallback="/images/warehouse-person.webp" :alt="copy.galleryAlts[2]" />
          </div>
        </div>
      </section>

      <section class="about-refresh__services section-spacing">
        <div class="container">
          <div class="about-refresh__section-heading">
            <div>
              <p class="about-refresh__eyebrow">{{ siteText('about.copy.servicesTag', copy.servicesTag, locale) }}</p>
              <h2>{{ siteText('about.copy.capabilitiesTitle', copy.capabilitiesTitle, locale) }}</h2>
            </div>
          </div>
          <div class="about-refresh__capabilities">
            <article v-for="(name, index) in copy.capabilityNames" :key="index" class="about-refresh__capability">
              <div class="about-refresh__capability-icon">
                <component :is="capabilityIcons[index]" :size="30" :stroke-width="1.7" aria-hidden="true" />
              </div>
              <h3>{{ siteText('about.capability.' + index + '.title', name, locale) }}</h3>
              <p>{{ siteText('about.capability.' + index + '.detail', copy.capabilityDetails[index], locale) }}</p>
            </article>
          </div>

          <div class="about-refresh__services-footer">
            <div class="about-refresh__actions">
              <a href="/servicios" class="about-refresh__button about-refresh__button--primary">{{ siteText('about.copy.serviceAction', copy.serviceAction, locale) }} <span aria-hidden="true">↗</span></a>
              <a href="/cotizaciones" class="about-refresh__button about-refresh__button--secondary">{{ siteText('about.copy.quoteAction', copy.quoteAction, locale) }} <span aria-hidden="true">↗</span></a>
            </div>
          </div>
        </div>
      </section>
    </main>
    <SiteFooter />
  </div>
</template>

<style scoped>
.about-refresh{--about-red:#b00929;--about-ink:#20242d;--about-muted:#545b67;--about-soft:#faf4f5;color:var(--about-ink)}
.about-refresh .about-refresh__hero{min-height:clamp(330px,34vw,490px)}
.about-refresh .about-refresh__hero-copy{padding-bottom:48px}
.about-refresh__intro{padding-block:clamp(82px,8.5vw,135px) clamp(52px,6vw,92px)}
.about-refresh__intro-grid{display:grid;grid-template-columns:minmax(0,.96fr) minmax(0,1.04fr);gap:clamp(42px,6vw,105px);align-items:center}
.about-refresh__eyebrow{margin:0 0 16px;color:var(--about-red);font-size:12px;font-weight:850;letter-spacing:.16em;line-height:1.4;text-transform:uppercase}
.about-refresh h2{margin:0;font-size:clamp(30px,3.2vw,46px);line-height:1.13;letter-spacing:-.042em;font-weight:850}
.about-refresh__intro-copy{max-width:590px}
.about-refresh__body{margin:26px 0 0;font-size:clamp(15px,1.25vw,17px);line-height:1.84}
.about-refresh__intro-link{display:inline-flex;align-items:center;justify-content:center;gap:17px;margin-top:32px;padding:14px 24px;background:var(--about-red);color:#fff;border-radius:999px;text-decoration:none;font-weight:750;font-size:14px;transition:transform .2s,background-color .2s}
.about-refresh__intro-link:hover{background:#8d0923;transform:translateY(-2px)}
.about-refresh .about-refresh__photo{height:clamp(300px,27vw,435px);border-radius:26px;box-shadow:0 24px 44px rgba(24,26,33,.08)}
.about-refresh__photo :deep(img),.about-refresh__photo video{width:100%;height:100%;object-fit:cover}
.about-refresh__purpose{padding-block:clamp(55px,6vw,95px) clamp(84px,9vw,140px)}
.about-refresh__purpose-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(24px,3.8vw,62px)}
.about-refresh__purpose-card{display:grid;grid-template-columns:76px minmax(0,1fr);gap:26px;align-items:start;min-height:220px;padding:clamp(30px,3.2vw,49px);background:linear-gradient(145deg,#fdf8f9,#f7eaed);border:1px solid rgba(160,36,64,.10);border-radius:26px}
.about-refresh__purpose-symbol{display:grid;place-items:center;width:68px;height:68px;color:var(--about-red);background:#f7dde3;border-radius:18px}
.about-refresh__purpose-content .about-refresh__eyebrow{margin:0 0 8px;font-size:11px}
.about-refresh__purpose-content h2{font-size:clamp(26px,2.8vw,36px)}
.about-refresh__purpose-content>p:last-child{margin:15px 0 0;font-size:clamp(15px,1.15vw,17px);line-height:1.75;color:var(--about-muted)}
.about-refresh__values{padding-block:clamp(86px,9vw,148px);background:var(--about-soft);scroll-margin-top:30px}
.about-refresh__section-heading{display:flex;align-items:end;justify-content:space-between;gap:40px;margin-bottom:clamp(30px,3.8vw,56px)}
.about-refresh__section-heading>p{max-width:370px;color:var(--about-muted);font-size:16px;line-height:1.7;margin:0}
.about-refresh__accordion{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(18px,2vw,30px);align-items:start}
.about-refresh__value{border:1px solid rgba(37,41,49,.15);border-bottom:3px solid #b40e2d;border-radius:20px;background:#fff;overflow:hidden;transition:box-shadow .25s,border-color .25s}
.about-refresh__value.is-open{border-color:rgba(176,9,41,.45);box-shadow:0 17px 32px rgba(38,30,33,.08)}
.about-refresh__value h3{margin:0}
.about-refresh__value-trigger{width:100%;display:flex;align-items:center;gap:14px;padding:22px 19px;min-height:106px;border:0;background:transparent;text-align:left;font:inherit;cursor:pointer;color:var(--about-ink)}
.about-refresh__value-trigger:focus-visible,.about-refresh__button:focus-visible,.about-refresh__intro-link:focus-visible{outline:3px solid #b00929;outline-offset:3px}
.about-refresh__value-icon{display:grid;place-items:center;flex:0 0 52px;width:52px;height:52px;border-radius:15px;background:#fae9ed;color:var(--about-red)}
.about-refresh__value-name{flex:1;min-width:0;font-size:clamp(15px,1.35vw,19px);font-weight:800;line-height:1.3}
.about-refresh__value-chevron{flex:none;transition:transform .25s}
.about-refresh__value.is-open .about-refresh__value-chevron{transform:rotate(180deg)}
.about-refresh__value-panel{display:grid;grid-template-rows:0fr;opacity:0;visibility:hidden;transition:grid-template-rows .28s,opacity .28s}
.about-refresh__value-panel.is-open{grid-template-rows:1fr;opacity:1;visibility:visible}
.about-refresh__value-inner{min-height:0;overflow:hidden}
.about-refresh__value-inner p{margin:0;padding:0 24px 25px;color:var(--about-muted);font-size:15px;line-height:1.7}
.about-refresh__services{padding-block:clamp(92px,10vw,160px)}
.about-refresh__capabilities{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(18px,2.3vw,36px)}
.about-refresh__capability{padding:29px 27px 34px;border:1px solid rgba(37,41,49,.13);border-radius:22px;background:#fff;min-height:220px;transition:transform .2s,box-shadow .2s}
.about-refresh__capability:hover{transform:translateY(-4px);box-shadow:0 16px 30px rgba(35,39,45,.07)}
.about-refresh__capability-icon{color:var(--about-red);margin-bottom:23px}
.about-refresh__capability h3{margin:0 0 10px;font-size:19px;line-height:1.25;letter-spacing:-.02em}
.about-refresh__capability p{margin:0;max-width:310px;color:var(--about-muted);line-height:1.66;font-size:15px}
.about-refresh__gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin-top:clamp(46px,5vw,76px)}
.about-refresh__gallery :deep(img),.about-refresh__gallery video{display:block;width:100%;height:clamp(210px,18vw,315px);object-fit:cover;border-radius:21px}
.about-refresh__services-footer{display:flex;align-items:center;justify-content:space-between;gap:38px;margin-top:38px;padding-top:32px;border-top:1px solid rgba(36,40,49,.15)}
.about-refresh__services-footer>p{margin:0;max-width:530px;color:var(--about-muted);line-height:1.68;font-size:16px}
.about-refresh__actions{display:flex;flex-wrap:wrap;gap:14px}
.about-refresh__button{display:inline-flex;align-items:center;justify-content:center;gap:14px;padding:14px 19px;min-height:48px;border-radius:999px;font-size:14px;font-weight:800;text-decoration:none;transition:transform .2s}
.about-refresh__button:hover{transform:translateY(-2px)}
.about-refresh__button--primary{background:var(--about-red);color:#fff}
.about-refresh__button--secondary{border:1px solid var(--about-red);color:var(--about-red)}
@media(max-width:1080px){
  .about-refresh__purpose-grid{gap:22px}
  .about-refresh__purpose-card{grid-template-columns:55px 1fr;gap:18px;padding:28px}
  .about-refresh__purpose-symbol{width:54px;height:54px}
  .about-refresh__accordion,.about-refresh__capabilities{grid-template-columns:repeat(2,minmax(0,1fr))}
  .about-refresh__services-footer{align-items:flex-start;flex-direction:column}
}
@media(max-width:780px){
  .about-refresh__intro-grid,.about-refresh__purpose-grid{grid-template-columns:1fr}
  .about-refresh__intro-grid{gap:35px}
  .about-refresh .about-refresh__photo{height:320px}
  .about-refresh__section-heading{align-items:start;flex-direction:column;gap:18px}
  .about-refresh__gallery{gap:12px}
}
@media(max-width:580px){
  .about-refresh__intro{padding-block:65px 48px}
  .about-refresh .about-refresh__photo{height:250px}
  .about-refresh__purpose{padding-block:48px 88px}
  .about-refresh__purpose-card{min-height:0}
  .about-refresh__values{padding-block:85px}
  .about-refresh__accordion,.about-refresh__capabilities{grid-template-columns:1fr}
  .about-refresh__value-trigger{min-height:85px;padding:17px 18px}
  .about-refresh__gallery{grid-template-columns:1fr;gap:17px}
  .about-refresh__gallery :deep(img),.about-refresh__gallery video{height:225px}
  .about-refresh__services{padding-block:90px}
}
@media(prefers-reduced-motion:reduce){.about-refresh__value,.about-refresh__value-panel,.about-refresh__value-chevron,.about-refresh__capability,.about-refresh__button,.about-refresh__intro-link{transition:none}}
html.theme-dark .about-refresh{--about-ink:#f6f7fb;--about-muted:#cdd2dc;--about-soft:#0b1228}
html.theme-dark .about-refresh__purpose-card{background:linear-gradient(135deg,#16213b,#20213b);border-color:rgba(255,255,255,.19)}
html.theme-dark .about-refresh__purpose-symbol,html.theme-dark .about-refresh__value-icon{background:#41223c;color:#ff849a}
html.theme-dark .about-refresh__value,html.theme-dark .about-refresh__capability{background:#111b31;border-color:rgba(255,255,255,.23)}
html.theme-dark .about-refresh__value.is-open{border-color:#f07189}
html.theme-dark .about-refresh__value-trigger{color:#fff}
html.theme-dark .about-refresh__services-footer{border-top-color:rgba(255,255,255,.25)}
html.theme-dark .about-refresh__button--secondary{color:#fff}

/* Reference-led layout: preserve the corporate visual language without overcrowding. */
.about-refresh .inner-hero--about{
  min-height:clamp(335px,30vw,465px);
  height:auto;
}
.about-refresh .about-refresh__hero-copy{padding-top:clamp(110px,10vw,142px);padding-bottom:46px}
.about-refresh .about-refresh__hero-copy h1{font-size:clamp(42px,4.7vw,70px);line-height:1.04;letter-spacing:-.035em}
.about-refresh .about-refresh__hero-copy .big-years{
  display:flex;flex-direction:row;align-items:center;gap:clamp(16px,2vw,34px);margin-top:8px;
}
.about-refresh .about-refresh__hero-copy .big-years strong{font-size:clamp(96px,10vw,155px);letter-spacing:-.085em;line-height:.94}
.about-refresh .about-refresh__hero-copy .big-years span{
  max-width:240px;padding-left:clamp(14px,1.8vw,27px);border-left:2px solid rgba(255,255,255,.72);
  font-size:clamp(19px,2.1vw,30px);line-height:1.08;letter-spacing:-.04em
}
.about-refresh__hero-subtitle{margin:18px 0 0;color:#fff;font-size:clamp(13px,1.05vw,16px);line-height:1.55;font-weight:550}
.about-refresh__intro{padding-block:clamp(68px,6vw,100px) clamp(28px,3vw,55px)}
.about-refresh__intro-grid{gap:clamp(38px,5vw,88px)}
.about-refresh .about-refresh__photo{height:clamp(260px,23vw,365px)}
.about-refresh__intro-copy h2{font-size:clamp(30px,3vw,45px)}
.about-refresh__body{
  padding-left:20px;border-left:3px solid rgba(176,9,41,.76);line-height:1.68;
  margin-top:22px
}
.about-refresh__intro-link{margin-top:24px}
.about-refresh__purpose{padding-block:clamp(36px,4vw,64px) clamp(68px,7vw,108px);scroll-margin-top:50px}
.about-refresh__purpose-grid{gap:clamp(22px,2.6vw,44px)}
.about-refresh__purpose-card{
  min-height:162px;grid-template-columns:72px minmax(0,1fr);align-items:center;gap:clamp(18px,2.4vw,38px);
  padding:clamp(23px,2.5vw,39px);background:linear-gradient(135deg,#fcf5f7,#f8ecef);
  border-radius:22px;box-shadow:0 10px 26px rgba(45,25,31,.035)
}
.about-refresh__purpose-symbol{background:var(--about-red);color:#fff;width:68px;height:68px;border-radius:16px}
.about-refresh__purpose-content h2{font-size:clamp(26px,2.6vw,36px)}
.about-refresh__purpose-content .about-refresh__eyebrow{display:none}
.about-refresh__purpose-content>p:last-child{margin-top:9px;line-height:1.62;font-size:clamp(14px,1.1vw,16px)}
.about-refresh__values{padding-block:clamp(76px,7.6vw,125px)}
.about-refresh__section-heading{margin-bottom:clamp(27px,3vw,46px)}
.about-refresh__accordion{grid-template-columns:repeat(5,minmax(0,1fr));gap:clamp(13px,1.2vw,22px)}
.about-refresh__value{
  border-radius:16px;min-width:0;
  border-color:rgba(35,39,47,.17);border-bottom:3px solid var(--about-red)
}
.about-refresh__value-trigger{
  display:grid;grid-template-columns:50px minmax(0,1fr);align-items:start;gap:15px;position:relative;
  min-height:154px;padding:19px 17px 21px
}
.about-refresh__value-icon{flex:none;width:50px;height:50px;border-radius:13px}
.about-refresh__value-text{display:flex;flex-direction:column;align-items:start;gap:8px;min-width:0;padding-top:3px;padding-right:7px}
.about-refresh__value-name{font-size:clamp(14px,1.04vw,17px);line-height:1.27}
.about-refresh__value-summary{font-size:clamp(12px,.91vw,14px);font-weight:450;line-height:1.52;color:var(--about-muted)}
.about-refresh__value-chevron{position:absolute;right:12px;bottom:12px;width:17px;height:17px}
.about-refresh__value-inner p{padding:0 19px 26px;line-height:1.62;font-size:14px}
.about-refresh__services{padding-block:clamp(84px,9vw,143px)}
.about-refresh__capabilities{
  display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0;
  border-top:1px solid rgba(35,39,47,.12);border-bottom:1px solid rgba(35,39,47,.12)
}
.about-refresh__capability{
  min-width:0;min-height:0;text-align:center;padding:36px 22px 35px;border:0;
  border-right:1px solid rgba(35,39,47,.16);border-radius:0;box-shadow:none
}
.about-refresh__capability:last-child{border-right:0}
.about-refresh__capability:hover{transform:none;box-shadow:none;background:rgba(176,9,41,.045)}
.about-refresh__capability-icon{margin-bottom:14px}
.about-refresh__capability-icon :deep(svg){width:36px;height:36px}
.about-refresh__capability h3{font-size:clamp(15px,1.25vw,19px);line-height:1.25}
.about-refresh__capability p{margin:12px auto 0;font-size:clamp(12px,.95vw,15px);line-height:1.6}
.about-refresh__gallery{gap:clamp(16px,2vw,31px);margin-top:clamp(39px,5vw,70px)}
.about-refresh__gallery :deep(img),.about-refresh__gallery video{height:clamp(200px,19vw,300px);border-radius:19px}
.about-refresh__services-footer{margin-top:clamp(34px,4vw,55px)}
html.theme-dark .about-refresh__value-summary{color:#cdd2dc}
html.theme-dark .about-refresh__purpose-symbol{background:#aa1736;color:#fff}
html.theme-dark .about-refresh__capabilities{border-color:rgba(255,255,255,.21)}
html.theme-dark .about-refresh__capability{border-right-color:rgba(255,255,255,.21)}
html.theme-dark .about-refresh__capability:hover{background:rgba(255,255,255,.05)}
@media(max-width:1320px){
  .about-refresh__accordion{grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
  .about-refresh__value-trigger{min-height:128px}
  .about-refresh__capabilities{grid-template-columns:repeat(3,minmax(0,1fr));border-bottom:0}
  .about-refresh__capability{border-bottom:1px solid rgba(35,39,47,.16)}
  .about-refresh__capability:nth-child(3){border-right:0}
  .about-refresh__capability:last-child{border-right:1px solid rgba(35,39,47,.16)}
}
@media(max-width:950px){
  .about-refresh__accordion,.about-refresh__capabilities{grid-template-columns:repeat(2,minmax(0,1fr))}
  .about-refresh__capability:nth-child(3){border-right:1px solid rgba(35,39,47,.16)}
  .about-refresh__capability:nth-child(2n){border-right:0}
  .about-refresh__capability:last-child{border-right:1px solid rgba(35,39,47,.16)}
  .about-refresh__purpose-card{grid-template-columns:62px 1fr}
  .about-refresh__purpose-symbol{width:60px;height:60px}
}
@media(max-width:580px){
  .about-refresh .about-refresh__hero-copy{padding-top:102px;padding-bottom:31px}
  .about-refresh .about-refresh__hero-copy h1{font-size:clamp(35px,9vw,44px)}
  .about-refresh .about-refresh__hero-copy .big-years strong{font-size:clamp(75px,23vw,110px)}
  .about-refresh .about-refresh__hero-copy .big-years span{font-size:clamp(15px,4vw,20px)}
  .about-refresh__hero-subtitle{font-size:12px}
  .about-refresh__intro{padding-block:64px 28px}
  .about-refresh__purpose{padding-block:40px 75px}
  .about-refresh__purpose-card{min-height:0;padding:21px;grid-template-columns:48px 1fr;gap:15px}
  .about-refresh__purpose-symbol{width:47px;height:47px;border-radius:12px}
  .about-refresh__purpose-symbol :deep(svg){width:24px;height:24px}
  .about-refresh__accordion,.about-refresh__capabilities{grid-template-columns:1fr}
  .about-refresh__value-trigger{min-height:105px}
  .about-refresh__capability{border-right:0!important}
  .about-refresh__gallery :deep(img),.about-refresh__gallery video{height:225px}
}

/* Compact spacing and value cards: hover for fine pointers, taps on touch. */
.about-refresh__purpose{padding-bottom:clamp(30px,3.8vw,55px)}
.about-refresh__values{padding-top:clamp(40px,4.8vw,72px);padding-bottom:clamp(55px,6.5vw,96px)}
.about-refresh__services{padding-top:clamp(54px,6.5vw,94px)}
.about-refresh__section-heading{margin-bottom:clamp(26px,2.8vw,40px)}
.about-refresh__value-trigger{
  display:flex;align-items:center;gap:13px;min-height:92px;
  padding:19px 18px 22px
}
.about-refresh__value-text{display:block;min-width:0;padding:0 12px 0 0}
.about-refresh__value-name{display:block;font-size:clamp(15px,1.12vw,18px);line-height:1.3}
.about-refresh__value-chevron{bottom:13px;right:13px}
.about-refresh__value.is-open{box-shadow:0 12px 26px rgba(55,26,37,.10)}
.about-refresh__value.is-open .about-refresh__value-icon{background:#f4dae1}
.about-refresh__value-inner p{padding:5px 20px 25px;font-size:14px;line-height:1.65}
.about-refresh__capabilities{
  gap:clamp(13px,1.7vw,26px);
  border:0
}
.about-refresh__capability,
.about-refresh__capability:last-child{
  border:1px solid rgba(35,39,47,.13);border-bottom:2px solid rgba(176,9,41,.26);
  background:rgba(255,255,255,.95);
  border-radius:18px;box-shadow:0 8px 24px rgba(39,29,35,.055);
  padding:30px 17px 34px;min-height:190px;
  transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease
}
.about-refresh__capability:hover{transform:translateY(-3px);box-shadow:0 13px 29px rgba(39,29,35,.10);border-color:rgba(176,9,41,.32);background:#fff}
html.theme-dark .about-refresh__capability,
html.theme-dark .about-refresh__capability:last-child{background:#111b31;border-color:rgba(255,255,255,.20)}
html.theme-dark .about-refresh__capability:hover{background:#111b31;border-color:rgba(255,255,255,.20)}
@media(max-width:1320px){
  .about-refresh__value-trigger{min-height:86px}
  .about-refresh__capability,.about-refresh__capability:last-child{border:1px solid rgba(35,39,47,.13);border-bottom:2px solid rgba(176,9,41,.26)}
}
@media(max-width:950px){
  .about-refresh__value-trigger{min-height:88px}
  .about-refresh__value-name{font-size:17px}
  .about-refresh__capability,.about-refresh__capability:last-child{border:1px solid rgba(35,39,47,.13);border-bottom:2px solid rgba(176,9,41,.26)}
}
@media(max-width:580px){
  .about-refresh__purpose{padding-bottom:28px}
  .about-refresh__values{padding:42px 0 64px}
  .about-refresh__services{padding-top:58px}
  .about-refresh__accordion{gap:14px}
  .about-refresh__value-trigger{min-height:78px;padding:13px 19px 17px;gap:16px}
  .about-refresh__value-icon{width:46px;height:46px;flex-basis:46px}
  .about-refresh__value-name{font-size:17px}
  .about-refresh__value-inner p{padding:2px 21px 23px 81px}
  .about-refresh__capabilities{gap:15px}
  .about-refresh__capability,.about-refresh__capability:last-child{min-height:0;padding:26px 20px 30px;border-radius:17px}
}
@media(prefers-reduced-motion:reduce){
  .about-refresh__value,.about-refresh__value-panel,.about-refresh__value-chevron,.about-refresh__capability{transition:none!important}
}

/* Final spacing pass: remove excessive blank bands between page sections. */
.about-refresh__intro{padding-bottom:clamp(12px,1.5vw,24px)}
.about-refresh__purpose{
  padding-top:clamp(22px,2.5vw,36px);
  padding-bottom:clamp(14px,2vw,29px)
}
.about-refresh__values{
  padding-top:clamp(28px,3.3vw,47px);
  padding-bottom:clamp(29px,3.5vw,53px)
}
.about-refresh__services{
  padding-top:clamp(25px,3.6vw,54px);
  padding-bottom:clamp(55px,6vw,86px)
}
.about-refresh__gallery{margin-top:clamp(25px,3.2vw,44px)}
.about-refresh__services-footer{
  justify-content:flex-end;align-items:center;
  margin-top:clamp(19px,2vw,31px);padding-top:clamp(18px,2vw,28px)
}
/* Mission and vision use the exact same card surface as the value cards. */
.about-refresh__purpose-card{background:#fff;border-color:rgba(35,39,47,.15)}
html.theme-dark .about-refresh__purpose-card{
  background:#111b31;border-color:rgba(255,255,255,.23)
}
/* Center the chevron within the card's heading, rather than below the name. */
.about-refresh__value-trigger{
  display:flex;align-items:center;gap:clamp(9px,.9vw,14px);
  min-height:82px;padding:14px 16px
}
.about-refresh__value-text{flex:1;min-width:0;padding:0}
.about-refresh__value-chevron{
  position:static;right:auto;bottom:auto;
  flex:0 0 20px;width:20px;height:20px;
  align-self:center;margin-left:auto
}
/* Open icon: corporate red with a high-contrast white glyph in both modes. */
.about-refresh__value.is-open .about-refresh__value-icon,
html.theme-dark .about-refresh__value.is-open .about-refresh__value-icon{
  background:#b00929;color:#fff
}
@media(max-width:950px){
  .about-refresh__value-trigger{min-height:79px;padding:13px 16px}
}
@media(max-width:580px){
  .about-refresh__intro{padding-bottom:12px}
  .about-refresh__purpose{padding-top:18px;padding-bottom:15px}
  .about-refresh__values{padding:29px 0 40px}
  .about-refresh__services{padding-top:27px;padding-bottom:55px}
  .about-refresh__value-trigger{min-height:76px;padding:12px 16px}
  .about-refresh__services-footer{justify-content:center}
  .about-refresh__actions{justify-content:center}
}

/* Allow the gallery to sit a little lower below the cards without
   introducing extra empty space before the next section. */
.about-refresh__values .about-refresh__gallery{margin-top:clamp(52px,5vw,74px)}
.about-refresh__values .about-refresh__gallery :deep(img),.about-refresh__gallery video{object-fit:cover}
.about-refresh__values{padding-bottom:clamp(8px,1.5vw,23px)}
@media(max-width:580px){
  .about-refresh__values .about-refresh__gallery{margin-top:34px}
  .about-refresh__values{padding-bottom:28px}
}
/* Center incomplete card rows without changing the original card sizes.
   Desktop retains its five-column grid; three/two-column breakpoints wrap
   with equal-sized cards, and the mobile one-column layout is unchanged. */
@media (min-width:581px) and (max-width:1320px) {
  .about-refresh__accordion,
  .about-refresh__capabilities {
    display:flex;
    flex-wrap:wrap;
    justify-content:center;
    align-items:flex-start;
  }
  .about-refresh__accordion > .about-refresh__value {
    box-sizing:border-box;
    flex:0 0 calc((100% - 40px) / 3);
  }
  .about-refresh__capabilities > .about-refresh__capability {
    box-sizing:border-box;
    flex:0 0 calc((100% - 2 * clamp(13px,1.7vw,26px)) / 3);
  }
}
@media (min-width:581px) and (max-width:950px) {
  .about-refresh__accordion > .about-refresh__value {
    flex-basis:calc((100% - 20px) / 2);
  }
  .about-refresh__capabilities > .about-refresh__capability {
    flex-basis:calc((100% - clamp(13px,1.7vw,26px)) / 2);
  }
}

/* Keep the experience divider fully white in dark mode. */
html.theme-dark .about-refresh .about-refresh__hero-copy .big-years span {
  border-left-color: #fff !important;
}
</style>
