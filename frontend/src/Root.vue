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
const quoteAccess = ref<'checking' | 'allowed' | 'denied'>('checking')
const gatedPaths = new Set(['/noticias', '/nosotros', '/servicios', '/tracking', '/itinerario'])
const requestPath = window.location.pathname.replace(/\/+$/, '') || '/'
const routeAccess = ref<'checking' | 'ready'>(gatedPaths.has(requestPath) ? 'checking' : 'ready')
const loginNextHref = '/bienvenidos?next=' + encodeURIComponent(window.location.pathname + window.location.search)
onMounted(async () => {
  if (gatedPaths.has(requestPath)) {
    localStorage.removeItem('castrofallas-guest-mode')
    if (sessionStorage.getItem('castrofallas-guest-mode') === 'true') {
      routeAccess.value = 'ready'
    } else {
      try {
        const response = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' })
        if (response.ok) routeAccess.value = 'ready'
        else window.location.replace('/home')
      } catch { window.location.replace('/home') }
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
