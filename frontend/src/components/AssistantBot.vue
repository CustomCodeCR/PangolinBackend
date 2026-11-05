<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Bot, CalendarDays, FileText, Headphones, Maximize2, Minimize2, Send, Ship, X } from '@lucide/vue'
const GioOperations = defineAsyncComponent(() => import('./GioOperations.vue'))

type Message = { id: number; role: 'bot' | 'visitor'; text: string; href?: string; linkText?: string }
const { locale } = useI18n({ useScope: 'global' })
const isEnglish = computed(() => locale.value.toLowerCase().startsWith('en'))
const copy = computed(() => isEnglish.value ? {
  title: 'GIO', subtitle: 'Virtual assistant · Grupo Castro Fallas', greeting: 'Hi! I can help you find services, tracking, quotes or contact details. Try a keyword.',
  placeholder: 'Write a question…', send: 'Send', close: 'Close assistant', open: 'Open logistics assistant',
  quick: ['Request a quote', 'Check my shipment', 'Find itineraries', 'Services and contact'],
  quote: 'I can prepare a transport quote request here, ask for the missing shipment details and show a summary for your confirmation. Sending requires an authorized account. Castro Fallas confirms rates and availability.',
  tracking: 'You can use the authorized tracking page after signing in. Shipment lookups inside the GIO chat are temporarily restricted to administrators until customer ownership can be verified. GIO never invents shipment statuses.',
  service: 'Castro Fallas presents air, ocean, ground and multimodal transport, along with customs and logistics support. The right option depends on the route, cargo, timing and handling needs. The team can assess your operation and confirm the available service.',
  modalities: 'As a general guide: air freight is usually chosen when speed is a priority; ocean freight moves cargo by ship and can use a full container (FCL) or consolidated cargo (LCL); ground transport moves cargo by truck and can use a full truckload (FTL) or consolidated freight (LTL); multimodal transport combines two or more modes in one coordinated route. These are general logistics explanations, not confirmation of a specific offer. Castro Fallas should confirm availability, transit time and price for your cargo. You can reach the team at comercial@castrofallas.com or +506 2272-6772.',
  air: 'Air freight moves cargo by plane and is generally considered when transit speed is important. Suitability, route, space, transit time and price depend on the shipment and must be confirmed by Castro Fallas.',
  ocean: 'Ocean freight moves cargo by ship. FCL generally means a full container for one shipment; LCL means cargo is consolidated with other shipments. The best fit depends on volume, route and schedule, which Castro Fallas should confirm.',
  ground: 'Ground transport moves cargo by truck and can be organized as FTL (a full truckload) or LTL (consolidated cargo). Route, schedule, load type and availability must be confirmed with Castro Fallas.',
  multimodal: 'Multimodal transport combines two or more modes, such as truck and ship or truck and plane, in one coordinated route. It can help connect origins and destinations that one mode cannot cover alone; the right plan depends on the cargo and route and must be confirmed by Castro Fallas.',
  customs: 'Customs procedures depend on the merchandise, origin, destination and applicable requirements. Castro Fallas offers customs clearance and foreign trade support; send the product description and route to the team to confirm the applicable steps. GIO cannot determine official taxes or permits, so it is best to confirm your case directly at comercial@castrofallas.com or +506 2272-6772.',
  warehouse: 'The company presents fiscal warehousing and cargo storage among its logistics services. Availability, handling conditions and costs depend on the cargo and operation; request confirmation from the team.',
  company: 'Grupo Castro Fallas is a Costa Rica logistics and customs company with more than 48 years of experience, according to the site. It coordinates national and international cargo operations and offers air, ocean, ground and multimodal solutions.',
  ftlLtl: 'FTL is a full-truckload move; LTL combines cargo from multiple shippers in one truck. The best fit depends on volume, route, timing and handling. Ask for a quote to compare the options for your shipment.',
  fclLcl: 'FCL uses a full container for one shipment; LCL consolidates cargo from different shippers in a container. The appropriate option depends on cargo volume, route and schedule; the team can confirm the available service.',
  contact: 'You can contact Castro Fallas at comercial@castrofallas.com or +506 2272-6772. WhatsApp: +506 7078-6860. Office hours shown on the site: Monday to Friday, 7:30 a.m. to 5:15 p.m. Costa Rica time.',
  account: 'Sign in with an authorized account to submit a quote request. Public visitors can explore the site, but quote submission requires an enabled account.',
  navigation: 'Website guide: Home /home, Services /servicios, About /nosotros, News /noticias, Sign in /bienvenidos. Quotes /cotizaciones, Itineraries /itinerario and Tracking /tracking require an authorized login.',
  news: 'Read published articles at /noticias. GIO does not fetch live news.',
  itinerary: 'Select Find itineraries in GIO to search published routes after signing in. The search results come from the site database, not from invented schedules.',
  greetingReply: 'Hello! I can explain Castro Fallas services, quote requests, customs support, cargo storage, transport modes or how to contact the team.', fallback: 'I do not have that detail confirmed, so I will not guess. It is best to contact Grupo Castro Fallas directly at comercial@castrofallas.com, +506 2272-6772 or WhatsApp +506 7078-6860. I can also explain the services, quotes, customs, warehousing or transport modes.',
  offline: 'I cannot reach the AI right now, so this is guidance from the site: ', openLink: 'Open section', status: 'Available'
} : {
  title: 'GIO', subtitle: 'Asistente virtual · Grupo Castro Fallas', greeting: '¡Hola! Puedo ofrecer información sobre servicios, seguimiento, cotizaciones y contacto. Escribe una palabra clave.',
  placeholder: 'Escribe tu consulta…', send: 'Enviar', close: 'Cerrar asistente', open: 'Abrir asistente logístico',
  quick: ['Solicitar cotización', 'Consultar mi embarque', 'Buscar itinerarios', 'Servicios y contacto'],
  quote: 'Puedo preparar la solicitud desde este chat, preguntarte los datos que falten y mostrarte un resumen para confirmar. Para enviarla necesitarás una cuenta autorizada. Castro Fallas confirma el precio y la disponibilidad.',
  tracking: 'Puedes consultar seguimiento desde la sección de tracking con una cuenta autorizada. La búsqueda conversacional de embarques en GIO está limitada a administradores hasta verificar la titularidad del cliente. Nunca inventaré estados de carga.',
  service: 'Castro Fallas presenta transporte aéreo, marítimo, terrestre y multimodal, además de apoyo aduanero y logístico. La opción adecuada depende de la ruta, la carga, el plazo y las necesidades de manejo. El equipo puede revisar tu operación y confirmar el servicio disponible.',
  modalities: 'Como guía general: el transporte aéreo suele elegirse cuando la rapidez es prioridad; el marítimo mueve la carga por barco y puede ser en contenedor completo (FCL) o consolidado (LCL); el terrestre mueve la carga en camión y puede ser camión completo (FTL) o carga consolidada (LTL); el multimodal combina dos o más medios en una ruta coordinada. Esto explica las modalidades en general, no confirma una oferta específica. Castro Fallas debe confirmar disponibilidad, tiempo y precio según tu carga. Puedes consultar en comercial@castrofallas.com o al +506 2272-6772.',
  air: 'El transporte aéreo mueve la carga en avión y suele considerarse cuando el tiempo de tránsito es importante. La conveniencia, la ruta, el espacio, el plazo y el precio dependen del envío y debe confirmarlos Castro Fallas.',
  ocean: 'El transporte marítimo mueve la carga en barco. FCL suele referirse a un contenedor completo para un envío; LCL, a carga consolidada con otros envíos. La opción depende del volumen, la ruta y el itinerario; Castro Fallas puede confirmar cuál aplica.',
  ground: 'El transporte terrestre mueve la carga en camión y puede organizarse como FTL (camión completo) o LTL (carga consolidada). Castro Fallas debe confirmar ruta, fechas, tipo de carga y disponibilidad.',
  multimodal: 'El transporte multimodal combina dos o más medios, por ejemplo camión y barco o camión y avión, en una ruta coordinada. Puede conectar lugares que un solo medio no cubre; el plan adecuado depende de la carga y la ruta y Castro Fallas debe confirmarlo.',
  customs: 'Los trámites aduaneros dependen de la mercancía, el origen, el destino y los requisitos aplicables. Castro Fallas ofrece despacho aduanero y asesoría en comercio exterior; comparte la descripción del producto y la ruta para que el equipo confirme los pasos. GIO no determina impuestos ni permisos oficiales, así que es mejor confirmar tu caso directamente en comercial@castrofallas.com o al +506 2272-6772.',
  warehouse: 'El sitio presenta almacenamiento fiscal y resguardo de mercancías entre sus servicios logísticos. La disponibilidad, las condiciones de manejo y los costos dependen de la carga y la operación; solicitales confirmación al equipo.',
  company: 'Grupo Castro Fallas es una empresa costarricense de logística y aduanas con más de 48 años de experiencia, según el sitio. Coordina operaciones de carga nacionales e internacionales y ofrece soluciones aéreas, marítimas, terrestres y multimodales.',
  ftlLtl: 'FTL es una carga que ocupa un camión completo; LTL combina carga de varios clientes en un mismo camión. La mejor opción depende del volumen, la ruta, el plazo y el manejo. Puedes solicitar una cotización para comparar alternativas para el envío.',
  fclLcl: 'FCL utiliza un contenedor completo para un envío; LCL consolida carga de varios clientes en un contenedor. La opción adecuada depende del volumen, la ruta y el itinerario; el equipo puede confirmar qué servicio está disponible.',
  contact: 'Puedes contactar a Castro Fallas en comercial@castrofallas.com o al +506 2272-6772. WhatsApp: +506 7078-6860. El horario publicado es de lunes a viernes, de 7:30 a. m. a 5:15 p. m., hora de Costa Rica.',
  account: 'Inicia sesión con una cuenta autorizada para enviar una solicitud de cotización. Las personas visitantes pueden explorar el sitio; para registrar una cotización se necesita una cuenta habilitada.',
  navigation: 'Guía de la web: Inicio /home, Servicios /servicios, Nosotros /nosotros, Noticias /noticias, iniciar sesión /bienvenidos. Cotizaciones /cotizaciones, Itinerarios /itinerario y Tracking /tracking requieren cuenta autorizada.',
  news: 'Las noticias publicadas están en /noticias. GIO no conoce publicaciones en tiempo real.',
  itinerary: 'Elige Buscar itinerarios en GIO para consultar rutas publicadas después de iniciar sesión. Los resultados provienen de la base de datos del sitio.',
  greetingReply: '¡Hola! Puedo explicarte los servicios de Castro Fallas, cómo pedir una cotización, el apoyo aduanero, el almacenamiento, las modalidades de transporte o cómo contactar al equipo.', fallback: 'No tengo ese dato confirmado, así que no quiero inventarlo. Es mejor comunicarte directamente con Grupo Castro Fallas en comercial@castrofallas.com, al +506 2272-6772 o por WhatsApp al +506 7078-6860. También puedo explicarte los servicios, cotizaciones, aduanas, almacenamiento o modalidades de transporte.',
  offline: 'Ahora no puedo consultar la IA, así que esta es una orientación basada en el sitio: ', openLink: 'Abrir sección', status: 'Disponible'
})
const assistantRoot = ref<HTMLElement | null>(null)
const hasPageScrolled = ref(false)
const isOpen = ref(false)

// El mensaje flotante aparece únicamente después de abandonar el inicio de
// la página. La mascota y el botón para abrir GIO siguen disponibles siempre.
function syncPageScroll() {
  hasPageScrolled.value = Math.max(
    window.scrollY,
    document.documentElement.scrollTop,
    document.body.scrollTop
  ) > 0
}
const isClosing = ref(false)
const panelSettled = ref(false)
const draft = ref('')
const sending = ref(false)
const quickIcons = [FileText, Ship, CalendarDays, Headphones]
type OperationKind = 'quote' | 'tracking' | 'itinerary'
const activeOperation = ref<OperationKind | null>(null)
const panelSize = ref<0 | 1 | 2>(0)
function adjustPanel(delta: -1 | 1) { panelSize.value = Math.max(0, Math.min(2, panelSize.value + delta)) as 0 | 1 | 2 }
const operationInitial = ref('')
function handleQuick(index: number, suggestion: string) {
  operationInitial.value = ''
  if (index === 0) activeOperation.value = 'quote'
  else if (index === 1) activeOperation.value = 'tracking'
  else if (index === 2) activeOperation.value = 'itinerary'
  else void sendMessage(suggestion)
}
function operationFromMessage(question: string): OperationKind | null {
  const text = clean(question)
  if (/\b(que es|como funciona|informacion sobre|explicame|what is|how does|tell me about)\b/.test(text)) return null
  const wantsAction = /\b(quiero|necesito|puedes|podrias|ayudame|deseo|hacer|solicitar|buscar|consultar|rastrear|cotizar|registrar|preparar|check|find|track|request|quote|need|want|look up|search|submit)\b/.test(text)
    || /^(cotizacion|cotizaciones|cotizar|embarque|tracking|rastrear|itinerario|itinerarios|quote|shipment|sailing)\b/.test(text)
  if (!wantsAction) return null
  if (/\b(cotiz|cotizar|cotizacion|cotizaciones|quote|tarifa)\w*/.test(text) || /\b(fcl|lcl|ftl|ltl)\b/.test(text)) return 'quote'
  if (/\b(embarque|carga|shipment|rastrear|tracking)\w*/.test(text) && /\b(consultar|buscar|rastrear|tracking|track|check|estado|status|ver|where|find)\w*/.test(text)) return 'tracking'
  if (/\b(itinerario|itinerarios|sailing|schedule)\w*/.test(text)) return 'itinerary'
  return null
}
let nextId = 1
const messages = ref<Message[]>([])

function clean(text: string) {
  return text.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
function contains(text: string, keywords: string[]) {
  return keywords.some(keyword => text.includes(keyword))
}
function answerFor(question: string): Omit<Message, 'id' | 'role'> {
  const text = clean(question)

  // Respuestas verificadas, sin gastar llamadas a la IA en consultas rápidas.
  if (contains(text, ['guia de la web', 'navegar la web', 'mapa del sitio', 'website guide', 'site map'])) return { text: copy.value.navigation, href: '/servicios', linkText: copy.value.openLink }
  if (contains(text, ['itinerario', 'itinerarios', 'itinerary'])) return { text: copy.value.itinerary, href: '/bienvenidos', linkText: copy.value.openLink }
  if (contains(text, ['noticias', 'noticia', 'news'])) return { text: copy.value.news, href: '/noticias', linkText: copy.value.openLink }
  if (contains(text, ['cotiz', 'tarifa', 'precio', 'quote', 'rate', 'cuanto cuesta', 'cuanto vale'])) {
    const mode = contains(text, ['aerea', 'aereo', 'air']) ? 'aérea' : contains(text, ['maritima', 'maritimo', 'ocean', 'ship']) ? 'marítima' : contains(text, ['terrestre', 'camion', 'ground', 'truck']) ? 'terrestre' : contains(text, ['multimodal']) ? 'multimodal' : ''
    const response = mode ? `${copy.value.quote} Modalidad consultada: ${mode}.` : copy.value.quote
    return { text: response, href: '/bienvenidos?next=%2Fcotizaciones', linkText: copy.value.openLink }
  } else if (contains(text, ['modalidad', 'modalidades', 'diferencia entre', 'que conviene'])) {
    return { text: copy.value.modalities, href: '/servicios', linkText: copy.value.openLink }
  } else if (contains(text, ['ftl', 'ltl', 'carga completa', 'carga consolidada terrestre'])) {
    return { text: copy.value.ftlLtl, href: '/servicios', linkText: copy.value.openLink }
  } else if (contains(text, ['fcl', 'lcl', 'contenedor completo', 'carga consolidada maritima'])) {
    return { text: copy.value.fclLcl, href: '/servicios', linkText: copy.value.openLink }
  } else if (contains(text, ['tracking', 'seguimiento', 'rastrear', 'embarque', 'shipment', 'track', 'donde esta mi carga', 'estado de mi carga'])) {
    return { text: copy.value.tracking, href: '/tracking', linkText: copy.value.openLink }
  } else if (contains(text, ['horario', 'hora de atencion', 'cuando abren', 'cuando cierran', 'telefono', 'whatsapp', 'correo', 'email', 'contacto', 'contact'])) {
    return { text: copy.value.contact, href: 'mailto:comercial@castrofallas.com', linkText: 'comercial@castrofallas.com' }
  } else if (contains(text, ['almacen', 'bodega', 'almacenamiento', 'deposito fiscal', 'warehouse', 'storage'])) {
    return { text: copy.value.warehouse, href: '/servicios', linkText: copy.value.openLink }
  } else if (contains(text, ['aduana', 'aduanero', 'desalmacenaje', 'customs', 'importacion', 'exportacion', 'arancel', 'dai', 'iva', 'permiso', 'clasificacion'])) {
    return { text: copy.value.customs, href: '/servicios', linkText: copy.value.openLink }
  } else if (contains(text, ['empresa', 'quienes son', 'quien es castro', 'castro fallas', 'grupo', 'experiencia', 'trayectoria', 'about'])) {
    return { text: copy.value.company, href: '/nosotros', linkText: copy.value.openLink }
  } else if (contains(text, ['servicio', 'servicios', 'aereo', 'aerea', 'maritimo', 'maritima', 'terrestre', 'multimodal', 'logistica', 'logistics', 'transporte'])) {
    if (contains(text, ['multimodal'])) return { text: copy.value.multimodal, href: '/servicios', linkText: copy.value.openLink }
    else if (contains(text, ['aereo', 'aerea', 'air'])) return { text: copy.value.air, href: '/servicios', linkText: copy.value.openLink }
    else if (contains(text, ['maritimo', 'maritima', 'ocean'])) return { text: copy.value.ocean, href: '/servicios', linkText: copy.value.openLink }
    else if (contains(text, ['terrestre', 'camion', 'ground'])) return { text: copy.value.ground, href: '/servicios', linkText: copy.value.openLink }
    return { text: copy.value.service, href: '/servicios', linkText: copy.value.openLink }
  } else if (contains(text, ['tracking', 'seguimiento', 'rastrear', 'embarque', 'shipment', 'track'])) {
    return { text: copy.value.tracking, href: '/tracking', linkText: copy.value.openLink }
  } else if (contains(text, ['cuenta', 'usuario', 'cliente', 'login', 'iniciar sesion', 'account', 'sign in'])) {
    return { text: copy.value.account, href: '/bienvenidos', linkText: copy.value.openLink }
  } else if (contains(text, ['hola', 'buenas', 'hello', 'hi', 'hey'])) {
    return { text: copy.value.greetingReply }
  }
  return { text: copy.value.fallback }
}
async function sendMessage(value = draft.value) {
  const question = value.trim()
  if (!question || sending.value) return
  const operation = operationFromMessage(question)
  if (operation) { operationInitial.value = question; activeOperation.value = operation; draft.value = ''; return }
  const history = messages.value.slice(-4).map(message => ({ role: message.role, content: message.text.slice(0, 500) }))
  messages.value.push({ id: nextId++, role: 'visitor', text: question })
  draft.value = ''
  const simpleGreeting = /^(hola|buenas|hello|hi|hey)[!.? ]*$/.test(clean(question))
  if (simpleGreeting || copy.value.quick.includes(question)) {
    messages.value.push({ id: nextId++, role: 'bot', ...answerFor(question) })
    return
  }
  sending.value = true
  try {
    const response = await fetch('/api/assistant/chat', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, language: isEnglish.value ? 'en' : 'es', history })
    })
    if (!response.ok) throw new Error(`Assistant API: ${response.status}`)
    const data = await response.json() as { answer?: string }
    if (!data.answer?.trim()) throw new Error('Empty assistant response')
    messages.value.push({ id: nextId++, role: 'bot', text: data.answer.trim() })
  } catch {
    const localAnswer = answerFor(question)
    messages.value.push({ id: nextId++, role: 'bot', ...localAnswer, text: `${copy.value.offline}${localAnswer.text}` })
  } finally {
    sending.value = false
  }
}
function showMenu() {
  activeOperation.value = null
  messages.value = [{ id: nextId++, role: 'bot', text: copy.value.greeting }]
  draft.value = ''
}
function togglePanel() {
  if (isClosing.value) return
  if (isOpen.value) { closePanel(); return }
  isClosing.value = false
  panelSettled.value = false
  isOpen.value = true
  if (messages.value.length === 0) messages.value.push({ id: nextId++, role: 'bot', text: copy.value.greeting })
}
function closePanel() {
  if (!isOpen.value) return
  isClosing.value = true
  panelSettled.value = false
  isOpen.value = false
}
function handleOutsidePointerDown(event: PointerEvent) {
  if (!isOpen.value) return
  const root = assistantRoot.value
  if (root && !event.composedPath().includes(root)) closePanel()
}
onMounted(() => {
  document.addEventListener('pointerdown', handleOutsidePointerDown, true)
  syncPageScroll()
  window.addEventListener('scroll', syncPageScroll, { passive: true })
  window.addEventListener('pageshow', syncPageScroll)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', handleOutsidePointerDown, true)
  window.removeEventListener('scroll', syncPageScroll)
  window.removeEventListener('pageshow', syncPageScroll)
})

function finishOpen() { panelSettled.value = true }
function finishClose() { isClosing.value = false }

</script>

<template>
  <aside ref="assistantRoot" class="site-assistant" :class="{ 'site-assistant--open': isOpen || isClosing, 'site-assistant--settled': panelSettled, 'site-assistant--closing': isClosing }" aria-label="GIO, asistente logístico">
    <Transition name="gio-water" :duration="{ enter: 940, leave: 160 }" @after-enter="finishOpen" @after-leave="finishClose">
    <section v-if="isOpen" class="site-assistant__panel"  :class="{ 'site-assistant__panel--workflow': activeOperation, 'site-assistant__panel--medium': panelSize === 1, 'site-assistant__panel--wide': panelSize === 2 }" role="dialog" aria-modal="true" aria-label="Conversación con GIO" @keydown.esc="closePanel">
      <header class="site-assistant__header">
        <span class="site-assistant__header-icon"><Bot :size="20" aria-hidden="true" /></span>
        <span class="site-assistant__heading"><strong>{{ copy.title }}</strong><small><i></i>{{ copy.status }}</small></span>
        <button v-if="!activeOperation && messages.length > 1" class="site-assistant__menu" type="button" @click="showMenu">{{ isEnglish ? 'Menu' : 'Menú' }}</button>
        <div class="site-assistant__resize" :aria-label="isEnglish ? 'Window size' : 'Tamaño de la ventana'">
          <button v-if="panelSize > 0" type="button" :aria-label="isEnglish ? 'Shrink GIO window' : 'Encoger ventana de GIO'" :title="isEnglish ? 'Shrink window' : 'Encoger ventana'" @click="adjustPanel(-1)"><Minimize2 :size="17" aria-hidden="true" /></button>
          <button v-if="panelSize < 2" type="button" :aria-label="isEnglish ? 'Enlarge GIO window' : 'Agrandar ventana de GIO'" :title="isEnglish ? 'Enlarge window' : 'Agrandar ventana'" @click="adjustPanel(1)"><Maximize2 :size="17" aria-hidden="true" /></button>
        </div>
        <button class="site-assistant__close" type="button" :aria-label="copy.close" @click="closePanel"><X :size="20" /></button>
      </header>
      <GioOperations v-if="activeOperation" :key="activeOperation" :kind="activeOperation" :language="isEnglish ? 'en' : 'es'" :initial-question="operationInitial" @back="activeOperation = null" />
      <template v-else>
      <div class="site-assistant__messages" aria-live="polite">
        <div v-for="message in messages" :key="message.id" class="site-assistant__message" :class="`site-assistant__message--${message.role}`">
          <p>{{ message.text }}</p>
          <a v-if="message.href" :href="message.href">{{ message.linkText }} <span aria-hidden="true">↗</span></a>
        </div>
      </div>
      <div v-if="messages.length <= 1" class="site-assistant__quick" :aria-label="isEnglish ? 'Suggested actions' : 'Acciones sugeridas'">
        <button v-for="(suggestion, index) in copy.quick" :key="suggestion" type="button" :disabled="sending" @click="handleQuick(index, suggestion)">
          <component :is="quickIcons[index]" :size="21" aria-hidden="true" />
          <span>{{ suggestion }}</span>
        </button>
      </div>
      <form class="site-assistant__form" @submit.prevent="sendMessage()">
        <input v-model="draft" maxlength="800" :placeholder="sending ? (isEnglish ? 'GIO is thinking…' : 'GIO está preparando una respuesta…') : copy.placeholder" :aria-label="copy.placeholder" :disabled="sending" />
        <button type="submit" :aria-label="copy.send" :disabled="!draft.trim() || sending"><Send :size="17" aria-hidden="true" /></button>
      </form>
      </template>
    </section>
    </Transition>

    <button class="site-assistant__mascot" type="button" :aria-label="isOpen ? copy.close : copy.open" :aria-expanded="isOpen" @click="togglePanel">
      <span class="site-assistant__figure" aria-hidden="true">
        <img class="site-assistant__figure-base" src="/images/gio-assistant-base.png" alt="" />
        <img class="site-assistant__wave-hand" src="/images/gio-assistant-hand.png" alt="" />
      </span>
        <span class="site-assistant__hint" :class="{ 'site-assistant__hint--visible': hasPageScrolled }" aria-hidden="true">{{ isEnglish ? 'Ask GIO' : 'Hablar con GIO' }}</span>
    </button>
  </aside>
</template>

<style scoped>
/* El globo de texto, no la mascota, se desvanece al volver a scroll = 0.
   La especificidad evita que hover/focus lo muestre mientras estamos arriba. */
.site-assistant__mascot .site-assistant__hint{
  opacity:0;
  transform:translateX(-4px);
  pointer-events:none;
  transition:opacity .35s ease,transform .35s ease;
  /* Glass ligero: permite ver el fondo sin perder la lectura de GIO. */
  background:rgba(255,255,255,.52);
  -webkit-backdrop-filter:blur(5px);
  backdrop-filter:blur(5px);
  border:1px solid rgba(255,255,255,.58);
  box-shadow:0 5px 16px rgba(0,0,0,.12),inset 0 1px 0 rgba(255,255,255,.42);
  color:#1d2532;
  overflow:hidden;
}
.site-assistant__mascot .site-assistant__hint::before{
  content:'';
  position:absolute;
  inset:0 0 auto;
  height:1px;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.65),transparent);
  pointer-events:none;
}
.site-assistant__mascot .site-assistant__hint::after{
  content:'';
  position:absolute;
  inset:0 auto 0 0;
  width:1px;
  background:linear-gradient(180deg,rgba(255,255,255,.55),transparent,rgba(255,255,255,.2));
  pointer-events:none;
}
:global(html.theme-dark) .site-assistant__mascot .site-assistant__hint{
  background:rgba(18,27,44,.48);
  border-color:rgba(255,255,255,.26);
  color:#fff;
  box-shadow:0 5px 16px rgba(0,0,0,.14),inset 0 1px 0 rgba(255,255,255,.2);
}
.site-assistant__mascot .site-assistant__hint--visible{
  opacity:1;
  transform:translateX(0);
}
@media(prefers-reduced-motion:reduce){
  .site-assistant__mascot .site-assistant__hint{transition:none}
}
.site-assistant__menu{border:1px solid var(--gio-line,#666);border-radius:9px;background:var(--gio-action,transparent);color:var(--gio-ink,#fff);padding:7px 10px;font-size:11px;cursor:pointer}
.site-assistant__menu:hover{border-color:#b20c2a}
.site-assistant__panel--workflow{height:min(68vh,520px)}
.site-assistant__panel--medium{width:min(520px,calc(100vw - 28px));height:min(76vh,650px);max-height:min(76vh,650px)}
.site-assistant__panel--wide{width:min(760px,calc(100vw - 28px));height:min(86vh,800px);max-height:min(86vh,800px)}
.site-assistant__resize{display:flex;align-items:center;gap:5px;flex:0 0 auto}
.site-assistant__resize button{display:grid;place-items:center;width:32px;height:32px;border:1px solid var(--gio-line,#666);border-radius:9px;background:transparent;color:var(--gio-ink,#fff);cursor:pointer}
.site-assistant__resize button:hover,.site-assistant__resize button:focus-visible{border-color:#c51e42;outline-offset:2px}
.site-assistant__panel--medium :deep(.gio-ops__card dl){grid-template-columns:repeat(2,minmax(0,1fr))}
.site-assistant__panel--wide :deep(.gio-ops__card dl){grid-template-columns:repeat(3,minmax(0,1fr))}
@media(max-width:800px){.site-assistant__panel--workflow{height:100dvh;max-height:none}.site-assistant__resize{display:none}.site-assistant__panel--medium,.site-assistant__panel--wide{width:100%;height:100dvh;max-height:none}}

</style>
