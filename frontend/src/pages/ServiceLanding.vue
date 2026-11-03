<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import serviceGuides from '../../seo/service-landings.json'

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
const guides = serviceGuides as Record<string, Guide>
const props = defineProps<{ pathname?: string }>()
const { locale } = useI18n({ useScope: 'global' })
const lang = computed<'es' | 'en'>(() => String(locale.value).startsWith('en') ? 'en' : 'es')
const route = (props.pathname || (typeof window === 'undefined' ? '/' : window.location.pathname)).replace(/\/+$/, '') || '/'
const details = computed(() => guides[route][lang.value])
</script>

<template>
  <div class="app-site service-landing-page">
    <SiteHeader active="soluciones" />
    <main class="container service-landing-main">
      <article>
        <header class="service-landing-hero">
          <p class="section-tag">{{ lang === 'es' ? 'Soluciones logísticas' : 'Logistics services' }}</p>
          <h1>{{ details.title }}</h1>
          <p class="service-landing-lead">{{ details.intro }}</p>
          <p class="service-landing-publisher">{{ lang === 'es' ? 'Información de servicios de Grupo Castro Fallas · Costa Rica' : 'Grupo Castro Fallas service information · Costa Rica' }}</p>
          <a class="btn btn-primary" href="mailto:comercial@castrofallas.com?subject=Consulta%20de%20servicio%20log%C3%ADstico">
            {{ lang === 'es' ? 'Solicitar información' : 'Request information' }}
          </a>
        </header>

        <section aria-labelledby="service-answer-heading" class="service-landing-section">
          <h2 id="service-answer-heading">{{ lang === 'es' ? '¿Qué ofrece Grupo Castro Fallas?' : 'What can Grupo Castro Fallas help with?' }}</h2>
          <p class="service-landing-direct-answer">{{ details.answer }}</p>
        </section>

        <section aria-labelledby="guide-heading" class="service-landing-section">
          <h2 id="guide-heading">{{ details.heading }}</h2>
          <p>{{ details.body }}</p>
          <ul class="service-landing-points">
            <li v-for="point in details.points" :key="point">{{ point }}</li>
          </ul>
        </section>

        <section class="service-landing-section" aria-labelledby="guide-quote">
          <h2 id="guide-quote">{{ details.quoteHeading }}</h2>
          <p>{{ details.quoteIntro }}</p>
          <ul class="service-landing-points">
            <li v-for="item in details.quoteItems" :key="item">{{ item }}</li>
          </ul>
        </section>

        <section class="service-landing-section" aria-labelledby="guide-scope">
          <h2 id="guide-scope">{{ lang === 'es' ? 'Alcance y disponibilidad' : 'Scope and availability' }}</h2>
          <p>{{ details.scopeNote }}</p>
        </section>

        <section class="service-landing-section" aria-labelledby="guide-faq">
          <h2 id="guide-faq">{{ lang === 'es' ? 'Preguntas frecuentes' : 'Frequently asked questions' }}</h2>
          <div v-for="item in details.faq" :key="item.q" class="service-landing-answer">
            <h3>{{ item.q }}</h3>
            <p>{{ item.a }}</p>
          </div>
        </section>

      </article>
    </main>
    <SiteFooter />
  </div>
</template>

<style scoped>
.service-landing-page{min-height:100vh;background:#fff;color:#20242b}
.service-landing-main{padding-top:68px;padding-bottom:90px}
.service-landing-hero{max-width:900px;margin-bottom:48px}
.service-landing-hero h1{max-width:900px;margin:12px 0 20px;line-height:1.14;font-size:clamp(32px,4.2vw,56px)}
.service-landing-lead{max-width:780px;margin-bottom:16px;font-size:clamp(16px,1.7vw,20px);line-height:1.65}
.service-landing-publisher{font-size:13px;line-height:1.6;margin:0 0 26px;opacity:.75}
.service-landing-direct-answer{font-weight:550}
.service-landing-section{max-width:850px;margin-top:44px}
.service-landing-section h2{margin:0 0 16px;font-size:clamp(23px,2.6vw,33px)}
.service-landing-section p{line-height:1.75}
.service-landing-points{list-style:disc;margin:20px 0;padding-left:25px;line-height:1.8}
.service-landing-points li{margin-bottom:7px}
.service-landing-answer{margin:22px 0}
.service-landing-answer h3{font-size:19px;margin:0 0 8px}
.service-landing-page .section-tag{color:#b20c2a}
.service-landing-publisher{color:#565b66}
:global(html.theme-dark) .service-landing-page{background:#01081d;color:#fff}
:global(html.theme-dark) .service-landing-page .section-tag{color:#ff647b}
:global(html.theme-dark) .service-landing-publisher{color:#c4c7d0}
@media(max-width:700px){.service-landing-main{padding-top:35px;padding-bottom:64px}}
</style>
