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
import Administration from './pages/Administration.vue'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import ScrollProgressButton from './components/ScrollProgressButton.vue'
import AssistantBot from './components/AssistantBot.vue'
import { authState, currentRole, refreshSession } from './services/auth'
import { useI18n } from 'vue-i18n'
import { loadPublishedSiteCms } from './siteCms'
const { t } = useI18n({ useScope: 'global' })
const gatedPaths = new Set(['/noticias', '/nosotros', '/servicios', '/tracking', '/itinerario'])
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
    description: 'Noticias sobre logística, aduanas, transporte internacional y comercio exterior en Costa Rica y Centroamérica.'
  },
  '/nosotros': {
    title: 'Sobre Castro Fallas | Logística internacional en Costa Rica',
    description: 'Conoce la experiencia de Castro Fallas en logística, gestión aduanera y transporte de mercancías desde Costa Rica hacia el mundo.'
  },
  '/servicios': {
    title: 'Servicios de aduanas y transporte | Castro Fallas Costa Rica',
    description: 'Soluciones de agenciamiento aduanero, almacenamiento fiscal y transporte aéreo, marítimo y terrestre para empresas.'
  },
  '/tracking': {
    title: 'Seguimiento de carga | Castro Fallas',
    description: 'Información de seguimiento de carga y conexiones logísticas de Castro Fallas.',
    indexable: false
  },
  '/itinerario': {
    title: 'Itinerario de carga | Castro Fallas',
    description: 'Información de itinerarios y coordinación de carga internacional con Castro Fallas.',
    indexable: false
  },
  '/cotizaciones': {
    title: 'Cotizar transporte y logística | Castro Fallas Costa Rica',
    description: 'Solicita una cotización para cargas aéreas, marítimas o terrestres con el equipo de Castro Fallas.',
    indexable: false
  },
  '/bienvenidos': {
    title: 'Acceso a la plataforma | Castro Fallas',
    description: 'Accede a la plataforma de Castro Fallas como cliente o usuario autorizado.',
    indexable: false
  },
  '/admin/contenido': {
    title: 'Administración de contenido | Castro Fallas',
    description: 'Administración local de itinerarios, noticias y multimedia.',
    indexable: false
  },
  '/admin/usuarios': {
    title: 'Administración de usuarios | Castro Fallas',
    description: 'Administración de cuentas y roles autorizados de Castro Fallas.',
    indexable: false
  },
  '/administracion': {
    title: 'Administración | Castro Fallas',
    description: 'Administración de contenido y usuarios autorizados de Castro Fallas.',
    indexable: false
  },
  '/privacidad': {
    title: 'Política de privacidad | Castro Fallas',
    description: 'Información sobre el tratamiento y la protección de datos personales relacionados con los servicios de Castro Fallas y este sitio web.'
  },
  '/terminos': {
    title: 'Términos y condiciones | Castro Fallas',
    description: 'Condiciones de uso del sitio web y de los servicios digitales de Castro Fallas.'
  },
  '/cookies': {
    title: 'Política de cookies | Castro Fallas',
    description: 'Información sobre el uso de cookies y tecnologías necesarias para el funcionamiento de este sitio.'
  },
  '/licencias': {
    title: 'Créditos y licencias | Castro Fallas',
    description: 'Créditos y licencias de recursos, bibliotecas y elementos utilizados en el sitio de Castro Fallas.'
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
const quoteAccess = ref<'checking' | 'allowed' | 'denied' | 'forbidden'>('checking')
const requestPath = window.location.pathname.replace(/\/+$/, '') || '/'
const legacyAdminRoute = requestPath === '/admin/contenido' || requestPath === '/admin/usuarios'
const adminRoute = requestPath === '/administracion' || legacyAdminRoute
const restrictedRoute = requestPath === '/tracking' || requestPath === '/itinerario' || adminRoute
const routeAccess = ref<'checking' | 'ready'>(restrictedRoute ? 'checking' : 'ready')
const loginNextHref = '/bienvenidos?next=' + encodeURIComponent(window.location.pathname + window.location.search)
onMounted(async () => {
  void loadPublishedSiteCms()
  const user = await refreshSession()
  const role = currentRole()
  if (adminRoute && role !== 'administrador') {
    if (!user && !authState.previewRole) window.location.replace(loginNextHref)
    else window.location.replace('/home')
    return
  }
  if (requestPath === '/cotizaciones') {
    if (!user) quoteAccess.value = 'denied'
    else quoteAccess.value = role === 'cliente' || role === 'administrador' ? 'allowed' : 'forbidden'
  }
  if (legacyAdminRoute && role === 'administrador') {
    const params = new URLSearchParams()
    if (requestPath === '/admin/usuarios' || new URLSearchParams(window.location.search).get('tab') === 'usuarios') params.set('tab', 'usuarios')
    if (authState.previewRole) params.set('previewRole', authState.previewRole)
    window.location.replace(`/administracion${params.size ? `?${params.toString()}` : ''}`)
    return
  }
  if ((requestPath === '/tracking' || requestPath === '/itinerario') && role !== 'cliente' && role !== 'administrador') {
    window.location.replace('/home?acceso=cliente')
    return
  }
  nextTick(() => {
    if (window.location.hash) document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView()
  })
  routeAccess.value = 'ready'
})
const page = computed(()=> {
  const path=window.location.pathname.replace(/\/+$/,'') || '/'
  if(path==='/home' || path==='/') return 'home'
  if(path==='/bienvenidos') return 'login'
  if(path==='/administracion') return 'administration'
  if(path==='/admin/contenido' || path==='/admin/usuarios') return 'administration'
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
  <Home v-else-if="page==='home'" />
  <Administration v-else-if="page==='administration'" />
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
    <div v-else-if="quoteAccess === 'forbidden'" class="container quote-access-status">
      <h1>{{ t('custom.quote.loginRequired') }}</h1>
      <p>{{ t('custom.quote.loginRequiredHelp') }}</p>
      <a class="btn btn-primary" href="/home">{{ t('custom.quote.back') }} <IconSymbol glyph="←" /></a>
    </div>
    <QuoteApp v-else/>
    <SiteFooter/>
  </div>
  <ScrollProgressButton v-if="page !== 'login'" />
  <AssistantBot v-if="page !== 'login'" />
  </template>
</template>
