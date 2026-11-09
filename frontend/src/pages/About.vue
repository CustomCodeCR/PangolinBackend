<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import IconSymbol from '../components/IconSymbol.vue'
import SiteMedia from '../components/SiteMedia.vue'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import { siteText, siteVisual, siteCssImage } from '../siteCms'

const { t, locale } = useI18n({ useScope: 'global' })
const values = computed(() => [0, 1, 2, 3, 4].map(index => siteText(`about.values.${index}`, t(`custom.about.values.${index}`), locale.value)))
const openedValue = ref<number | null>(null)
const toggleValue = (index: number) => {
  openedValue.value = openedValue.value === index ? null : index
}

// Proposed copy for review: mission and vision are not presented as officially approved statements.
const copy = computed(() => locale.value.startsWith('en') ? ({
  who: 'WHO WE ARE',
  heading: 'Experience connecting businesses and destinations.',
  description: 'We coordinate and supervise cargo transportation for import and export operations, nationally and internationally.',
  missionTag: 'OUR PURPOSE',
  mission: 'Mission',
  missionBody: 'To accompany each logistics operation with coordination, responsibility and solutions adapted to our customers’ needs.',
  visionTag: 'OUR DIRECTION',
  vision: 'Vision',
  visionBody: 'To continue building trusted logistics connections through experience, quality and close customer service.',
  culture: 'OUR CULTURE',
  valueLead: 'Explore the principles behind our work.',
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
  heading: 'Experiencia que conecta empresas y destinos.',
  description: 'Coordinamos y supervisamos el transporte de mercancías para operaciones de importación y exportación, a nivel nacional e internacional.',
  missionTag: 'NUESTRO PROPÓSITO',
  mission: 'Misión',
  missionBody: 'Acompañar cada operación logística con coordinación, responsabilidad y soluciones ajustadas a las necesidades de nuestros clientes.',
  visionTag: 'HACIA DÓNDE VAMOS',
  vision: 'Visión',
  visionBody: 'Seguir construyendo conexiones logísticas de confianza mediante experiencia, calidad y una atención cercana.',
  culture: 'NUESTRA CULTURA',
  valueLead: 'Descubrí los principios que orientan nuestro trabajo.',
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
      <section class="about-refresh__intro section-spacing">
        <div class="container about-refresh__intro-grid">
          <div class="about-refresh__intro-copy">
            <p class="about-refresh__eyebrow">{{ copy.who }}</p>
            <h2>{{ copy.heading }}</h2>
            <p class="about-refresh__body">{{ siteText('about.intro', t('custom.about.introduction'), locale) }}</p>
            <p class="about-refresh__support">{{ copy.description }}</p>
          </div>
          <div class="about-refresh__photo about-image-card">
            <SiteMedia slot-key="about.operations.media" fallback="/images/about-operations-enhanced.jpg" :alt="copy.imageLabel" />
            <div class="image-stamp">{{ copy.imageLabel }} <IconSymbol glyph="↗" /></div>
          </div>
        </div>
      </section>

      <section class="about-refresh__purpose section-spacing">
        <div class="container about-refresh__purpose-stack">
          <article class="about-refresh__purpose-row">
            <div class="about-refresh__purpose-image about-refresh__purpose-image--facility">
              <SiteMedia slot-key="about.operations.media" fallback="/images/about-operations-enhanced.jpg" :alt="copy.imageLabel" />
            </div>
            <div class="about-refresh__purpose-content">
              <p class="about-refresh__eyebrow">{{ copy.missionTag }}</p>
              <h2>{{ copy.mission }}</h2>
              <p>{{ copy.missionBody }}</p>
            </div>
          </article>
          <article class="about-refresh__purpose-row about-refresh__purpose-row--reverse">
            <div class="about-refresh__purpose-image about-refresh__purpose-image--transport" role="img" :aria-label="copy.purposeImage"></div>
            <div class="about-refresh__purpose-content">
              <p class="about-refresh__eyebrow">{{ copy.visionTag }}</p>
              <h2>{{ copy.vision }}</h2>
              <p>{{ copy.visionBody }}</p>
            </div>
          </article>
        </div>
      </section>

      <section class="about-refresh__values section-spacing">
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
                  <span class="about-refresh__value-number">{{ String(index + 1).padStart(2, '0') }}</span>
                  <span class="about-refresh__value-name">{{ value }}</span>
                  <span class="about-refresh__value-toggle" aria-hidden="true">{{ openedValue === index ? '−' : '+' }}</span>
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
        <div class="container about-refresh__services-grid">
          <div class="about-refresh__services-copy">
            <p class="about-refresh__eyebrow">{{ copy.servicesTag }}</p>
            <h2>{{ copy.servicesTitle }}</h2>
            <p>{{ copy.servicesBody }}</p>
            <div class="about-refresh__actions">
              <RouterLink to="/servicios" class="about-refresh__button about-refresh__button--primary">{{ copy.serviceAction }} <span aria-hidden="true">↗</span></RouterLink>
              <RouterLink to="/cotizaciones" class="about-refresh__button about-refresh__button--secondary">{{ copy.quoteAction }} <span aria-hidden="true">↗</span></RouterLink>
            </div>
          </div>
          <div class="about-refresh__services-art" role="img" :aria-label="copy.purposeImage"></div>
        </div>
      </section>
    </main>
    <SiteFooter />
  </div>
</template>

<style scoped>
.about-refresh{--about-red:#b40e2d;--about-ink:#22262d;--about-muted:#56606b;--about-line:rgba(37,41,49,.12);color:var(--about-ink)}
.about-refresh__hero{min-height:clamp(340px,39vw,510px)}
.about-refresh__hero-copy{padding-bottom:44px}
.about-refresh__intro{padding-block:clamp(64px,8vw,120px)}
.about-refresh__intro-grid{display:grid;grid-template-columns:minmax(0,.95fr) minmax(0,1.05fr);gap:clamp(32px,6vw,100px);align-items:center}
.about-refresh__eyebrow{margin:0 0 16px;color:var(--about-red);font-size:12px;font-weight:850;letter-spacing:.17em;text-transform:uppercase}
.about-refresh h2{margin:0;font-size:clamp(31px,4vw,52px);line-height:1.12;letter-spacing:-.045em;font-weight:850}
.about-refresh__intro-copy{max-width:610px}
.about-refresh__body{margin:24px 0 0;font-size:clamp(16px,1.3vw,18px);line-height:1.8}
.about-refresh__support{margin:18px 0 0;font-size:16px;line-height:1.7;color:var(--about-muted)}
.about-refresh__photo{height:clamp(300px,34vw,500px);border-radius:28px;box-shadow:0 24px 50px rgba(30,30,40,.09)}
.about-refresh__photo img,.about-refresh__photo video{width:100%;height:100%;object-fit:cover}
.about-refresh__purpose{padding-block:clamp(20px,5vw,80px) clamp(80px,10vw,140px)}
.about-refresh__purpose-stack{display:grid;gap:clamp(72px,9vw,128px)}
.about-refresh__purpose-row{display:grid;grid-template-columns:minmax(0,1.03fr) minmax(0,.97fr);gap:clamp(36px,7vw,115px);align-items:center}
.about-refresh__purpose-row--reverse .about-refresh__purpose-image{order:2}
.about-refresh__purpose-image{height:clamp(280px,31vw,435px);border-radius:30px;overflow:hidden;background:#e8e9eb}
.about-refresh__purpose-image img,.about-refresh__purpose-image video{width:100%;height:100%;object-fit:cover}
.about-refresh__purpose-image--transport{background:linear-gradient(0deg,rgba(26,28,35,.22),rgba(26,28,35,.04)),url('/images/services-crane.webp') center/cover}
.about-refresh__purpose-content{max-width:540px;padding:24px 0}
.about-refresh__purpose-content h2{font-size:clamp(36px,4.3vw,58px)}
.about-refresh__purpose-content>p:last-child{margin:24px 0 0;font-size:clamp(17px,1.4vw,20px);line-height:1.8;color:var(--about-muted)}
.about-refresh__values{padding-block:clamp(78px,9vw,132px);background:#f9f6f6}
.about-refresh__section-heading{display:flex;justify-content:space-between;align-items:end;gap:24px;margin-bottom:40px}
.about-refresh__section-heading>p{max-width:290px;color:var(--about-muted);font-size:16px;line-height:1.65}
.about-refresh__accordion{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;align-items:start}
.about-refresh__value{background:#fff;border:1px solid rgba(37,41,49,.13);border-radius:20px;overflow:hidden;transition:border-color .22s,box-shadow .22s}
.about-refresh__value.is-open{border-color:rgba(180,14,45,.48);box-shadow:0 14px 35px rgba(45,22,27,.07)}
.about-refresh__value h3{margin:0}
.about-refresh__value-trigger{appearance:none;display:flex;width:100%;min-height:100px;align-items:center;gap:22px;text-align:left;cursor:pointer;border:0;background:transparent;padding:25px 28px;color:var(--about-ink);font:inherit}
.about-refresh__value-trigger:focus-visible{outline:3px solid #bd2440;outline-offset:-4px}
.about-refresh__value-number{color:var(--about-red);font-weight:850;font-size:13px;letter-spacing:.07em}
.about-refresh__value-name{flex:1;font-weight:800;font-size:clamp(17px,1.5vw,21px)}
.about-refresh__value-toggle{width:34px;height:34px;display:grid;place-items:center;border-radius:50%;background:#f5e5e8;color:var(--about-red);font-size:24px;font-weight:500}
.about-refresh__value-panel{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .28s ease,opacity .25s ease;visibility:hidden}
.about-refresh__value-panel.is-open{grid-template-rows:1fr;opacity:1;visibility:visible}
.about-refresh__value-inner{min-height:0;overflow:hidden}
.about-refresh__value-inner p{margin:0;padding:0 28px 30px 63px;color:var(--about-muted);line-height:1.75;font-size:16px}
.about-refresh__hint{margin:22px 0 0;font-size:13px;color:var(--about-muted)}
.about-refresh__services{padding-block:clamp(80px,10vw,140px)}
.about-refresh__services-grid{display:grid;grid-template-columns:1fr 1fr;gap:clamp(48px,8vw,140px);align-items:center}
.about-refresh__services-copy>p:not(.about-refresh__eyebrow){max-width:520px;margin:24px 0 0;font-size:18px;line-height:1.75;color:var(--about-muted)}
.about-refresh__actions{display:flex;flex-wrap:wrap;gap:14px;margin-top:32px}
.about-refresh__button{display:inline-flex;align-items:center;gap:18px;min-height:49px;padding:12px 19px;border-radius:999px;font-size:14px;font-weight:750;text-decoration:none}
.about-refresh__button--primary{background:var(--about-red);color:#fff}
.about-refresh__button--secondary{color:var(--about-red);border:1px solid var(--about-red)}
.about-refresh__button:hover{transform:translateY(-2px)}
.about-refresh__services-art{min-height:clamp(300px,32vw,435px);border-radius:32px;background:linear-gradient(0deg,rgba(20,21,27,.18),transparent),url('/images/services-crane.webp') center/cover}
@media(max-width:900px){
  .about-refresh__intro-grid,.about-refresh__purpose-row,.about-refresh__services-grid{grid-template-columns:1fr;gap:28px}
  .about-refresh__purpose-row--reverse .about-refresh__purpose-image{order:0}
  .about-refresh__purpose-content{padding:4px 0}
  .about-refresh__intro-copy{max-width:100%}
  .about-refresh__intro .about-refresh__photo{height:360px}
}
@media(max-width:640px){
  .about-refresh__hero{min-height:320px}
  .about-refresh__intro{padding-block:48px 72px}
  .about-refresh__accordion{grid-template-columns:1fr;gap:14px}
  .about-refresh__section-heading{display:block;margin-bottom:26px}
  .about-refresh__section-heading>p{margin-top:16px}
  .about-refresh__purpose-stack{gap:65px}
  .about-refresh__purpose-image{height:260px}
  .about-refresh__intro .about-refresh__photo{height:250px}
  .about-refresh__value-trigger{min-height:82px;padding:18px 20px}
  .about-refresh__value-inner p{padding:0 20px 24px 56px}
  .about-refresh__services-art{min-height:245px}
}
@media(prefers-reduced-motion:reduce){
  .about-refresh__value,.about-refresh__value-panel,.about-refresh__button{transition:none}
}
html.theme-dark .about-refresh{--about-ink:#f9f9fa;--about-muted:#c5ccd8;--about-line:rgba(255,255,255,.18)}
html.theme-dark .about-refresh__values{background:#0a132b}
html.theme-dark .about-refresh__value{background:#101b35;border-color:rgba(255,255,255,.22)}
html.theme-dark .about-refresh__value.is-open{border-color:#ed526e}
html.theme-dark .about-refresh__value-trigger{color:#fff}
html.theme-dark .about-refresh__value-toggle{background:#3a2032;color:#fff}
html.theme-dark .about-refresh__button--secondary{color:#fff}
</style>
