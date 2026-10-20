<script setup lang="ts">
import IconSymbol from './components/IconSymbol.vue'
import {computed, nextTick, onMounted, onUnmounted, ref} from 'vue'
import routeSeo from '../seo/routes.json'
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
import OfficialQuoteWizard from './pages/OfficialQuoteWizard.vue'
import OfficialQuoteAdmin from './pages/OfficialQuoteAdmin.vue'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import ScrollProgressButton from './components/ScrollProgressButton.vue'
import AssistantBot from './components/AssistantBot.vue'
import { authState, currentRole, refreshSession } from './services/auth'
import { useI18n } from 'vue-i18n'
import { loadPublishedSiteCms } from './siteCms'
import { subscribeToChanges } from './services/realtime'
const { t } = useI18n({ useScope: 'global' })
const seoByPath: Record<string, { title: string; description: string; indexable?: boolean }> = routeSeo
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
  const seo = seoByPath[path] ?? { title: 'Página no encontrada | Castro Fallas', description: 'La página solicitada no existe.', indexable: false }
  const indexable = seo.indexable !== false
  document.title = seo.title
  setMeta('meta[name="description"]', 'name', 'description', seo.description)
  setMeta('meta[name="robots"]', 'name', 'robots', indexable ? 'index,follow' : 'noindex,nofollow')
  setMeta('meta[property="og:title"]', 'property', 'og:title', seo.title)
  setMeta('meta[property="og:description"]', 'property', 'og:description', seo.description)
  setMeta('meta[property="og:url"]', 'property', 'og:url', null)
  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', seo.title)
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', seo.description)

  const host = window.location.hostname.toLowerCase()
  const isOfficialHost = host === 'logisticacastrofallas.com' || host === 'www.logisticacastrofallas.com'
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!isOfficialHost || !indexable) {
    canonical?.remove()
    setMeta('meta[property="og:url"]', 'property', 'og:url', null)
  } else {
    const canonicalPath = path === '/home' ? '/' : path
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.rel = 'canonical'
      document.head.append(canonical)
    }
    canonical.href = `https://logisticacastrofallas.com${canonicalPath}`
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonical.href)
  }
}
applyPageSeo()
const quoteAccess = ref<'checking' | 'allowed' | 'denied' | 'forbidden'>('checking')
const requestPath = window.location.pathname.replace(/\/+$/, '') || '/'
const legacyAdminRoute = requestPath === '/admin/contenido' || requestPath === '/admin/usuarios'
const officialAdminRoute = requestPath === '/administracion/cotizaciones-oficiales'
const adminRoute = requestPath === '/administracion' || legacyAdminRoute || officialAdminRoute
const restrictedRoute = requestPath === '/tracking' || requestPath === '/itinerario' || adminRoute
const routeAccess = ref<'checking' | 'ready'>(restrictedRoute ? 'checking' : 'ready')
const loginNextHref = '/bienvenidos?next=' + encodeURIComponent(window.location.pathname + window.location.search)
// La página pública no recibe borradores: consulta solamente la API publicada.
const unsubscribeSite = subscribeToChanges('site', () => { void loadPublishedSiteCms(true) })
const unsubscribeSync = subscribeToChanges('sync', () => { void loadPublishedSiteCms(true) })
onUnmounted(() => { unsubscribeSite(); unsubscribeSync() })
onMounted(async () => {
  void loadPublishedSiteCms()
  const user = await refreshSession()
  const role = currentRole()
  if (officialAdminRoute && user?.role !== 'administrador') { window.location.replace(!user ? loginNextHref : '/home'); return }
  if (adminRoute && role !== 'administrador') {
    if (!user && !authState.previewRole) window.location.replace(loginNextHref)
    else window.location.replace('/home')
    return
  }
  if (requestPath === '/cotizaciones/nuevo') {
    if (!user) quoteAccess.value = 'denied'
    else quoteAccess.value = role === 'cliente' || role === 'administrador' ? 'allowed' : 'forbidden'
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
  if(path==='/administracion/cotizaciones-oficiales') return 'official-admin'
  if(path==='/admin/contenido' || path==='/admin/usuarios') return 'administration'
  if(path==='/noticias') return 'news'
  if(path==='/nosotros') return 'about'
  if(path==='/servicios') return 'services'
  if(path==='/tracking') return 'tracking'
  if(path==='/itinerario') return 'itinerary'
  if(path==='/cotizaciones') return 'quote'
  if(path==='/cotizaciones/nuevo') return 'official-quote'
  if(['/privacidad','/terminos','/cookies','/licencias'].includes(path)) return 'legal'
  return 'notFound'
})
</script>
<template>
  <div v-if="routeAccess === 'checking'" class="app-site" aria-busy="true" />
  <template v-else>
  <Login v-if="page==='login'"/>
  <Home v-else-if="page==='home'" />
  <Administration v-else-if="page==='administration'" />
  <OfficialQuoteAdmin v-else-if="page==='official-admin'" />
  <div v-else-if="page==='official-quote' && quoteAccess !== 'allowed'" class="app-site quote-page quote-flow-page">
    <SiteHeader/>
    <div v-if="quoteAccess === 'checking'" class="container quote-access-status" role="status">{{ t('custom.quote.checkingSession') }}</div>
    <div v-else class="container quote-access-status quote-access-status--blocked"><h1>Se requiere una sesión activa</h1><p>Iniciá sesión para enviar una solicitud.</p><a class="btn btn-primary" :href="loginNextHref">Iniciar sesión</a></div>
    <SiteFooter/>
  </div>
  <OfficialQuoteWizard v-else-if="page==='official-quote'" />
  <News v-else-if="page==='news'"/>
  <About v-else-if="page==='about'"/>
  <Services v-else-if="page==='services'"/>
  <div v-else-if="page==='notFound'" class="app-site">
    <SiteHeader />
    <main class="container" style="min-height:60vh;padding-block:6rem">
      <h1>404 · Página no encontrada</h1>
      <p>La dirección que buscás no existe. Podés volver al inicio.</p>
      <a class="btn btn-primary" href="/">Volver al inicio</a>
    </main>
    <SiteFooter />
  </div>
  <Tracking v-else-if="page==='tracking'"/>
  <Itinerary v-else-if="page==='itinerary'"/>
  <Legal v-else-if="page==='legal'" />
  <div v-else class="app-site quote-page quote-flow-page">
    <SiteHeader/>
    <div v-if="quoteAccess === 'checking'" class="container quote-access-status" role="status">{{ t('custom.quote.checkingSession') }}</div>
    <div v-else-if="quoteAccess === 'denied'" class="container quote-access-status quote-access-status--blocked">
      <h1>{{ t('custom.quote.loginRequired') }}</h1>
      <p>{{ t('custom.quote.loginRequiredHelp') }}</p>
      <a class="btn btn-primary" :href="loginNextHref">{{ t('custom.quote.goToLogin') }} <IconSymbol glyph="→" /></a>
    </div>
    <div v-else-if="quoteAccess === 'forbidden'" class="container quote-access-status quote-access-status--blocked">
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
