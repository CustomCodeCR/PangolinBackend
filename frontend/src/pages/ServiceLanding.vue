<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { extraBenefitsByRoute } from '../lib/serviceExtraBenefits'
import { useI18n } from 'vue-i18n'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import IconSymbol from '../components/IconSymbol.vue'
import SiteMedia from '../components/SiteMedia.vue'
import { siteText } from '../siteCms'
import serviceGuides from '../../seo/service-landings.json'
import { servicePages } from '../content/servicePages'

type GuideText = {
  label: string
  title: string
  intro: string
  answer: string
  heading: string
  body: string
  points: string[]
  quoteHeading: string
  quoteIntro: string
  quoteItems: string[]
  scopeNote: string
  faq: { q: string; a: string }[]
}
type Guide = { es: GuideText; en: GuideText }
type LandingPoint = { title?: string; body: string; icon?: string }
type LandingFaq = { q: string; a: string }
type LandingText = {
  eyebrow: string
  label: string
  title: string
  intro: string
  location: string
  ctaLabel: string
  image: string
  imageAlt: string
  video: string
  answer?: string
  heading: string
  body: string
  points: LandingPoint[]
  quoteHeading?: string
  quoteIntro?: string
  quoteItems?: string[]
  scopeNote?: string
  faq: LandingFaq[]
}
const guides = serviceGuides as Record<string, Guide>
const props = defineProps<{ pathname?: string }>()
const { locale } = useI18n({ useScope: 'global' })
const lang = computed<'es' | 'en'>(() => String(locale.value).startsWith('en') ? 'en' : 'es')
let serviceScrollListener: (() => void) | undefined
let serviceResizeListener: (() => void) | undefined
let serviceScrollDirection: 'up' | 'down' = 'down'
let serviceStepFrame = 0
const route = (props.pathname || (typeof window === 'undefined' ? '/' : window.location.pathname)).replace(/\/+$/, '') || '/'
const detailPage = computed(() => servicePages.find(item => route === `/servicios/${item.slug}`))
const serviceVideo = (pathname: string) => {
  if (pathname.endsWith('/transporte-aereo')) return '/videos/service-air.mp4'
  if (pathname.endsWith('/transporte-terrestre') || pathname.endsWith('/transporte-local') || pathname.endsWith('/transporte-panama-costa-rica')) return '/videos/service-road.mp4'
  if (pathname.endsWith('/almacenamiento-fiscal') || pathname.endsWith('/bodegaje-general')) return '/videos/service-warehouse.mp4'
  return '/videos/service-maritime.mp4'
}
const pointIcon = (index: number) => ['✦', '⇄', '⌖', 'boxes'][index % 4]
const serviceSlug=route.split('/').pop() || ''
const openServiceFaq = ref<number | null>(null)
const serviceFaqRef = ref<HTMLElement | null>(null)
const closeServiceFaqOutside = (event: PointerEvent) => {
  if (openServiceFaq.value === null || !(event.target instanceof Node)) return
  const opened = serviceFaqRef.value?.querySelector<HTMLElement>(`[data-faq-index="${openServiceFaq.value}"]`)
  if (opened && !opened.contains(event.target)) openServiceFaq.value = null
}
const closeServiceFaqOnEscape = (event: KeyboardEvent) => {
  if (event.key === 'Escape') openServiceFaq.value = null
}
const serviceHeroKey='service.'+serviceSlug+'.hero.media'
const serviceStoryKey='service.'+serviceSlug+'.story.media'
const details = computed<LandingText>(() => {
  const cms=(field:string, original:string) => siteText('service.'+serviceSlug+'.'+field,original,lang.value)
  const guide=guides[route]?.[lang.value]
  if(guide) {
    const visuals:Record<string,{image:string;alt:{es:string;en:string}}>={
      '/servicios/almacenamiento-fiscal':{image:'/images/services-warehouse.webp',alt:{es:'Almacenamiento y manejo logístico de mercancías',en:'Cargo warehousing and logistics handling'}},
      '/servicios/bodegaje-general':{image:'/images/warehouse-person.webp',alt:{es:'Equipo organizando mercancías en una bodega',en:'Team handling goods in a warehouse'}},
      '/servicios/agenciamiento-aduanal':{image:'/images/operation.webp',alt:{es:'Coordinación de documentación para operaciones aduaneras',en:'Documentation coordination for customs operations'}},
      '/servicios/consolidadora-de-carga':{image:'/images/ship.webp',alt:{es:'Buque de carga para operaciones de transporte consolidado',en:'Cargo vessel for consolidated freight operations'}}
    }
    const visual=visuals[route] || {image:'/images/hero.webp',alt:{es:'Operación logística de Grupo Castro Fallas',en:'Grupo Castro Fallas logistics operation'}}
    const locations:Record<string,{es:string;en:string}>={
      '/servicios/almacenamiento-fiscal':{es:'Almacenamiento fiscal en Costa Rica',en:'Fiscal warehousing in Costa Rica'},
      '/servicios/bodegaje-general':{es:'Bodegaje general en Costa Rica',en:'General warehousing in Costa Rica'},
      '/servicios/agenciamiento-aduanal':{es:'Gestiones aduanales en Costa Rica',en:'Customs coordination in Costa Rica'},
      '/servicios/consolidadora-de-carga':{es:'Coordinación de carga consolidada',en:'Consolidated cargo coordination'}
    }
    return {
      eyebrow:cms('eyebrow',lang.value==='es'?'SOLUCIONES LOGÍSTICAS':'LOGISTICS SERVICES'),
      label:cms('label',guide.label),
      title:cms('title',guide.title),
      intro:cms('intro',guide.intro),
      location:cms('location',locations[route]?.[lang.value] || (lang.value==='es'?'Servicios logísticos en Costa Rica':'Logistics services in Costa Rica')),
      ctaLabel:cms('ctaLabel',lang.value==='es'?'Consultar este servicio':'Ask about this service'),
      image:visual.image,
      imageAlt:visual.alt[lang.value],
      video:serviceVideo(route),
      answer:cms('answer',guide.answer),
      heading:cms('heading',guide.heading),
      body:cms('body',guide.body),
      points:guide.points.map((body,i)=>({body:cms('point.'+i+'.body',body)})),
      quoteHeading:cms('quoteHeading',guide.quoteHeading),
      quoteIntro:cms('quoteIntro',guide.quoteIntro),
      quoteItems:guide.quoteItems.map((value,i)=>cms('quoteItem.'+i,value)),
      scopeNote:cms('scopeNote',guide.scopeNote),
      faq:guide.faq.map((item,i)=>({q:cms('faq.'+i+'.q',item.q),a:cms('faq.'+i+'.a',item.a)}))
    }
  }
  const page=detailPage.value ?? servicePages[0]
  const localized=(v:{es:string;en:string})=>v[lang.value]
  return {
    eyebrow:cms('eyebrow',localized(page.eyebrow)),
    label:cms('label',localized(page.title)),
    title:cms('title',localized(page.title)),
    intro:cms('intro',localized(page.lead)),
    location:cms('location',localized(page.location)),
    ctaLabel:cms('ctaLabel',localized(page.quoteLabel)),
    image:page.image,
    imageAlt:localized(page.imageAlt),
    video:serviceVideo(route),
    heading:cms('heading',lang.value==='es'?'Una operación clara desde el primer paso.':'A clear operation from the first step.'),
    body:cms('body',lang.value==='es'
      ?'Antes de coordinar, se revisan las características de la carga, los puntos de salida y entrega, y la fecha requerida. El alcance, las condiciones y la disponibilidad se confirman para cada operación.'
      :'Before coordination, the cargo characteristics, pickup and delivery points, and required date are reviewed. Scope, terms and availability are confirmed for each operation.'),
    answer:cms('answer',lang.value==='es'
      ?'Compartir una descripción clara de la carga y los datos de la ruta ayuda al equipo a orientar la revisión y definir los siguientes pasos.'
      :'A clear cargo description and route details help the team assess the request and outline the next steps.'),
    points:page.sections.map((section,i)=>({
      title:cms('point.'+i+'.title',localized(section.title)),
      body:cms('point.'+i+'.body',localized(section.body))
    })),
    faq:page.faqs.map((faq,i)=>({
      q:cms('faq.'+i+'.q',localized(faq.question)),
      a:cms('faq.'+i+'.a',localized(faq.answer))
    }))
  }
})


const benefitCards = computed<LandingPoint[]>(() => {
  const existing = details.value.points
  const missing = Math.max(0, 4 - existing.length)
  if (!missing) return existing
  const extras = (extraBenefitsByRoute[route]?.[lang.value] ?? []).slice(0, missing)
  return [...existing, ...extras.map((point, index) => {
    const position = existing.length + index
    return {
      ...point,
      ...(point.title ? { title: siteText('service.' + serviceSlug + '.point.' + position + '.title', point.title, lang.value) } : {}),
      body: siteText('service.' + serviceSlug + '.point.' + position + '.body', point.body, lang.value)
    }
  })]
})

onMounted(async () => {
  document.addEventListener('pointerdown', closeServiceFaqOutside)
  document.addEventListener('keydown', closeServiceFaqOnEscape)
  await nextTick()
  const page = document.querySelector('.service-landing-page')
  const steps = page ? Array.from(page.querySelectorAll<HTMLElement>('.service-landing-step')) : []
  if (!page || !steps.length) return
  let previousScrollY = window.scrollY

  const clearTransition = () => {
    page.classList.remove('has-scroll-reveal')
    steps.forEach(step => {
      step.inert = false
      step.classList.remove('is-visible', 'is-exiting-up', 'is-exiting-down')
      step.style.removeProperty('--service-step-entry-offset')
    })
  }

  const showStep = (index: number) => {
    const previous = steps.findIndex(step => step.classList.contains('is-visible'))
    if (previous === index) return

    if (previous >= 0) {
      const outgoing = steps[previous]
      outgoing.classList.remove('is-visible', 'is-exiting-up', 'is-exiting-down')
      outgoing.classList.add(serviceScrollDirection === 'down' ? 'is-exiting-up' : 'is-exiting-down')
      outgoing.inert = true
    }

    const incoming = steps[index]
    incoming.classList.remove('is-exiting-up', 'is-exiting-down')
    incoming.style.setProperty('--service-step-entry-offset', serviceScrollDirection === 'down' ? '42px' : '-42px')
    incoming.inert = false
    window.requestAnimationFrame(() => {
      if (steps[index] === incoming) incoming.classList.add('is-visible')
    })
  }

  const documentTop = (element: HTMLElement) => {
    let top = 0
    let current: HTMLElement | null = element
    while (current && current !== document.documentElement) {
      top += current.offsetTop
      current = current.offsetParent as HTMLElement | null
    }
    return top
  }

  const updateActiveStep = () => {
    serviceStepFrame = 0
    const narrowScreen = window.matchMedia('(max-width: 900px)').matches
    if (narrowScreen) {
      clearTransition()
      return
    }

    page.classList.add('has-scroll-reveal')
    steps.forEach(step => { if (!step.classList.contains('is-visible')) step.inert = true })
    let activeIndex = 0
    steps.forEach((step, index) => {
      if (documentTop(step) <= window.scrollY + 32) activeIndex = index
    })
    showStep(activeIndex)
  }

  const scheduleStepUpdate = () => {
    const currentScrollY = window.scrollY
    if (currentScrollY !== previousScrollY) serviceScrollDirection = currentScrollY > previousScrollY ? 'down' : 'up'
    previousScrollY = currentScrollY
    if (!serviceStepFrame) serviceStepFrame = window.requestAnimationFrame(updateActiveStep)
  }
  serviceScrollListener = scheduleStepUpdate
  serviceResizeListener = scheduleStepUpdate
  window.addEventListener('scroll', serviceScrollListener, { passive: true })
  window.addEventListener('resize', serviceResizeListener, { passive: true })
  updateActiveStep()
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeServiceFaqOutside)
  document.removeEventListener('keydown', closeServiceFaqOnEscape)
  if (serviceScrollListener) window.removeEventListener('scroll', serviceScrollListener)
  if (serviceResizeListener) window.removeEventListener('resize', serviceResizeListener)
  if (serviceStepFrame) window.cancelAnimationFrame(serviceStepFrame)
})
</script>

<template>
  <div class="app-site service-landing-page" :class="{ 'service-landing-page--long-guide': Boolean(guides[route]) }">
    <SiteHeader active="soluciones" overlay />
    <main>
      <section class="service-landing-hero" aria-labelledby="service-landing-title">
        <div class="container service-landing-hero__inner">
          <figure class="service-landing-hero__media" aria-hidden="true">
            <SiteMedia :slot-key="serviceHeroKey" :fallback="details.image" :alt="details.imageAlt" priority />
            <div class="service-landing-hero__blur"></div>
          </figure>
          <div class="service-landing-hero__copy">
            <p class="section-tag">{{ details.eyebrow }}</p>
            <h1 id="service-landing-title" :class="{ 'service-landing-hero__title--long': details.title.length > 42 }">{{ details.title }}</h1>
            <p class="service-landing-lead">{{ details.intro }}</p>
            <p class="service-landing-location"><span aria-hidden="true">⌖</span>{{ details.location }}</p>
            <a class="btn btn-primary" :href="'/cotizaciones?servicio=' + route.split('/').pop()">
              {{ details.ctaLabel }} <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </section>

      <section class="service-landing-story" :aria-label="details.label">
        <div class="service-landing-story__frame">
          <figure class="service-landing-story__media">
            <SiteMedia class="service-landing-story__video" :slot-key="serviceStoryKey" :fallback="details.video" default-kind="Video" :poster="details.image" :alt="details.imageAlt" />
            <figcaption>{{ details.label }}</figcaption>
          </figure>
          <div class="service-landing-story__copy">
            <div class="service-landing-content">
              <div class="service-landing-steps">
                <section class="service-landing-step service-landing-step--benefits" data-step="01" aria-labelledby="guide-benefits">
                  <div class="service-landing-benefits-heading">
                    <p class="section-tag">{{ lang === 'es' ? 'BENEFICIOS' : 'BENEFITS' }}</p>
                    <h2 id="guide-benefits">{{ lang === 'es' ? 'Ventajas de este servicio' : 'Benefits of this service' }}</h2>
                  </div>
                  <div class="service-landing-feature-grid">
                    <article v-for="(point, index) in benefitCards" :key="point.title || point.body" class="service-landing-feature" :class="{ 'service-landing-feature--with-title': point.title }">
                      <span class="service-landing-feature__icon"><IconSymbol :glyph="point.icon || pointIcon(index)" :size="23" /></span>
                      <h3 v-if="point.title">{{ point.title }}</h3>
                      <p>{{ point.body }}</p>
                    </article>
                  </div>
                </section>

                <section class="service-landing-step service-landing-step--details" data-step="02" aria-labelledby="guide-heading">
                  <div class="service-landing-detail-grid">
                    <div class="service-landing-section-heading service-landing-section-heading--text-only">
                      <p class="section-tag">{{ lang === 'es' ? 'EL SERVICIO' : 'THE SERVICE' }}</p>
                      <h2 id="guide-heading">{{ details.heading }}</h2>
                      <p>{{ details.body }}</p>
                      <p v-if="details.answer" class="service-landing-answer">{{ details.answer }}</p>
                    </div>
                    <figure class="service-landing-detail-visual">
                      <SiteMedia :slot-key="serviceHeroKey" :fallback="details.image" :alt="details.imageAlt" />
                    </figure>
                  </div>
                </section>

                <section v-if="details.quoteHeading || details.scopeNote" class="service-landing-step service-landing-step--quote" data-step="03">
                  <section v-if="details.quoteHeading" class="service-landing-quote" aria-labelledby="guide-quote">
                    <div>
                      <p class="section-tag">{{ lang === 'es' ? 'PARA COTIZAR' : 'FOR A QUOTE' }}</p>
                      <h2 id="guide-quote">{{ details.quoteHeading }}</h2>
                      <p>{{ details.quoteIntro }}</p>
                    </div>
                    <ul class="service-landing-quote__list">
                      <li v-for="item in details.quoteItems || []" :key="item"><span aria-hidden="true">✓</span>{{ item }}</li>
                    </ul>
                  </section>
                  <aside v-if="details.scopeNote" class="service-landing-scope">
                    <span class="service-landing-scope__icon" aria-hidden="true">i</span>
                    <div><h2>{{ lang === 'es' ? 'Alcance y disponibilidad' : 'Scope and availability' }}</h2><p>{{ details.scopeNote }}</p></div>
                  </aside>
                </section>

                <section class="service-landing-step service-landing-step--faq" :data-step="details.quoteHeading || details.scopeNote ? '04' : '03'" aria-labelledby="guide-faq">
                  <div ref="serviceFaqRef" class="service-landing-faq">
                    <p class="section-tag">{{ lang === 'es' ? 'PREGUNTAS FRECUENTES' : 'FREQUENTLY ASKED QUESTIONS' }}</p>
                    <h2 id="guide-faq">{{ lang === 'es' ? 'Respuestas sobre este servicio.' : 'Answers about this service.' }}</h2>
                    <div v-for="(item, index) in details.faq" :key="index"
                      class="service-landing-faq__item" :data-faq-index="index"
                      :class="{ 'is-open': openServiceFaq === index }">
                      <button type="button" :aria-expanded="openServiceFaq === index"
                        :aria-controls="`service-faq-${serviceSlug}-${index}`"
                        @click="openServiceFaq = openServiceFaq === index ? null : index">
                        {{ item.q }}<span aria-hidden="true">+</span>
                      </button>
                      <div :id="`service-faq-${serviceSlug}-${index}`" class="service-landing-faq__panel"
                        :class="{ 'is-open': openServiceFaq === index }"
                        :aria-hidden="openServiceFaq !== index" :inert="openServiceFaq !== index">
                        <div class="service-landing-faq__panel-clip"><p>{{ item.a }}</p></div>
                      </div>
                    </div>
                  </div>
                </section>
                <!-- Extends the natural flow past the last sticky service stage. -->
                <div class="service-landing-steps__runway" aria-hidden="true"></div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
    <SiteFooter />
  </div>
</template>

<style>
.service-landing-page{min-height:100vh}
.service-landing-page{background:#fff;color:#20242b}
.service-landing-hero{padding:48px 0 76px;color:#fff;background:radial-gradient(ellipse at 12% 8%,rgba(178,11,45,.9),transparent 56%),linear-gradient(112deg,#2b111b 0%,#101728 75%)}
.service-landing-hero__inner{max-width:1320px}
.service-landing-breadcrumbs{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:46px;color:rgba(255,255,255,.72);font-size:13px}
.service-landing-breadcrumbs a{color:inherit;text-decoration:underline;text-underline-offset:3px}
.service-landing-breadcrumbs [aria-current=page]{color:#fff}
.service-landing-hero__grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(360px,.9fr);align-items:center;gap:clamp(38px,7vw,96px)}
.service-landing-hero__copy{max-width:670px}
.service-landing-hero .section-tag,.service-landing-content .section-tag{color:#d20d32;letter-spacing:.16em;font-weight:800}
.service-landing-hero .section-tag{color:#ff647b}
.service-landing-hero h1{max-width:700px;margin:18px 0 22px;color:#fff;font-size:clamp(42px,6vw,76px);line-height:.99;letter-spacing:-.045em}
.service-landing-lead{max-width:620px;margin:0;color:#f4e9ec;font-size:clamp(17px,1.65vw,22px);line-height:1.6}
.service-landing-location{display:flex;align-items:center;gap:9px;margin:26px 0 30px;color:#fff;font-weight:700}
.service-landing-location span{color:#ff647b;font-size:22px}
.service-landing-publisher{font-size:13px;line-height:1.6;margin:20px 0 0;opacity:.75}
.service-landing-publisher{color:#565b66}
.service-landing-hero__media{position:relative;overflow:hidden;min-height:360px;margin:0;border:1px solid rgba(255,255,255,.28);border-radius:28px;background:rgba(255,255,255,.08);box-shadow:0 22px 70px rgba(0,0,0,.25)}
.service-landing-hero__media img,.service-landing-hero__media video{display:block;width:100%;height:100%;min-height:360px;object-fit:cover}
.service-landing-hero__media::after{position:absolute;inset:35% 0 0;content:"";background:linear-gradient(transparent,rgba(13,16,29,.65));pointer-events:none}
.service-landing-hero__media figcaption{position:absolute;z-index:1;right:22px;bottom:18px;left:22px;color:#fff;font-size:13px;font-weight:700}
.service-landing-content{padding-top:80px;padding-bottom:90px;background:var(--surface,#f7f4f5)}
.service-landing-answer,.service-landing-section-heading{max-width:780px}
.service-landing-answer{margin-bottom:64px}
.service-landing-answer h2,.service-landing-section-heading h2,.service-landing-quote h2,.service-landing-faq h2,.service-landing-contact h2{margin:12px 0 16px;color:var(--ink,#20242b);font-size:clamp(30px,4.3vw,52px);line-height:1.05;letter-spacing:-.035em}
.service-landing-answer>p:last-child,.service-landing-section-heading>p:last-child,.service-landing-quote p,.service-landing-scope p,.service-landing-contact p{color:var(--muted,#595b65);line-height:1.75}
.service-landing-answer>p:last-child{font-size:clamp(18px,2vw,23px);font-weight:550}
.service-landing-process{margin-bottom:70px}
.service-landing-section-heading{margin-bottom:32px}
.service-landing-card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.service-landing-card{min-height:220px;padding:28px;border:1px solid rgba(128,128,140,.28);border-radius:24px;background:color-mix(in srgb,var(--surface,#fff) 78%,transparent);box-shadow:0 12px 30px rgba(16,20,34,.06)}
.service-landing-card__number{color:#b20c2a;font-size:13px;font-weight:900;letter-spacing:.12em}
.service-landing-card h3{margin:40px 0 12px;color:var(--ink,#20242b);font-size:22px;line-height:1.2;letter-spacing:-.02em}
.service-landing-card p{margin:40px 0 0;color:var(--ink,#20242b);font-size:18px;font-weight:650;line-height:1.6}
.service-landing-card--with-title h3{margin-top:26px}
.service-landing-card--with-title p{margin-top:0;color:var(--muted,#595b65);font-size:16px;font-weight:550;line-height:1.65}
.service-landing-quote{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1fr);gap:36px;align-items:center;margin-bottom:24px;padding:clamp(26px,4vw,48px);border:1px solid rgba(128,128,140,.28);border-radius:26px;background:color-mix(in srgb,var(--surface,#fff) 80%,transparent)}
.service-landing-quote__list{display:grid;gap:14px;margin:0;padding:0;list-style:none}
.service-landing-quote__list li{display:flex;gap:13px;align-items:flex-start;color:var(--ink,#20242b);line-height:1.6}
.service-landing-quote__list li span{display:grid;flex:0 0 28px;width:28px;height:28px;place-items:center;border-radius:50%;background:rgba(178,11,45,.1);color:#b20c2a;font-weight:900}
.service-landing-scope{display:flex;gap:16px;align-items:flex-start;margin-bottom:58px;padding:24px;border:1px solid rgba(128,128,140,.24);border-radius:20px;background:color-mix(in srgb,var(--surface,#fff) 84%,transparent)}
.service-landing-scope__icon{display:grid;flex:0 0 34px;width:34px;height:34px;place-items:center;border-radius:50%;background:rgba(178,11,45,.1);color:#b20c2a;font-weight:900}
.service-landing-scope h2{margin:2px 0 8px;font-size:18px;color:var(--ink,#20242b)}
.service-landing-scope p{margin:0}
.service-landing-faq{max-width:950px;margin:0 auto 58px}
.service-landing-faq h2{margin-bottom:24px}
.service-landing-faq__item{margin:12px 0;padding:20px 22px;border:1px solid rgba(128,128,140,.25);border-radius:16px;background:color-mix(in srgb,var(--surface,#fff) 86%,transparent)}
.service-landing-faq__item > button{display:flex;width:100%;justify-content:space-between;gap:20px;align-items:center;padding:0;border:0;background:transparent;text-align:left;font:inherit;color:var(--ink,#20242b);font-weight:750;cursor:pointer}
.service-landing-faq__item > button span{color:#b20c2a;font-size:24px;transition:transform .28s ease}
.service-landing-faq__item.is-open > button span{transform:rotate(45deg)}
.service-landing-faq__item > button:focus-visible{outline:2px solid #b20c2a;outline-offset:4px;border-radius:4px}
.service-landing-faq__panel{display:grid;grid-template-rows:0fr;opacity:0;visibility:hidden;transition:grid-template-rows .3s ease,opacity .25s ease,visibility .3s}
.service-landing-faq__panel.is-open{grid-template-rows:1fr;opacity:1;visibility:visible;transition:grid-template-rows .3s ease,opacity .25s ease,visibility 0s}
.service-landing-faq__panel-clip{min-height:0;overflow:hidden}
.service-landing-faq__item p{margin:14px 0 0;color:var(--muted,#595b65);line-height:1.7}
@media(prefers-reduced-motion:reduce){.service-landing-faq__panel,.service-landing-faq__panel.is-open,.service-landing-faq__item > button span{transition:none!important}}
.service-landing-contact{display:flex;justify-content:space-between;align-items:center;gap:30px;padding:clamp(25px,4vw,48px);border:1px solid rgba(178,11,45,.25);border-radius:24px;background:linear-gradient(112deg,rgba(178,11,45,.09),rgba(255,255,255,.4))}
.service-landing-contact h2{margin:12px 0}
.service-landing-contact p{max-width:680px;margin:0}
html.theme-dark .service-landing-page{background:#01081d;color:#fff}
html.theme-dark .service-landing-publisher{color:#c4c7d0}
html.theme-dark .service-landing-content{--surface:#101728;--ink:#fff;--muted:#d4d6df}
html.theme-dark .service-landing-card,html.theme-dark .service-landing-quote,html.theme-dark .service-landing-scope,html.theme-dark .service-landing-faq__item{background:rgba(255,255,255,.055);border-color:rgba(255,255,255,.16)}
html.theme-dark .service-landing-card__number,html.theme-dark .service-landing-content .section-tag{color:#ff647b}
html.theme-dark .service-landing-contact{background:linear-gradient(112deg,rgba(178,11,45,.2),rgba(16,23,40,.8))}
html:not(.theme-dark) .service-landing-hero{color:#20242b;background:linear-gradient(112deg,#fff 0%,#fffafa 58%,#fff 100%)}
html:not(.theme-dark) .service-landing-breadcrumbs{color:#545761}
html:not(.theme-dark) .service-landing-breadcrumbs [aria-current=page],html:not(.theme-dark) .service-landing-hero h1,html:not(.theme-dark) .service-landing-location,html:not(.theme-dark) .service-landing-lead{color:#20242b}
html:not(.theme-dark) .service-landing-hero .section-tag,html:not(.theme-dark) .service-landing-location span{color:#b20c2a}
html:not(.theme-dark) .service-landing-content{--surface:#fff;--ink:#20242b;--muted:#585a64}
html:not(.theme-dark) .service-landing-contact{background:linear-gradient(112deg,rgba(178,11,45,.08),rgba(255,255,255,.92))}
@media(max-width:900px){.service-landing-hero__grid{grid-template-columns:1fr}.service-landing-hero__media,.service-landing-hero__media img{min-height:280px}.service-landing-card-grid{grid-template-columns:1fr}.service-landing-card{min-height:0}.service-landing-card:not(.service-landing-card--with-title) p{margin-top:24px}.service-landing-quote{grid-template-columns:1fr}}
@media(max-width:700px){.service-landing-hero{padding:32px 0 50px}.service-landing-content{padding-top:56px;padding-bottom:64px}.service-landing-breadcrumbs{margin-bottom:34px}.service-landing-contact{align-items:flex-start;flex-direction:column}.service-landing-publisher{margin-top:16px}}
</style>

<style src="../styles/service-landing-experience.css"></style>
