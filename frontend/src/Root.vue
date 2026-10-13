<script setup lang="ts">
import IconSymbol from './components/IconSymbol.vue'
import {computed, nextTick, onMounted, ref} from 'vue'
import Home from './Home.vue'
import QuoteApp from './App.vue'
import Login from './pages/Login.vue'
import News from './pages/News.vue'
import About from './pages/About.vue'
import Tracking from './pages/Tracking.vue'
import Itinerary from './pages/Itinerary.vue'
import Services from './pages/Services.vue'
import Legal from './pages/Legal.vue'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import ScrollProgressButton from './components/ScrollProgressButton.vue'
import { useI18n } from 'vue-i18n'
const { t } = useI18n({ useScope: 'global' })
const gatedPaths = new Set(['/noticias', '/nosotros', '/servicios', '/tracking', '/itinerario'])
const pageWasReloaded = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'reload'
const seoByPath: Record<string, { title: string; description: string; indexable?: boolean }> = {
  '/': {
    title: 'Castro Fallas | Agencia aduanal y logística en Costa Rica',
    description: 'Agencia aduanal en Costa Rica: agenciamiento aduanero, almacén fiscal y transporte internacional aéreo, marítimo y terrestre para empresas.'
  },
  '/home': {
    title: 'Castro Fallas | Agencia aduanal y logística en Costa Rica',
    description: 'Agencia aduanal en Costa Rica: agenciamiento aduanero, almacén fiscal y transporte internacional aéreo, marítimo y terrestre para empresas.'
  },
  '/noticias': {
    title: 'Noticias de logística y comercio exterior | Castro Fallas',
    description: 'Leé noticias sobre logística, aduanas, transporte internacional y comercio exterior en Costa Rica y Centroamérica.'
  },
  '/nosotros': {
    title: 'Sobre Castro Fallas | Logística internacional en Costa Rica',
    description: 'Conocé la experiencia de Castro Fallas en logística, gestión aduanera y transporte de mercancías desde Costa Rica hacia el mundo.'
  },
  '/servicios': {
    title: 'Servicios de aduanas y transporte | Castro Fallas Costa Rica',
    description: 'Explorá soluciones de agenciamiento aduanero, almacenamiento fiscal y transporte aéreo, marítimo y terrestre para tu empresa.'
  },
  '/tracking': {
    title: 'Seguimiento de carga | Castro Fallas',
    description: 'Consultá información de seguimiento de carga y conexiones logísticas de Castro Fallas.',
    indexable: false
  },
  '/itinerario': {
    title: 'Itinerario de carga | Castro Fallas',
    description: 'Consultá información de itinerarios y coordinación de carga internacional con Castro Fallas.',
    indexable: false
  },
  '/cotizaciones': {
    title: 'Cotizá transporte y logística | Castro Fallas Costa Rica',
    description: 'Solicitá una cotización para tus cargas aéreas, marítimas o terrestres con el equipo de Castro Fallas.',
    indexable: false
  },
  '/bienvenidos': {
    title: 'Acceso a la plataforma | Castro Fallas',
    description: 'Accedé a la plataforma de Castro Fallas como cliente o usuario autorizado.',
    indexable: false
  },
  '/privacidad': {
    title: 'Política de privacidad | Castro Fallas',
    description: 'Consultá cómo Castro Fallas trata y protege la información personal relacionada con sus servicios y este sitio web.'
  },
  '/terminos': {
    title: 'Términos y condiciones | Castro Fallas',
    description: 'Leé las condiciones de uso del sitio web y de los servicios digitales de Castro Fallas.'
  },
  '/cookies': {
    title: 'Política de cookies | Castro Fallas',
    description: 'Conocé cómo este sitio usa cookies y tecnologías necesarias para su funcionamiento.'
  },
  '/licencias': {
    title: 'Créditos y licencias | Castro Fallas',
    description: 'Revisá los créditos y las licencias de recursos, bibliotecas y elementos utilizados en el sitio de Castro Fallas.'
  }
}
function setMeta(selector: string, attribute: 'name' | 'property', key: string, content: string | null) {
  let element = document.head.querySelector<HTMLMetaElement>(selector)
  if (!content) {
    element?.remove()
    return
  }
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.append(element)
  }
  element.content = content
}
function applyPageSeo() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  const seo = seoByPath[path] ?? seoByPath['/']
  const indexable = seo.indexable !== false && !gatedPaths.has(path)
  document.title = seo.title
  setMeta('meta[name="description"]', 'name', 'description', seo.description)
  setMeta('meta[name="robots"]', 'name', 'robots', indexable ? 'index,follow' : 'noindex,nofollow')
  setMeta('meta[property="og:title"]', 'property', 'og:title', seo.title)
  setMeta('meta[property="og:description"]', 'property', 'og:description', seo.description)
  setMeta('meta[property="og:url"]', 'property', 'og:url', null)
  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', seo.title)
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', seo.description)

  const host = window.location.hostname
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (isLocalHost) canonical?.remove()
  else {
    const canonicalPath = path === '/home' ? '/' : path
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.rel = 'canonical'
      document.head.append(canonical)
    }
    canonical.href = `${window.location.origin}${canonicalPath}`
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonical.href)
  }
}
applyPageSeo()
const quoteAccess = ref<'checking' | 'allowed' | 'denied'>('checking')
const requestPath = window.location.pathname.replace(/\/+$/, '') || '/'
const routeAccess = ref<'checking' | 'ready'>('ready')
const loginNextHref = '/bienvenidos?next=' + encodeURIComponent(window.location.pathname + window.location.search)
onMounted(async () => {
  if (pageWasReloaded) {
    localStorage.removeItem('castrofallas-authenticated')
    localStorage.removeItem('castrofallas-guest-mode')
    sessionStorage.removeItem('castrofallas-guest-mode')
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', cache: 'no-store' })
    } catch { /* Las páginas privadas siguen verificando el acceso en el servidor. */ }
    if (requestPath !== '/home' && requestPath !== '/') {
      window.location.replace('/home')
      return
    }
  }
  if (requestPath === '/cotizaciones') {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' })
      quoteAccess.value = response.ok ? 'allowed' : 'denied'
    } catch { quoteAccess.value = 'denied' }
  }
  nextTick(() => {
    if (window.location.hash) document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView()
  })
})
const page = computed(()=> {
  const path=window.location.pathname.replace(/\/+$/,'') || '/'
  if(path==='/home' || path==='/') return 'home'
  if(path==='/bienvenidos') return 'login'
  if(path==='/noticias') return 'news'
  if(path==='/nosotros') return 'about'
  if(path==='/servicios') return 'services'
  if(path==='/tracking') return 'tracking'
  if(path==='/itinerario') return 'itinerary'
  if(path==='/cotizaciones') return 'quote'
  if(['/privacidad','/terminos','/cookies','/licencias'].includes(path)) return 'legal'
  return 'home'
})
</script>
<template>
  <div v-if="routeAccess === 'checking'" class="app-site" aria-busy="true" />
  <template v-else>
  <Login v-if="page==='login'"/>
  <Home v-else-if="page==='home'"/>
  <News v-else-if="page==='news'"/>
  <About v-else-if="page==='about'"/>
  <Services v-else-if="page==='services'"/>
  <Tracking v-else-if="page==='tracking'"/>
  <Itinerary v-else-if="page==='itinerary'"/>
  <Legal v-else-if="page==='legal'" />
  <div v-else class="app-site quote-page quote-flow-page">
    <SiteHeader/>
    <div v-if="quoteAccess === 'checking'" class="container quote-access-status" role="status">{{ t('custom.quote.checkingSession') }}</div>
    <div v-else-if="quoteAccess === 'denied'" class="container quote-access-status">
      <h1>{{ t('custom.quote.loginRequired') }}</h1>
      <p>{{ t('custom.quote.loginRequiredHelp') }}</p>
      <a class="btn btn-primary" :href="loginNextHref">{{ t('custom.quote.goToLogin') }} <IconSymbol glyph="→" /></a>
    </div>
    <QuoteApp v-else/>
    <SiteFooter/>
  </div>
  <ScrollProgressButton v-if="page !== 'login'" />
  </template>
</template>
