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
  heading: string
  body: string
  points: string[]
  faq: { q: string; a: string }[]
}
type Guide = { es: GuideText; en: GuideText }
const guides = serviceGuides as Record<string, Guide>
const { locale } = useI18n({ useScope: 'global' })
const lang = computed<'es' | 'en'>(() => String(locale.value).startsWith('en') ? 'en' : 'es')
const route = window.location.pathname.replace(/\/+$/, '') || '/'
const details = computed(() => guides[route][lang.value])
const related = computed(() => Object.entries(guides).filter(([path]) => path !== route).map(([path, text]) => ({
  path,
  label: text[lang.value].label
})))
</script>

<template>
  <div class="app-site service-landing-page">
    <SiteHeader active="soluciones" />
    <main class="container service-landing-main">
      <nav class="service-landing-breadcrumb" :aria-label="lang === 'es' ? 'Ruta de navegación' : 'Breadcrumb'">
        <a href="/">{{ lang === 'es' ? 'Inicio' : 'Home' }}</a><span aria-hidden="true">/</span>
        <a href="/servicios">{{ lang === 'es' ? 'Servicios' : 'Services' }}</a><span aria-hidden="true">/</span>
        <span aria-current="page">{{ details.label }}</span>
      </nav>

      <article>
        <header class="service-landing-hero">
          <p class="section-tag">{{ lang === 'es' ? 'Soluciones logísticas' : 'Logistics services' }}</p>
          <h1>{{ details.title }}</h1>
          <p class="service-landing-lead">{{ details.intro }}</p>
          <a class="btn btn-primary" href="mailto:comercial@castrofallas.com?subject=Consulta%20de%20servicio%20log%C3%ADstico">
            {{ lang === 'es' ? 'Solicitar información' : 'Request information' }}
          </a>
        </header>

        <section aria-labelledby="guide-heading" class="service-landing-section">
          <h2 id="guide-heading">{{ details.heading }}</h2>
          <p>{{ details.body }}</p>
          <ul class="service-landing-points">
            <li v-for="point in details.points" :key="point">{{ point }}</li>
          </ul>
        </section>

        <section class="service-landing-section" aria-labelledby="guide-faq">
          <h2 id="guide-faq">{{ lang === 'es' ? 'Preguntas frecuentes' : 'Frequently asked questions' }}</h2>
          <div v-for="item in details.faq" :key="item.q" class="service-landing-answer">
            <h3>{{ item.q }}</h3>
            <p>{{ item.a }}</p>
          </div>
        </section>

        <section class="service-landing-section" aria-labelledby="guide-related">
          <h2 id="guide-related">{{ lang === 'es' ? 'Otros servicios de Grupo Castro Fallas' : 'Other Grupo Castro Fallas services' }}</h2>
          <ul class="service-landing-related">
            <li v-for="item in related" :key="item.path"><a :href="item.path">{{ item.label }}</a></li>
            <li><a href="/servicios">{{ lang === 'es' ? 'Ver todos los servicios' : 'View all services' }}</a></li>
          </ul>
        </section>
      </article>
    </main>
    <SiteFooter />
  </div>
</template>

<style scoped>
.service-landing-page{min-height:100vh}
.service-landing-main{padding-top:68px;padding-bottom:90px}
.service-landing-breadcrumb{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:40px;font-size:13px}
.service-landing-breadcrumb a,.service-landing-related a{color:#ad0922;text-decoration:underline;text-underline-offset:3px}
.service-landing-hero{max-width:900px;margin-bottom:48px}
.service-landing-hero h1{max-width:900px;margin:12px 0 20px;line-height:1.14;font-size:clamp(32px,4.2vw,56px)}
.service-landing-lead{max-width:780px;margin-bottom:24px;font-size:clamp(16px,1.7vw,20px);line-height:1.65}
.service-landing-section{max-width:850px;margin-top:44px}
.service-landing-section h2{margin:0 0 16px;font-size:clamp(23px,2.6vw,33px)}
.service-landing-section p{line-height:1.75}
.service-landing-points{list-style:disc;margin:20px 0;padding-left:25px;line-height:1.8}
.service-landing-points li{margin-bottom:7px}
.service-landing-answer{margin:22px 0}
.service-landing-answer h3{font-size:19px;margin:0 0 8px}
.service-landing-related{display:flex;flex-wrap:wrap;gap:12px 22px;list-style:none;padding:0}
html.theme-dark .service-landing-page{background:#01081d;color:#fff}
html.theme-dark .service-landing-breadcrumb a,html.theme-dark .service-landing-related a{color:#ff9aaa}
@media(max-width:700px){.service-landing-main{padding-top:35px;padding-bottom:64px}.service-landing-breadcrumb{margin-bottom:26px}}
</style>
