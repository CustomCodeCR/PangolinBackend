<script setup lang="ts">
import { computed, ref } from 'vue'
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
const toggleValue = (index: number) => {
  openedValue.value = openedValue.value === index ? null : index
}

// Proposed copy for review: mission and vision are not presented as officially approved statements.
const copy = computed(() => locale.value.startsWith('en') ? ({
  who: 'WHO WE ARE',
  heading: 'Castro Fallas International Logistics',
  description: 'We coordinate and supervise cargo transportation for import and export operations, nationally and internationally.',
  missionTag: 'OUR PURPOSE',
  mission: 'Mission',
  missionBody: 'To accompany each logistics operation with coordination, responsibility and solutions adapted to our customers’ needs.',
  visionTag: 'OUR DIRECTION',
  vision: 'Vision',
  visionBody: 'To continue building trusted logistics connections through experience, quality and close customer service.',
  culture: 'OUR CULTURE',
  valueLead: 'Explore the principles behind our work.',
  historyAction: 'Discover our values',
  capabilitiesTitle: 'Our capabilities',
  capabilitiesSubtitle: 'We coordinate every step of your cargo journey.',
  capabilityNames: ['Logistics', 'Customs', 'International transport', 'Imports', 'Exports'],
  capabilityDetails: [
    'Coordinated solutions across the supply chain.',
    'Support with customs procedures and documentation.',
    'Cargo transportation across national and international routes.',
    'Coordination of incoming cargo operations.',
    'Support for exporting and moving cargo to other markets.'
  ],
  galleryAlts: ['Cargo storage in a logistics warehouse', 'Freight operation and cargo coordination', 'International maritime transportation'],
  valueDetails: [
    'We take ownership of every commitment and work toward dependable results.',
    'We act transparently and responsibly in every business relationship.',
    'Different perspectives and skills come together to serve our customers.',
    'Our experience helps us anticipate challenges and guide each operation.',
    'We pursue reliable processes and continuous improvement in our services.'
  ],
  discover: 'Tap a value to learn more',
  servicesTag: 'WHAT WE DO',
  servicesTitle: 'Logistics solutions for every stage.',
  servicesBody: 'From freight transportation to import and export coordination, we help businesses move their cargo with confidence.',
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
  missionBody: 'Acompañar cada operación logística con coordinación, responsabilidad y soluciones ajustadas a las necesidades de nuestros clientes.',
  visionTag: 'HACIA DÓNDE VAMOS',
  vision: 'Visión',
  visionBody: 'Seguir construyendo conexiones logísticas de confianza mediante experiencia, calidad y una atención cercana.',
  culture: 'NUESTRA CULTURA',
  valueLead: 'Descubrí los principios que orientan nuestro trabajo.',
  historyAction: 'Conocer nuestros valores',
  capabilitiesTitle: 'Nuestras capacidades',
  capabilitiesSubtitle: 'Coordinamos cada etapa del movimiento de tu carga.',
  capabilityNames: ['Logística', 'Aduanas', 'Transporte internacional', 'Importación', 'Exportación'],
  capabilityDetails: [
    'Soluciones coordinadas para la cadena de suministro.',
    'Apoyo en trámites y documentación aduanera.',
    'Transporte de carga en rutas nacionales e internacionales.',
    'Coordinación de operaciones de ingreso de mercancías.',
    'Acompañamiento para enviar tu carga a otros mercados.'
  ],
  galleryAlts: ['Almacenamiento de mercancías en bodega logística', 'Operación y coordinación de carga', 'Transporte marítimo internacional'],
  valueDetails: [
    'Asumimos nuestros compromisos con responsabilidad y orientación a resultados.',
    'Actuamos con transparencia y respeto en cada relación comercial.',
    'Sumamos conocimientos y capacidades para atender mejor cada operación.',
    'Nuestra trayectoria nos ayuda a anticipar desafíos y acompañar cada proceso.',
    'Buscamos procesos confiables y la mejora continua de nuestros servicios.'
  ],
  discover: 'Tocá un valor para conocer más',
  servicesTag: 'LO QUE HACEMOS',
  servicesTitle: 'Soluciones para cada etapa logística.',
  servicesBody: 'Desde el transporte de carga hasta la coordinación de importaciones y exportaciones, acompañamos a las empresas en cada movimiento.',
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
            <p class="about-refresh__eyebrow">{{ copy.who }}</p>
            <h2>{{ copy.heading }}</h2>
            <p class="about-refresh__body">{{ siteText('about.intro', t('custom.about.introduction'), locale) }}</p>
            <a class="about-refresh__intro-link" href="#nuestros-valores">{{ copy.historyAction }} <IconSymbol glyph="↗" /></a>
          </div>
          <div class="about-refresh__photo about-image-card">
            <SiteMedia slot-key="about.operations.media" fallback="/images/about-operations-enhanced.jpg" :alt="copy.imageLabel" />
            <div class="image-stamp">{{ copy.imageLabel }} <IconSymbol glyph="↗" /></div>
          </div>
        </div>
      </section>

      <section class="about-refresh__purpose section-spacing" :aria-label="locale.startsWith('en') ? 'Mission and vision' : 'Misión y visión'">
        <div class="container about-refresh__purpose-grid">
          <article class="about-refresh__purpose-card">
            <div class="about-refresh__purpose-symbol"><Target :size="30" :stroke-width="1.8" aria-hidden="true" /></div>
            <div class="about-refresh__purpose-content">
              <p class="about-refresh__eyebrow">{{ copy.missionTag }}</p>
              <h2>{{ copy.mission }}</h2>
              <p>{{ copy.missionBody }}</p>
            </div>
          </article>
          <article class="about-refresh__purpose-card">
            <div class="about-refresh__purpose-symbol"><Eye :size="30" :stroke-width="1.8" aria-hidden="true" /></div>
            <div class="about-refresh__purpose-content">
              <p class="about-refresh__eyebrow">{{ copy.visionTag }}</p>
              <h2>{{ copy.vision }}</h2>
              <p>{{ copy.visionBody }}</p>
            </div>
          </article>
        </div>
      </section>

      <section id="nuestros-valores" class="about-refresh__values section-spacing">
        <div class="container">
          <div class="about-refresh__section-heading">
            <div>
              <p class="about-refresh__eyebrow">{{ copy.culture }}</p>
              <h2>{{ siteText('about.values.heading', t('custom.about.valuesTitle'), locale) }}</h2>
            </div>
            <p>{{ copy.valueLead }}</p>
          </div>

          <div class="about-refresh__accordion">
            <article v-for="(value, index) in values" :key="index" class="about-refresh__value" :class="{ 'is-open': openedValue === index }">
              <h3>
                <button type="button" class="about-refresh__value-trigger" :aria-expanded="openedValue === index" :aria-controls="`about-value-detail-${index}`" @click="toggleValue(index)">
                  <span class="about-refresh__value-icon"><component :is="valueIcons[index]" :size="26" :stroke-width="1.8" aria-hidden="true" /></span>
                  <span class="about-refresh__value-name">{{ value }}</span>
                  <ChevronDown class="about-refresh__value-chevron" :size="22" :stroke-width="2" aria-hidden="true" />
                </button>
              </h3>
              <div :id="`about-value-detail-${index}`" class="about-refresh__value-panel" :class="{ 'is-open': openedValue === index }" :aria-hidden="openedValue !== index" :inert="openedValue !== index">
                <div class="about-refresh__value-inner">
                  <p>{{ copy.valueDetails[index] }}</p>
                </div>
              </div>
            </article>
          </div>
          <p class="about-refresh__hint">{{ copy.discover }}</p>
        </div>
      </section>

      <section class="about-refresh__services section-spacing">
        <div class="container">
          <div class="about-refresh__section-heading">
            <div>
              <p class="about-refresh__eyebrow">{{ copy.servicesTag }}</p>
              <h2>{{ copy.capabilitiesTitle }}</h2>
            </div>
            <p>{{ copy.capabilitiesSubtitle }}</p>
          </div>
          <div class="about-refresh__capabilities">
            <article v-for="(name, index) in copy.capabilityNames" :key="index" class="about-refresh__capability">
              <div class="about-refresh__capability-icon">
                <component :is="capabilityIcons[index]" :size="30" :stroke-width="1.7" aria-hidden="true" />
              </div>
              <h3>{{ name }}</h3>
              <p>{{ copy.capabilityDetails[index] }}</p>
            </article>
          </div>

          <div class="about-refresh__gallery">
            <img src="/images/services-warehouse.webp" :alt="copy.galleryAlts[0]" loading="lazy" />
            <img src="/images/operation.webp" :alt="copy.galleryAlts[1]" loading="lazy" />
            <img src="/images/ship.webp" :alt="copy.galleryAlts[2]" loading="lazy" />
          </div>
          <div class="about-refresh__services-footer">
            <p>{{ copy.servicesBody }}</p>
            <div class="about-refresh__actions">
              <RouterLink to="/servicios" class="about-refresh__button about-refresh__button--primary">{{ copy.serviceAction }} <span aria-hidden="true">↗</span></RouterLink>
              <RouterLink to="/cotizaciones" class="about-refresh__button about-refresh__button--secondary">{{ copy.quoteAction }} <span aria-hidden="true">↗</span></RouterLink>
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
.about-refresh__photo img,.about-refresh__photo video{width:100%;height:100%;object-fit:cover}
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
.about-refresh__hint{margin:28px 0 0;color:var(--about-muted);font-size:13px}
.about-refresh__services{padding-block:clamp(92px,10vw,160px)}
.about-refresh__capabilities{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(18px,2.3vw,36px)}
.about-refresh__capability{padding:29px 27px 34px;border:1px solid rgba(37,41,49,.13);border-radius:22px;background:#fff;min-height:220px;transition:transform .2s,box-shadow .2s}
.about-refresh__capability:hover{transform:translateY(-4px);box-shadow:0 16px 30px rgba(35,39,45,.07)}
.about-refresh__capability-icon{color:var(--about-red);margin-bottom:23px}
.about-refresh__capability h3{margin:0 0 10px;font-size:19px;line-height:1.25;letter-spacing:-.02em}
.about-refresh__capability p{margin:0;max-width:310px;color:var(--about-muted);line-height:1.66;font-size:15px}
.about-refresh__gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin-top:clamp(46px,5vw,76px)}
.about-refresh__gallery img{display:block;width:100%;height:clamp(210px,18vw,315px);object-fit:cover;border-radius:21px}
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
  .about-refresh__gallery img{height:225px}
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
</style>
