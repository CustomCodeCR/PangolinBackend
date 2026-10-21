<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import IconSymbol from '../components/IconSymbol.vue'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import WorldGlobe from '../components/WorldGlobe.vue'

const { locale } = useI18n({ useScope: 'global' })
const en = computed(() => locale.value.toLowerCase().startsWith('en'))
const kind = ref('BL')
const reference = ref('')
type TrackingEvent = { at: string; status: string; location: string; description: string }
type TrackingResult = {
  kind: string; reference: string; status: string; origin: string; destination: string
  eta: string | null; updatedAt: string; isDemo: boolean; events: TrackingEvent[]
}
type SearchError = 'required' | 'invalid' | 'notFound' | 'limited' | 'unavailable'
const shipment = ref<TrackingResult | null>(null)
const error = ref<SearchError | null>(null)
const searching = ref(false)
let activeController: AbortController | null = null
let tour: Driver | null = null

function resetSearch() {
  activeController?.abort()
  activeController = null
  searching.value = false
  shipment.value = null
  error.value = null
}

async function searchShipment() {
  resetSearch()
  const value = reference.value.trim().toUpperCase()
  if (!value) { error.value = 'required'; return }
  if (!/^[A-Z0-9_\/-]{5,100}$/.test(value)) { error.value = 'invalid'; return }
  const controller = new AbortController()
  activeController = controller
  searching.value = true
  try {
    const query = new URLSearchParams({ kind: kind.value, reference: value })
    const response = await fetch('/api/tracking/search?' + query.toString(), {
      credentials: 'same-origin', cache: 'no-store', signal: controller.signal
    })
    if (response.ok) {
      shipment.value = await response.json() as TrackingResult
    } else {
      error.value = response.status === 404 ? 'notFound'
        : response.status === 429 ? 'limited'
        : response.status === 400 ? 'invalid' : 'unavailable'
    }
  } catch {
    if (!controller.signal.aborted) error.value = 'unavailable'
  } finally {
    if (activeController === controller) {
      activeController = null
      searching.value = false
    }
  }
}
function statusLabel(status: string) {
  return copy.value.statusNames[status as keyof typeof copy.value.statusNames] ?? status
}
function formatDate(value: string, dateOnly = false) {
  const parsed = new Date(dateOnly ? value + 'T12:00:00' : value)
  return Number.isNaN(parsed.valueOf()) ? value :
    new Intl.DateTimeFormat(en.value ? 'en-US' : 'es-CR', { dateStyle: 'medium' }).format(parsed)
}
const types = computed(() => en.value ? [
  { id: 'BL', name: 'BL number', help: 'Master Bill of Lading for the shipment.' },
  { id: 'HBL', name: 'HBL number', help: 'House Bill of Lading for your cargo.' },
  { id: 'IDTRA', name: 'IDTRA', help: 'Castro Fallas reference, when assigned.' },
  { id: 'CONTAINER', name: 'Container number', help: 'Identifier printed on the container.' },
  { id: 'PO', name: 'Purchase order (PO)', help: 'Purchase order reference, if linked to a shipment.' }
] : [
  { id: 'BL', name: 'Número BL', help: 'Conocimiento de embarque marítimo principal.' },
  { id: 'HBL', name: 'Número HBL', help: 'Conocimiento de embarque individual.' },
  { id: 'IDTRA', name: 'IDTRA', help: 'Referencia de Castro Fallas, si fue asignada.' },
  { id: 'CONTAINER', name: 'Número de contenedor', help: 'Código impreso en el contenedor.' },
  { id: 'PO', name: 'Orden de compra (PO)', help: 'Orden de compra vinculada al embarque, si aplica.' }
])
const help = computed(() => types.value.find(item => item.id === kind.value)?.help ?? '')
const copy = computed(() => en.value ? {
  eyebrow: 'CASTRO FALLAS · INTERNATIONAL CARGO', title: 'Track your', accent: 'shipment.',
  intro: 'Check shipment updates available in our records. This is not live GPS tracking; contact our team to confirm operational details.',
  heading: 'Find your shipment', hint: 'Choose the reference type shown on your shipping documents.',
  guide: 'Step-by-step guide', type: 'Reference type', number: 'Shipment reference',
  placeholder: 'Enter reference', search: 'Search shipment', required: 'Enter a reference to continue.',
  unavailable: 'Tracking service is temporarily unavailable.',
  invalid: 'Enter 5 to 100 letters, digits, hyphens, underscores or slashes.',
  notFound: 'No shipment was found for public lookup with this reference.',
  limited: 'Too many searches. Please try again later.',
  loading: 'Searching...', demo: 'SIMULATED TEST RECORD (NOT REAL CARGO)',
  updated: 'Last updated', origin: 'Origin', destination: 'Destination', eta: 'Estimated arrival',
  history: 'Shipment history', noEvents: 'No public movements recorded yet.',
  statusNames: { registered: 'Registered', at_origin: 'At origin', in_transit: 'In transit', customs: 'Customs', delivered: 'Delivered', on_hold: 'On hold' },
  explanation: 'The system only displays records authorized for public lookup. Contact our team to verify your shipment.',
  contact: 'Contact Castro Fallas', process: 'How shipment coordination works',
  processIntro: 'Our team works with carriers, customs agents and the other parties involved.',
  steps: [
    ['Review details', 'Identify the operation with its reference and documents.'],
    ['Coordinate at origin', 'Arrange preparation and applicable export documents.'],
    ['Transport and customs', 'Coordinate transit and applicable customs procedures.'],
    ['Coordinate at destination', 'Arrange the next steps for the agreed service.']
  ],
  tourTitles: ['Explore the globe', 'Choose reference type', 'Enter the reference', 'Search shipment', 'The logistics process'],
  back: 'Back to home', next: 'Next', previous: 'Back', done: 'Finish'
} : {
  eyebrow: 'CASTRO FALLAS · CARGA INTERNACIONAL', title: 'Rastrea tu', accent: 'embarque.',
  intro: 'Consultá los movimientos disponibles en nuestros registros. No es GPS en tiempo real; confirmá los detalles operativos con nuestro equipo.',
  heading: 'Busca tu embarque', hint: 'Selecciona el tipo de referencia que aparece en los documentos.',
  guide: 'Guía paso a paso', type: 'Tipo de referencia', number: 'Referencia del embarque',
  placeholder: 'Ingresa la referencia', search: 'Buscar embarque', required: 'Ingresa una referencia para continuar.',
  unavailable: 'El servicio de seguimiento no está disponible temporalmente.',
  invalid: 'Ingresá entre 5 y 100 letras, números, guiones, guiones bajos o barras.',
  notFound: 'No encontramos un embarque disponible para consulta pública con esa referencia.',
  limited: 'Demasiadas búsquedas. Intentá nuevamente más tarde.',
  loading: 'Buscando...', demo: 'REGISTRO DE PRUEBA SIMULADO (NO ES CARGA REAL)',
  updated: 'Última actualización', origin: 'Origen', destination: 'Destino', eta: 'Llegada estimada',
  history: 'Historial del embarque', noEvents: 'Todavía no hay movimientos públicos registrados.',
  statusNames: { registered: 'Registrado', at_origin: 'En origen', in_transit: 'En tránsito', customs: 'En aduana', delivered: 'Entregado', on_hold: 'En espera' },
  explanation: 'El sistema solo muestra registros autorizados para consulta pública. Contactá a nuestro equipo para confirmar tu embarque.',
  contact: 'Contactar a Castro Fallas', process: 'Así coordinamos cada embarque',
  processIntro: 'Nuestro equipo coordina con transportistas, agentes aduanales y las demás partes involucradas.',
  steps: [
    ['Revisamos los datos', 'Identificamos la operación con la referencia y sus documentos.'],
    ['Coordinamos el origen', 'Gestionamos la preparación y documentos de exportación.'],
    ['Transporte y aduanas', 'Coordinamos el tránsito y las gestiones aduaneras aplicables.'],
    ['Coordinamos el destino', 'Organizamos las siguientes gestiones del servicio acordado.']
  ],
  tourTitles: ['Explora el globo', 'Elige el tipo de referencia', 'Ingresa tu referencia', 'Busca el embarque', 'Cómo funciona la coordinación'],
  back: 'Volver al inicio', next: 'Siguiente', previous: 'Anterior', done: 'Finalizar'
})
const mailto = computed(() => {
  const title = en.value ? 'Shipment tracking request' : 'Consulta de seguimiento de embarque'
  const body = (en.value ? 'Reference' : 'Referencia') + ' (' + kind.value + '): ' + reference.value.trim()
  return 'mailto:comercial@castrofallas.com?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body)
})
function openGuide() {
  tour?.destroy()
  const targets = ['.tracking-intro .world-globe', '#tracking-guide-type', '#tracking-guide-reference', '#tracking-guide-submit', '.tracking-process__steps']
  tour = driver({
    animate: true, allowClose: true, overlayOpacity: .65, stagePadding: 9,
    popoverClass: 'tracking-driver-popover',
    showProgress: true,
    progressText: en.value ? '{{current}} of {{total}}' : '{{current}} de {{total}}',
    steps: targets.map((element, index) => ({ element, popover: {
      title: copy.value.tourTitles[index], description: index === 0 ? copy.value.intro :
      index === 1 ? copy.value.hint : index === 2 ? copy.value.placeholder :
      index === 3 ? copy.value.explanation : copy.value.processIntro
    } })),
    nextBtnText: copy.value.next, prevBtnText: copy.value.previous,
    doneBtnText: copy.value.done, onDestroyed: () => { tour = null }
  })
  tour.drive()
}
function handleGuideKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.isComposing || !tour?.isActive()) return
  event.preventDefault()
  event.stopImmediatePropagation()
  if (!event.repeat) tour.moveNext()
}

onMounted(() => {
  window.addEventListener('keydown', handleGuideKeydown, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGuideKeydown, true)
  activeController?.abort()
  tour?.destroy()
})
</script>

<template>
  <div class="app-site tracking-site">
    <SiteHeader active="embarque" />
    <main class="tracking-page">
      <div class="container tracking-content">
        <a class="back-link" href="/home#embarque">{{ copy.back }}</a>
        <section class="tracking-intro">
          <div class="tracking-copy tracking-intro__copy">
            <p class="section-tag">{{ copy.eyebrow }}</p>
            <h1>{{ copy.title }} <span>{{ copy.accent }}</span></h1>
            <p class="tracking-lead">{{ copy.intro }}</p>
          </div>
          <WorldGlobe />
        </section>
        <section class="tracking-search-section">
          <form class="tracking-search" @submit.prevent="searchShipment" novalidate>
            <div class="tracking-top">
              <span class="tracking-search__icon" aria-hidden="true"><IconSymbol glyph="⌕" :size="22" /></span>
              <div>
                <p class="section-tag">{{ copy.type }}</p>
                <h2>{{ copy.heading }}</h2>
              </div>
              <button class="tracking-guide tracking-guide-button" type="button" @click="openGuide">{{ copy.guide }} <IconSymbol glyph="↗" /></button>
            </div>
            <p class="tracking-hint">{{ copy.hint }}</p>
            <div class="tracking-fields">
              <label id="tracking-guide-type">{{ copy.type }}
                <select v-model="kind" @change="resetSearch">
                  <option v-for="item in types" :key="item.id" :value="item.id">{{ item.name }}</option>
                </select>
              </label>
              <label id="tracking-guide-reference">{{ copy.number }}
                <input v-model="reference" @input="resetSearch" maxlength="100" autocomplete="off" :placeholder="copy.placeholder" required />
              </label>
            </div>
            <p class="tracking-hint">{{ help }}</p>
            <p v-if="error" class="tracking-error" role="alert">{{
              error === 'required' ? copy.required
                : error === 'invalid' ? copy.invalid
                : error === 'notFound' ? copy.notFound
                : error === 'limited' ? copy.limited : copy.unavailable
            }}</p>
            <button id="tracking-guide-submit" type="submit" class="btn btn-primary tracking-submit" :disabled="searching">
              {{ searching ? copy.loading : copy.search }} <IconSymbol glyph="→" />
            </button>
            <div v-if="error === 'notFound' || error === 'unavailable'" class="tracking-unavailable">
              <p>{{ copy.explanation }}</p>
              <a :href="mailto">{{ copy.contact }} <IconSymbol glyph="↗" /></a>
            </div>
            <section v-if="shipment" class="tracking-result" role="status" aria-live="polite">
              <p v-if="shipment.isDemo" class="tracking-demo">{{ copy.demo }}</p>
              <div class="tracking-result__heading">
                <div>
                  <p class="section-tag">{{ shipment.kind }} · {{ shipment.reference }}</p>
                  <h3>{{ statusLabel(shipment.status) }}</h3>
                </div>
                <p>{{ copy.updated }}: {{ formatDate(shipment.updatedAt) }}</p>
              </div>
              <dl class="tracking-result__details">
                <div><dt>{{ copy.origin }}</dt><dd>{{ shipment.origin }}</dd></div>
                <div><dt>{{ copy.destination }}</dt><dd>{{ shipment.destination }}</dd></div>
                <div v-if="shipment.eta"><dt>{{ copy.eta }}</dt><dd>{{ formatDate(shipment.eta, true) }}</dd></div>
              </dl>
              <h4>{{ copy.history }}</h4>
              <ol v-if="shipment.events.length" class="tracking-result__events">
                <li v-for="(event, index) in shipment.events" :key="index">
                  <strong>{{ statusLabel(event.status) }}</strong>
                  <span>{{ formatDate(event.at) }} · {{ event.location }}</span>
                  <p>{{ event.description }}</p>
                </li>
              </ol>
              <p v-else>{{ copy.noEvents }}</p>
              <p class="tracking-disclaimer">{{ copy.explanation }}</p>
            </section>
          </form>
        </section>
        <section class="tracking-process">
          <p class="section-tag">{{ copy.eyebrow }}</p>
          <h2>{{ copy.process }}</h2>
          <p>{{ copy.processIntro }}</p>
          <ol class="tracking-process__steps">
            <li v-for="(step, index) in copy.steps" :key="index">
              <span>{{ String(index + 1).padStart(2, '0') }}</span>
              <div><h3>{{ step[0] }}</h3><p>{{ step[1] }}</p></div>
            </li>
          </ol>
        </section>
      </div>
    </main>
    <SiteFooter />
  </div>
</template>

<style scoped>
.tracking-site { --track-ink: #20242b; --track-muted: #69707c; --track-surface: #fff8f8; overflow: clip; }
:global(html.theme-dark .tracking-site) { --track-ink: #fff; --track-muted: #c1c5cf; --track-surface: #171316; }
.tracking-page { padding: 38px 0 95px; min-height: 70vh; background: var(--track-surface); color: var(--track-ink); }
.back-link { display: inline-block; margin: 0 0 25px; color: inherit; }
.tracking-intro { display: grid; grid-template-columns: .95fr 1.05fr; align-items: center; gap: 35px; }
.tracking-intro :deep(.world-globe) { width: 100%; min-height: 440px; }
.tracking-copy h1 { margin: 15px 0; font-size: clamp(40px, 5.7vw, 78px); letter-spacing: -.055em; line-height: 1.06; }
.tracking-copy h1 span { color: #a80e18; }
.tracking-lead { font-size: 17px; line-height: 1.7; color: var(--track-muted); max-width: 530px; }
.tracking-search-section { margin-top: 32px; }
.tracking-search { padding: clamp(24px, 4vw, 50px); border-radius: 26px; border: 1px solid #b5092840; background: var(--track-surface); box-shadow: 0 15px 60px #b5092815; }
.tracking-top { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
.tracking-top h2,.tracking-process h2 { margin: 8px 0; font-size: clamp(26px, 3vw, 38px); }
.tracking-guide { border: 1px solid #a80e18; border-radius: 999px; background: transparent; color: #a80e18; font: inherit; font-weight: 750; padding: 12px 17px; cursor: pointer; }
.tracking-guide:focus-visible { outline: 2px solid #a80e18; outline-offset: 3px; }
.tracking-hint { color: var(--track-muted); line-height: 1.6; }
.tracking-fields { display: grid; grid-template-columns: .8fr 1.2fr; gap: 17px; margin-top: 20px; }
.tracking-fields label { display: grid; gap: 9px; font-weight: 700; font-size: 14px; }
.tracking-fields input,.tracking-fields select { box-sizing: border-box; width: 100%; min-height: 52px; padding: 12px; border: 1px solid #96969b7d; border-radius: 12px; color: var(--track-ink); background: var(--track-surface); font: inherit; }
.tracking-error { color: #a80e18; font-weight: 700; }
.tracking-submit { width: 100%; display: flex; justify-content: space-between; margin-top: 22px; }
.tracking-unavailable { margin-top: 20px; padding: 20px; border-radius: 15px; border: 1px solid #a80e1866; }
.tracking-unavailable p { color: var(--track-muted); }
.tracking-unavailable a { color: #a80e18; font-weight: 750; }
.tracking-process { margin-top: 60px; padding: clamp(25px, 4vw, 50px); border-radius: 26px; border: 1px solid #b5092840; }
.tracking-process > p:not(.section-tag) { color: var(--track-muted); }
.tracking-process__steps { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 21px; padding: 0; list-style: none; margin: 35px 0 0; }
.tracking-process__steps li { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid #a80e18; padding-top: 18px; }
.tracking-process__steps li > span { color: #a80e18; font-weight: 800; }
.tracking-process__steps h3 { margin: 4px 0; font-size: 17px; }
.tracking-process__steps p { color: var(--track-muted); margin: 0; line-height: 1.6; font-size: 14px; }
@media(max-width:850px){.tracking-intro{grid-template-columns:1fr}.tracking-intro :deep(.world-globe){min-height:320px}.tracking-process__steps{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:580px){.tracking-page{padding:26px 0 70px}.tracking-fields{grid-template-columns:1fr}.tracking-process__steps{grid-template-columns:1fr}.tracking-copy h1{font-size:clamp(38px,11vw,58px)}.tracking-top{align-items:flex-start}.tracking-guide{width:100%}}
 .tracking-submit:disabled { opacity: .65; cursor: progress; }
.tracking-result { margin-top: 24px; padding: clamp(18px, 3vw, 30px); background: var(--track-surface); border: 1px solid #b5092840; border-radius: 18px; overflow-wrap: anywhere; }
.tracking-demo { padding: 10px 12px; color: #81200d; background: #fff0c9; border-radius: 8px; font-weight: 800; }
.tracking-result__heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.tracking-result__heading h3 { margin: 6px 0; font-size: clamp(22px, 3vw, 32px); }
.tracking-result__heading > p, .tracking-disclaimer { color: var(--track-muted); }
.tracking-result__details { display: flex; gap: 18px; flex-wrap: wrap; margin: 24px 0; }
.tracking-result__details > div { min-width: 160px; flex: 1; }
.tracking-result dt { color: var(--track-muted); font-size: 13px; }
.tracking-result dd { margin: 6px 0 0; font-weight: 750; }
.tracking-result__events { padding-left: 20px; }
.tracking-result__events li { margin: 0 0 16px; }
.tracking-result__events span { display: block; color: var(--track-muted); font-size: 14px; margin-top: 3px; }
.tracking-result__events p { margin: 4px 0 0; }
</style>

<style scoped>

/* Reproduce la composición del ZIP, con recorrido guiado voluntario. */
.tracking-site {--surface-card:#fff;--text-primary:#171923;--text-secondary:#626570;}
:global(html.theme-dark .tracking-site) {--surface-card:#10182b;--text-primary:#f4f6fb;--text-secondary:#c1cada;}
.tracking-page {min-height:68vh;padding:38px 0 100px;background:var(--page-bg,#fff);color:var(--text-primary);}
.tracking-content {max-width:1240px;}
.back-link {margin:0 0 34px;}
.tracking-intro {grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr);gap:clamp(32px,6vw,84px);}
.tracking-intro__copy {padding:30px 0;}
.tracking-intro :deep(.world-globe) {min-height:450px;}
.tracking-intro__copy h1 {font-family:'Arial Black',system-ui,sans-serif;font-size:clamp(44px,5.4vw,76px);font-weight:900;line-height:1.02;color:var(--text-primary);}
.tracking-lead {max-width:510px;color:var(--text-secondary);}
.tracking-lookup,.tracking-search-section {margin-top:30px;}
.tracking-search {
  position:relative;isolation:isolate;overflow:hidden;width:100%;box-sizing:border-box;
  padding:clamp(28px,4.4vw,54px);border:1px solid #b5092840;border-radius:30px;
  background:var(--surface-card);box-shadow:0 18px 65px #b5092812;
}
.tracking-search::before {
  content:'';position:absolute;z-index:0;top:-35%;bottom:-35%;left:-55%;width:52%;
  border-radius:50%;background:radial-gradient(ellipse at center,#be0a2b33 0%,#ad09221c 42%,transparent 76%);
  filter:blur(30px);pointer-events:none;animation:zip-tracking-glow 7s cubic-bezier(.4,0,.2,1) infinite;
}
.tracking-search>* {position:relative;z-index:1}
.tracking-top {display:flex;align-items:center;justify-content:flex-start;gap:14px;}
.tracking-top > div {flex:1}
.tracking-search__icon {display:grid;place-items:center;flex:0 0 48px;width:48px;height:48px;border-radius:16px;background:#b50928;color:#fff;}
.tracking-guide-button {display:inline-flex;align-items:center;justify-content:center;margin-left:auto;border:1px solid #b5092861;border-radius:999px;padding:12px 16px;color:#b50928;background:transparent;font-size:13px;font-weight:800;cursor:pointer;}
.tracking-guide-button:hover {transform:translateY(-1px);background:transparent;}
.tracking-top h2,.tracking-process h2 {margin:4px 0;color:var(--text-primary);font-size:clamp(26px,3vw,36px);letter-spacing:-.035em}
.tracking-hint {color:var(--text-secondary);line-height:1.6}
.tracking-fields {grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:18px}
.tracking-fields label {font-size:13px;font-weight:750;color:var(--text-primary)}
.tracking-fields input,.tracking-fields select {min-height:52px;border:1px solid #96969b60;border-radius:13px;background:var(--surface-card);color:var(--text-primary)}
.tracking-submit {margin-top:20px}
.tracking-process {margin-top:clamp(50px,7vw,88px);padding:clamp(26px,5vw,58px);border:1px solid #b5092833;border-radius:30px;background:linear-gradient(125deg,#b509280d,var(--surface-card) 58%);}
.tracking-process__steps {margin-top:42px;gap:22px}
.tracking-process__steps li {border-top:1px solid #b5092859;padding-top:23px}
.tracking-process__steps li > span {font-size:13px;font-weight:900;letter-spacing:.1em;margin-bottom:17px}
.tracking-unavailable {background:color-mix(in srgb,#b50928 6%,var(--surface-card));}
:global(html.theme-dark .tracking-search) {background:linear-gradient(112deg,#21111f 0%,#11182b 48%,#08142d 100%);border-color:#e2284561;box-shadow:0 16px 42px #0003}
:global(html.theme-dark .tracking-field input),:global(html.theme-dark .tracking-fields :is(input,select)) {background:#10182b;color:#fff}
:global(html.theme-dark .tracking-process) {background:linear-gradient(125deg,#20101f,#10182b 62%)}
@keyframes zip-tracking-glow {0%{opacity:0;transform:translateX(0)}18%,82%{opacity:1}100%{opacity:0;transform:translateX(340%)}}
@media(prefers-reduced-motion:reduce){.tracking-search::before{animation:none;transform:translateX(120%);opacity:.5}}
@media(max-width:850px){.tracking-intro{grid-template-columns:1fr;gap:10px}.tracking-intro__copy{padding:8px 0 12px}.tracking-intro :deep(.world-globe){min-height:390px}}
@media(max-width:580px){
  .tracking-page{padding:27px 0 70px}
  .tracking-intro__copy h1{font-size:clamp(42px,12vw,58px)}
  .tracking-intro :deep(.world-globe){min-height:290px}
  .tracking-search-section{margin-top:10px}
  .tracking-search{padding:22px 18px;border-radius:22px}
  .tracking-top{flex-wrap:wrap}
  .tracking-guide-button{width:100%;margin:14px 0 0}
  .tracking-fields{grid-template-columns:1fr;gap:0}
  .tracking-process{padding:24px 20px;border-radius:23px}
  .tracking-process__steps{grid-template-columns:1fr;gap:20px;margin-top:28px}
  .tracking-process__steps li{display:grid;grid-template-columns:40px 1fr;gap:12px;padding-top:17px}
}

</style>
