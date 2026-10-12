<script setup lang="ts">
import {computed, nextTick, onMounted, ref} from 'vue'
import Home from './Home.vue'
import QuoteApp from './App.vue'
import Login from './pages/Login.vue'
import News from './pages/News.vue'
import About from './pages/About.vue'
import Tracking from './pages/Tracking.vue'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
const quoteAccess = ref<'checking' | 'allowed' | 'denied'>('checking')
const loginNextHref = '/?next=' + encodeURIComponent(window.location.pathname + window.location.search)
onMounted(async () => {
  if (window.location.pathname.replace(/\/+$/, '') === '/cotizaciones') {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'same-origin' })
      quoteAccess.value = response.ok ? 'allowed' : 'denied'
    } catch { quoteAccess.value = 'denied' }
  }

  nextTick(() => {
    if (window.location.hash) document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView()
  })
})
const page = computed(()=> {
  const path=window.location.pathname.replace(/\/+$/,'') || '/'
  if(path==='/home') return 'home'
  if(path==='/noticias') return 'news'
  if(path==='/nosotros') return 'about'
  if(path==='/tracking') return 'tracking'
  if(path==='/cotizaciones') return 'quote'
  return 'login'
})
</script>
<template>
  <Login v-if="page==='login'"/>
  <Home v-else-if="page==='home'"/>
  <News v-else-if="page==='news'"/>
  <About v-else-if="page==='about'"/>
  <Tracking v-else-if="page==='tracking'"/>
  <div v-else class="app-site quote-page"><SiteHeader/><main><div class="container quote-top"><p class="section-tag">SOLUCIONES A TU MEDIDA</p><h1>Solicitá tu <span>cotización.</span></h1><p>Contanos sobre tu carga y prepará una solicitud para nuestro equipo.</p><div class="quote-notice">Las solicitudes de esta demostración se registran mediante la API existente cuando el backend está disponible. No se envía un correo automáticamente.</div></div><div v-if="quoteAccess === 'checking'" class="container" style="padding:35px 0">Verificando tu sesión…</div><div v-else-if="quoteAccess === 'denied'" class="container" style="padding:35px 0"><p>Para registrar cotizaciones debés iniciar sesión con un correo autorizado.</p><a class="btn btn-primary" :href="loginNextHref">Ingresar →</a></div><QuoteApp v-else/></main><SiteFooter/></div>
</template>
