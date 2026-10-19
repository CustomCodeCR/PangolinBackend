<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Bot, Headphones, PackageSearch, Send, Ship, Warehouse, X } from '@lucide/vue'

type Message = { id: number; role: 'bot' | 'visitor'; text: string; href?: string; linkText?: string }
const { locale } = useI18n({ useScope: 'global' })
const isEnglish = computed(() => locale.value.toLowerCase().startsWith('en'))
const copy = computed(() => isEnglish.value ? {
  title: 'GIO', subtitle: 'Virtual assistant · Grupo Castro Fallas', greeting: 'Hi! I can help you find services, tracking, quotes or contact details. Try a keyword.',
  placeholder: 'Write a question…', send: 'Send', close: 'Close assistant', open: 'Open logistics assistant',
  quick: ['Get a transport quote', 'Track a shipment', 'Logistics services', 'Contact an advisor'],
  quote: 'To request a quote, sign in with an authorized account and open the quote form. Include origin, destination, transport mode, cargo description, weight, dimensions and target dates so the team can review the operation. The final price and availability are confirmed by Castro Fallas.',
  tracking: 'The tracking page is available, but the site currently identifies it as a demonstration; it does not confirm live shipment status. For an active shipment update, contact the Castro Fallas team with your reference number.',
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
  itinerary: 'Visit /itinerario after signing in with an authorized account. GIO cannot view private itineraries.',
  greetingReply: 'Hello! I can explain Castro Fallas services, quote requests, customs support, cargo storage, transport modes or how to contact the team.', fallback: 'I do not have that detail confirmed, so I will not guess. It is best to contact Grupo Castro Fallas directly at comercial@castrofallas.com, +506 2272-6772 or WhatsApp +506 7078-6860. I can also explain the services, quotes, customs, warehousing or transport modes.',
  offline: 'I cannot reach the AI right now, so this is guidance from the site: ', openLink: 'Open section', status: 'Available'
} : {
  title: 'GIO', subtitle: 'Asistente virtual · Grupo Castro Fallas', greeting: '¡Hola! Puedo ofrecer información sobre servicios, seguimiento, cotizaciones y contacto. Escribe una palabra clave.',
  placeholder: 'Escribe tu consulta…', send: 'Enviar', close: 'Cerrar asistente', open: 'Abrir asistente logístico',
  quick: ['Cotizar transporte', 'Rastrear carga', 'Servicios logísticos', 'Contactar a un asesor'],
  quote: 'Para solicitar una cotización, ingresa con una cuenta autorizada y abre el formulario. Incluye origen, destino, modalidad, descripción de la carga, peso, dimensiones y fechas previstas para que el equipo revise la operación. Castro Fallas confirma el precio final y la disponibilidad.',
  tracking: 'La página de seguimiento está disponible como demostración y no confirma el estado en tiempo real de un embarque. Para consultar una operación activa, contacta a Castro Fallas con el número de referencia: comercial@castrofallas.com o +506 2272-6772.',
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
  itinerary: 'Los itinerarios están en /itinerario y requieren sesión autorizada. GIO no puede consultar los itinerarios privados.',
  greetingReply: '¡Hola! Puedo explicarte los servicios de Castro Fallas, cómo pedir una cotización, el apoyo aduanero, el almacenamiento, las modalidades de transporte o cómo contactar al equipo.', fallback: 'No tengo ese dato confirmado, así que no quiero inventarlo. Es mejor comunicarte directamente con Grupo Castro Fallas en comercial@castrofallas.com, al +506 2272-6772 o por WhatsApp al +506 7078-6860. También puedo explicarte los servicios, cotizaciones, aduanas, almacenamiento o modalidades de transporte.',
  offline: 'Ahora no puedo consultar la IA, así que esta es una orientación basada en el sitio: ', openLink: 'Abrir sección', status: 'Disponible'
})
const isOpen = ref(false)
const draft = ref('')
const sending = ref(false)
const quickIcons = [Ship, PackageSearch, Warehouse, Headphones]
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
function togglePanel() {
  isOpen.value = !isOpen.value
  if (isOpen.value && messages.value.length === 0) messages.value.push({ id: nextId++, role: 'bot', text: copy.value.greeting })
}

</script>

<template>
  <aside class="site-assistant" :class="{ 'site-assistant--open': isOpen }" aria-label="GIO, asistente logístico">
    <section v-if="isOpen" class="site-assistant__panel" aria-label="Conversación con GIO">
      <header class="site-assistant__header">
        <span class="site-assistant__header-icon"><Bot :size="20" aria-hidden="true" /></span>
        <span class="site-assistant__heading"><strong>{{ copy.title }}</strong><small><i></i>{{ copy.status }}</small></span>
        <button class="site-assistant__close" type="button" :aria-label="copy.close" @click="isOpen = false"><X :size="20" /></button>
      </header>
      <div class="site-assistant__messages" aria-live="polite">
        <div v-for="message in messages" :key="message.id" class="site-assistant__message" :class="`site-assistant__message--${message.role}`">
          <p>{{ message.text }}</p>
          <a v-if="message.href" :href="message.href">{{ message.linkText }} <span aria-hidden="true">↗</span></a>
        </div>
      </div>
      <div class="site-assistant__quick" :aria-label="isEnglish ? 'Suggested questions' : 'Consultas sugeridas'">
        <button v-for="(suggestion, index) in copy.quick" :key="suggestion" type="button" :disabled="sending" @click="sendMessage(suggestion)">
          <component :is="quickIcons[index]" :size="21" aria-hidden="true" />
          <span>{{ suggestion }}</span>
        </button>
      </div>
      <form class="site-assistant__form" @submit.prevent="sendMessage()">
        <input v-model="draft" maxlength="800" :placeholder="sending ? (isEnglish ? 'GIO is thinking…' : 'GIO está preparando una respuesta…') : copy.placeholder" :aria-label="copy.placeholder" :disabled="sending" />
        <button type="submit" :aria-label="copy.send" :disabled="!draft.trim() || sending"><Send :size="17" aria-hidden="true" /></button>
      </form>
    </section>

    <button class="site-assistant__mascot" type="button" :aria-label="isOpen ? copy.close : copy.open" :aria-expanded="isOpen" @click="togglePanel">
      <span class="site-assistant__figure" aria-hidden="true">
        <img class="site-assistant__figure-base" src="/images/gio-assistant-base.png" alt="" />
        <img class="site-assistant__wave-hand" src="/images/gio-assistant-hand.png" alt="" />
      </span>
        <span class="site-assistant__hint">{{ isEnglish ? 'Ask GIO' : 'Hablar con GIO' }}</span>
    </button>
  </aside>
</template>
