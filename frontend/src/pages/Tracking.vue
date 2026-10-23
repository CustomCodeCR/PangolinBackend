<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import IconSymbol from '../components/IconSymbol.vue'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import WorldGlobe from '../components/WorldGlobe.vue'
import FieldDropdown from '../components/FieldDropdown.vue'
import type { TrackingDemoShipment } from '../types/tracking'

const { locale } = useI18n({ useScope: 'global' })
const en = computed(() => locale.value.toLowerCase().startsWith('en'))
const kind = ref('BL')
const reference = ref('')
const searched = ref(false)
const loading = ref(false)
const shipment = ref<TrackingDemoShipment | null>(null)
const globeSection = ref<HTMLElement | null>(null)
function showDemoRoute() {
  globeSection.value?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start'
  })
}
const lookupFailure = ref<'none' | 'missing' | 'invalid' | 'limited' | 'error'>('none')
let lookupRevision = 0
watch([kind, reference], () => {
  lookupRevision++
  searched.value = false
  loading.value = false
  shipment.value = null
  lookupFailure.value = 'none'
})
async function searchShipment() {
  const revision = ++lookupRevision
  const code = reference.value.trim()
  searched.value = true
  shipment.value = null
  lookupFailure.value = 'none'
  if (!code) return
  if (code.length < 3 || code.length > 64 || !/^[a-z0-9_-]+$/i.test(code)) {
    lookupFailure.value = 'invalid'
    return
  }
  loading.value = true
  try {
    const params = new URLSearchParams({ type: kind.value, reference: code })
    const response = await fetch('/api/tracking/demo?' + params.toString(), {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    })
    if (revision !== lookupRevision) return
    if (response.status === 404) { lookupFailure.value = 'missing'; return }
    if (response.status === 429) { lookupFailure.value = 'limited'; return }
    if (!response.ok) { lookupFailure.value = 'error'; return }
    const data = await response.json() as TrackingDemoShipment
    if (data.demo !== true || !data.origin || !data.destination ||
        !Number.isFinite(data.progressPercent)) throw new Error('Invalid demo response')
    shipment.value = data
  } catch {
    if (revision === lookupRevision) lookupFailure.value = 'error'
  } finally {
    if (revision === lookupRevision) loading.value = false
  }
}
const statusLabels = computed<Record<string, string>>(() => en.value ? ({
  planned: 'Planned', in_transit: 'In transit', arrived: 'Arrived', delivered: 'Delivered'
}) : ({
  planned: 'Planificado', in_transit: 'En tránsito', arrived: 'Llegó a destino', delivered: 'Entregado'
}))
function formatDate(value: string) {
  const date = new Date(value + 'T12:00:00Z')
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(en.value ? 'en-US' : 'es-CR', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
  }).format(date)
}
let tour: Driver | null = null
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
  intro: 'Explore sample shipments with an interactive route. Live cargo tracking is not connected yet.',
  heading: 'Find your shipment', hint: 'Choose the reference type shown on your shipping documents.',
  guide: 'Step-by-step guide', type: 'Reference type', number: 'Shipment reference',
  placeholder: 'Enter reference', search: 'Search shipment', required: 'Enter a reference to continue.',
  unavailable: 'Online tracking is not available yet',
  demoLabel: 'DEMO · Fictitious shipment', result: 'Shipment summary',
  origin: 'Origin', destination: 'Destination', status: 'Status',
  estimatedDeparture: 'Sample departure', estimatedArrival: 'Sample arrival',
  progress: 'Illustrative progress', loading: 'Searching demo shipments…', viewRoute: 'View route on globe',
  demoNotice: 'Illustrative data only. The moving route marker is not GPS and does not show real shipment positions.',
  notFound: 'No sample shipment found', notFoundInfo: 'Check the selected reference type and the sample code.',
  invalid: 'Enter 3–64 letters, digits, hyphens or underscores.',
  limited: 'Too many searches. Please retry shortly.',
  failed: 'Could not connect to demo tracking. Check the backend and try again.',
  explanation: 'We cannot retrieve live movements yet. Contact Castro Fallas and include your reference so the team can assist.',
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
  intro: 'Explora embarques ficticios y sus rutas interactivas. El seguimiento real todavía no está conectado.',
  heading: 'Busca tu embarque', hint: 'Selecciona el tipo de referencia que aparece en los documentos.',
  guide: 'Guía paso a paso', type: 'Tipo de referencia', number: 'Referencia del embarque',
  placeholder: 'Ingresa la referencia', search: 'Buscar embarque', required: 'Ingresa una referencia para continuar.',
  unavailable: 'El seguimiento en línea aún no está disponible',
  demoLabel: 'DEMO · Embarque ficticio', result: 'Resumen del embarque',
  origin: 'Origen', destination: 'Destino', status: 'Estado',
  estimatedDeparture: 'Salida estimada de prueba', estimatedArrival: 'Llegada estimada de prueba',
  progress: 'Avance ilustrativo', loading: 'Buscando embarque de prueba…', viewRoute: 'Ver ruta en el globo',
  demoNotice: 'Datos ficticios. El marcador de avance no es GPS ni representa la ubicación real de un embarque.',
  notFound: 'No se encontró el embarque de prueba', notFoundInfo: 'Verificá el tipo de referencia y el código de demostración.',
  invalid: 'Ingresá de 3 a 64 letras, números, guiones o guiones bajos.',
  limited: 'Demasiadas consultas. Intentá de nuevo dentro de un momento.',
  failed: 'No se pudo conectar con el rastreo de prueba. Revisá el backend e intentá nuevamente.',
  explanation: 'Por ahora no podemos consultar movimientos en tiempo real. Contacta a Castro Fallas e incluye la referencia para recibir asistencia.',
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

// The guide is opt-in: auto-opening its overlay can intercept mobile select taps.
onMounted(() => {
  window.addEventListener('keydown', handleGuideKeydown, true)
})

onBeforeUnmount(() => {
  lookupRevision++
  window.removeEventListener('keydown', handleGuideKeydown, true)
  tour?.destroy()
})
</script>

<template>
  <div class="app-site tracking-site">
    <SiteHeader active="embarque" />
    <main class="tracking-page">
      <div class="container tracking-content">
        <a class="back-link" href="/home#embarque">{{ copy.back }}</a>
        <section ref="globeSection" class="tracking-intro">
          <div class="tracking-copy tracking-intro__copy">
            <p class="section-tag">{{ copy.eyebrow }}</p>
            <h1>{{ copy.title }} <span>{{ copy.accent }}</span></h1>
            <p class="tracking-lead">{{ copy.intro }}</p>
          </div>
          <WorldGlobe :shipment="shipment" />
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
              <div id="tracking-guide-type" class="tracking-field">
                <label for="tracking-reference-kind">{{ copy.type }}</label>
                <FieldDropdown
                  id="tracking-reference-kind"
                  v-model="kind"
                  :aria-label="copy.type"
                  :options="types.map(item => ({ value: item.id, label: item.name }))"
                />
              </div>
              <div id="tracking-guide-reference" class="tracking-field">
                <label for="tracking-reference-input">{{ copy.number }}</label>
                <input id="tracking-reference-input" v-model="reference" maxlength="64" autocomplete="off" :placeholder="copy.placeholder" required />
              </div>
            </div>
            <p class="tracking-hint">{{ help }}</p>
            <p v-if="searched && !reference.trim()" class="tracking-error" role="alert">{{ copy.required }}</p>
            <button id="tracking-guide-submit" type="submit" class="btn btn-primary tracking-submit" :disabled="loading" :aria-busy="loading">{{ loading ? copy.loading : copy.search }} <IconSymbol glyph="→" /></button>
            <p v-if="loading" class="tracking-hint" role="status">{{ copy.loading }}</p>
            <section v-else-if="shipment" class="tracking-demo-result" role="status" aria-live="polite">
              <div class="tracking-demo-result__heading">
                <div>
                  <span class="tracking-demo-result__label">{{ copy.demoLabel }}</span>
                  <h3>{{ copy.result }} · {{ shipment.referenceCode }}</h3>
                </div>
                <strong class="tracking-demo-result__status">{{ statusLabels[shipment.status] ?? shipment.status }}</strong>
              </div>
              <dl class="tracking-demo-result__grid">
                <div><dt>{{ copy.origin }}</dt><dd>{{ shipment.origin.name }}</dd></div>
                <div><dt>{{ copy.destination }}</dt><dd>{{ shipment.destination.name }}</dd></div>
                <div><dt>{{ copy.estimatedDeparture }}</dt><dd>{{ formatDate(shipment.etd) }}</dd></div>
                <div><dt>{{ copy.estimatedArrival }}</dt><dd>{{ formatDate(shipment.eta) }}</dd></div>
              </dl>
              <div class="tracking-demo-result__progress">
                <div><strong>{{ copy.progress }}</strong><span>{{ shipment.progressPercent }}%</span></div>
                <div class="tracking-demo-result__track" role="progressbar" :aria-label="copy.progress"
                  :aria-valuenow="shipment.progressPercent" aria-valuemin="0" aria-valuemax="100">
                  <span :style="{ width: shipment.progressPercent + '%' }"></span>
                </div>
              </div>
              <p class="tracking-demo-result__disclaimer">{{ copy.demoNotice }}</p>
              <button type="button" class="tracking-demo-result__view" @click="showDemoRoute">{{ copy.viewRoute }} ↑</button>
            </section>
            <div v-else-if="searched && reference.trim()" class="tracking-unavailable" role="status">
              <strong>{{ lookupFailure === 'missing' ? copy.notFound : copy.unavailable }}</strong>
              <p>{{ lookupFailure === 'missing' ? copy.notFoundInfo : lookupFailure === 'invalid' ? copy.invalid : lookupFailure === 'limited' ? copy.limited : copy.failed }}</p>
              <p>{{ copy.explanation }}</p>
              <a :href="mailto">{{ copy.contact }} <IconSymbol glyph="↗" /></a>
            </div>
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
.tracking-fields .tracking-field { display:grid; gap:9px; min-width:0; }
.tracking-fields label { display:block; min-width:0; font-weight:700; font-size:14px; overflow-wrap:break-word; }
/* Reuse the exact same light/dark dropdown styling and popup placement
   as Itinerarios and Administración. Only match the tracking field height. */
.tracking-fields .cf-dropdown__trigger { min-height:52px; }
.tracking-fields input,.tracking-fields select { box-sizing: border-box; width: 100%; min-width:0; max-width:100%; min-height: 52px; padding: 12px; border: 1px solid #96969b7d; border-radius: 12px; color: var(--track-ink); background: var(--track-surface); font: inherit; }
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
  .tracking-fields{grid-template-columns:minmax(0,1fr);gap:20px;margin-top:22px}
  .tracking-field{min-width:0}
  .tracking-fields label{font-size:14px;line-height:1.4}
  .tracking-fields :is(input,select){min-height:54px;padding:13px 15px;font-size:16px;line-height:1.35}
  .tracking-fields .cf-dropdown__trigger{min-height:54px;padding:13px 15px;font-size:16px}
  .tracking-search .tracking-hint{overflow-wrap:break-word;line-height:1.55}
  .tracking-search .tracking-fields + .tracking-hint{margin:22px 0 0}
  .tracking-top > div{min-width:0}
  .tracking-top h2{overflow-wrap:break-word;font-size:clamp(24px,6.5vw,32px)}
  .tracking-guide-button{min-height:48px}
  .tracking-submit{min-height:54px;margin-top:24px}
  .tracking-process{padding:24px 20px;border-radius:23px}
  .tracking-process__steps{grid-template-columns:1fr;gap:20px;margin-top:28px}
  .tracking-process__steps li{display:grid;grid-template-columns:40px 1fr;gap:12px;padding-top:17px}
}

</style>

<style scoped>
.tracking-demo-result {
  margin-top: 24px; padding: clamp(18px,3vw,26px); border: 1px solid #b5092845;
  border-radius: 20px; background: var(--track-surface, #fff); color: inherit;
  box-shadow: 0 12px 32px #4b142110;
}
.tracking-demo-result__heading { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; }
.tracking-demo-result__label { display:inline-block; margin-bottom:10px; font-size:11px; font-weight:800; letter-spacing:.06em; color:#b50928; }
.tracking-demo-result__heading h3 { margin:0; font-size:clamp(16px,2vw,21px); line-height:1.35; overflow-wrap:anywhere; }
.tracking-demo-result__status { padding:7px 11px; border-radius:20px; font-size:12px; background:#b5092817; color:#b50928; }
.tracking-demo-result__grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:19px 24px; margin:22px 0; }
.tracking-demo-result__grid div { min-width:0; }
.tracking-demo-result__grid dt { font-size:12px; opacity:.75; font-weight:700; }
.tracking-demo-result__grid dd { margin:6px 0 0; font-size:14px; font-weight:750; overflow-wrap:anywhere; }
.tracking-demo-result__progress > div:first-child { display:flex; justify-content:space-between; gap:14px; margin:0 0 8px; font-size:13px; }
.tracking-demo-result__track { height:11px; overflow:hidden; border-radius:12px; background:#a3a3a34a; }
.tracking-demo-result__track span { display:block; height:100%; border-radius:12px; background:#b50928; transition:width .5s ease; }
.tracking-demo-result__disclaimer { margin:17px 0 0; font-size:12px; line-height:1.65; opacity:.85; }
@media(max-width:580px) {
  .tracking-demo-result__grid { grid-template-columns:minmax(0,1fr); }
  .tracking-demo-result__heading { flex-direction:column; }
}
@media(prefers-reduced-motion:reduce) { .tracking-demo-result__track span { transition:none; } }
:global(html.theme-dark) .tracking-demo-result__label,
:global(html.theme-dark) .tracking-demo-result__status { color:#ff8697; }
:global(html.theme-dark) .tracking-demo-result__status { background:#b509283a; }
</style>

<style scoped>
.tracking-demo-result__view { margin-top:14px; border:1px solid #b50928; border-radius:12px; padding:10px 15px; background:transparent; color:#b50928; font-weight:750; cursor:pointer; }
.tracking-demo-result__view:focus-visible { outline:2px solid #b50928; outline-offset:3px; }
:global(html.theme-dark) .tracking-demo-result__view { color:#ff8697; border-color:#ff8697; }
</style>
