<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import IconSymbol from '../components/IconSymbol.vue'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import WorldGlobe from '../components/WorldGlobe.vue'
import { illustrativeRoute } from '../lib/trackingRoute'
import { formatTrackingEquipmentCount, localizeTrackingMode, localizeTrackingStatus } from '../lib/trackingDisplay'
import FieldDropdown from '../components/FieldDropdown.vue'
interface DynamicsShipment {
  title: string | null
  status: string | null
  origin: string | null
  destination: string | null
  mode: string | null
  portOfLoading: string | null
  portOfEntry: string | null
  etd: string | null
  eta: string | null
  vessel: string | null
  container: string | null
  bcf: string | null
  updatedAtUtc: string | null
  customerStatus: string | null
  incoterm: string | null
  equipmentSize: string | null
  equipmentCount: string | null
  departureConfirmedAt: string | null
  warehouseReceivedAt: string | null
  destinationEta: string | null
  officializedAt: string | null
  entryAt: string | null
  po: string | null
  packageCount: string | null
  commodity: string | null
  seal: string | null
  invoice: string | null
  companyInvoice: string | null
  shipper: string | null
  customerInstructions: string | null
}
interface LookupResponse {
  source: 'dynamics'
  records: DynamicsShipment[]
  truncated: boolean
}

const { locale } = useI18n({ useScope: 'global' })
const en = computed(() => locale.value.toLowerCase().startsWith('en'))
const localVisualPreview = ['localhost', '127.0.0.1'].includes(window.location.hostname) &&
  new URLSearchParams(window.location.search).get('previewTracking') === '1'
const localPreviewShipment: DynamicsShipment = {
  title: 'Vista de ejemplo', status: 'Carga en Bodega HUB Panamá', origin: 'Qingdao, China', destination: 'San José, Costa Rica',
  mode: 'Marítimo', portOfLoading: 'Qingdao, China', portOfEntry: 'Puerto Caldera, Costa Rica',
  etd: '2026-11-13', eta: '2026-12-23', vessel: 'Buque de muestra', container: 'CONTENEDOR-DEMO',
  bcf: 'REFERENCIA-DEMO', updatedAtUtc: '2026-11-03', customerStatus: null, incoterm: null,
  equipmentSize: 'LCL', equipmentCount: 'LCL', departureConfirmedAt: null, warehouseReceivedAt: null,
  destinationEta: null, officializedAt: null, entryAt: null, po: null, packageCount: null,
  commodity: null, seal: null, invoice: null, companyInvoice: null, shipper: null, customerInstructions: null
}
// Display-only translations for known Dynamics values; never mutate the shipment.
const displayMode = (value: string | null) => localizeTrackingMode(value, en.value ? 'en' : 'es')
const displayStatus = (value: string | null) => localizeTrackingStatus(value, en.value ? 'en' : 'es')
const kind = ref('BL')
const reference = ref('')
const searched = ref(localVisualPreview)
const loading = ref(false)
const shipment = ref<DynamicsShipment | null>(localVisualPreview ? localPreviewShipment : null)
const matches = ref<DynamicsShipment[]>(localVisualPreview ? [localPreviewShipment] : [])
const selectedIndex = ref(0)
const truncated = ref(false)

// The reference and the original Dynamics note are never modified. Unknown
// customer notes are translated asynchronously via the authenticated backend.
const customerUpdateTranslations = ref<Record<string, string>>({})
const customerUpdateText = computed(() => {
  const source = shipment.value?.customerStatus?.trim()
  if (!source) return ''
  const language = en.value ? 'en' : 'es'
  const local = localizeTrackingStatus(source, language)
  if (local !== source || localizeTrackingStatus(source, language === 'en' ? 'es' : 'en') !== source)
    return local
  return customerUpdateTranslations.value[language + ':' + source] ?? source
})
watch([() => shipment.value?.customerStatus, en], ([raw, english], _previous, onCleanup) => {
  const source = raw?.trim()
  if (!source) return
  // Exact known logistics statuses are handled locally in both languages.
  if (localizeTrackingStatus(source, 'es') !== source ||
      localizeTrackingStatus(source, 'en') !== source) return
  const language = english ? 'en' : 'es'
  const key = language + ':' + source
  if (customerUpdateTranslations.value[key]) return
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  void (async () => {
    try {
      const response = await fetch('/api/tracking/dynamics/customer-status/translate', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: source, language }),
        cache: 'no-store',
        signal: controller.signal
      })
      if (!response.ok) return // Retain the Dynamics message if AI is unavailable.
      const translated: unknown = await response.json()
      if (!translated || typeof translated !== 'object' || !('translation' in translated))
        return
      const value = (translated as { translation: unknown }).translation
      if (typeof value !== 'string' || !value.trim() || value.length > 768) return
      customerUpdateTranslations.value = { ...customerUpdateTranslations.value, [key]: value.trim() }
    } catch {
      // Network failures never block lookup or hide the original update.
    }
  })()
}, { immediate: true })

const globeRoute = computed(() => shipment.value ? illustrativeRoute(shipment.value) : null)
function normalizeJourneyStatus(value: string | null | undefined) {
  return value?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[-_\/]+/g, ' ').replace(/\s+/g, ' ').trim() ?? ''
}
function stageForKnownStatus(value: string | null | undefined): number | null {
  const status = normalizeJourneyStatus(value)
  if (!status) return null

  // Only statuses with an unambiguous logistics meaning advance the visual journey.
  // In particular, "Archivado" can mean different things for different operation
  // types, so it remains visible as received and is not treated as completed here.
  if ([
    'finalizado', 'completado', 'completed', 'entregado', 'delivered',
    'colocacion crc', 'carga en pto entrada', 'carga en pto. entrada',
    'carga en almacen destino', 'carga en almacen de destino',
    'carga en almacen destino cr', 'carga en almacen de destino cr',
    'carga en almacen destino costa rica'
  ].includes(status)) return 2

  if ([
    'movimiento panama to crc',
    'carga en bodega hub panama', 'carga en estacionamiento transitorio',
    'carga en pto salida', 'carga en pto. salida', 'pendiente descarga pty'
  ].includes(status)) return 1

  if ([
    'booking listo', 'booking ready', 'control de inventarios', 'carga whs origen',
    'picking carga', 'coordinacion origen', 'preliquidacion',
    'pre liquidacion', 'programado', 'scheduled', 'en proceso', 'in progress'
  ].includes(status)) return 0

  return null
}
const journeyStage = computed(() => stageForKnownStatus(shipment.value?.status))
const journeySteps = computed(() => en.value
  ? [{ label: 'Preparation', icon: '▤' }, { label: 'In transit', icon: 'ship' }, { label: 'At destination', icon: '⌖' }]
  : [{ label: 'Preparación', icon: '▤' }, { label: 'En ruta', icon: 'ship' }, { label: 'En destino', icon: '⌖' }])
function chooseMatch(next: number) {
  if (next < 0 || next >= matches.value.length) return
  selectedIndex.value = next
  shipment.value = matches.value[next]
}
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
  if (localVisualPreview) return
  lookupRevision++
  searched.value = false
  loading.value = false
  shipment.value = null
  matches.value = []
  selectedIndex.value = 0
  truncated.value = false
  lookupFailure.value = 'none'
})
async function searchShipment() {
  const revision = ++lookupRevision
  const code = reference.value.trim()
  searched.value = true
  shipment.value = null
  matches.value = []
  selectedIndex.value = 0
  truncated.value = false
  lookupFailure.value = 'none'
  if (!code) return
  if (!/^[a-z0-9_-]{3,64}$/i.test(code)) {
    lookupFailure.value = 'invalid'
    return
  }
  loading.value = true
  try {
    const response = await fetch('/api/tracking/dynamics/search', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: kind.value, reference: code }),
      cache: 'no-store'
    })
    if (revision !== lookupRevision) return
    if (response.status === 429) { lookupFailure.value = 'limited'; return }
    if (response.status === 400) { lookupFailure.value = 'invalid'; return }
    if (!response.ok) { lookupFailure.value = 'error'; return }
    const data = await response.json() as LookupResponse
    if (revision !== lookupRevision) return
    if (data.source !== 'dynamics' || !Array.isArray(data.records)) throw new Error('Unexpected tracking response')
    matches.value = data.records
    truncated.value = data.truncated === true
    if (data.records.length > 0) shipment.value = data.records[0]
    else lookupFailure.value = 'missing'
  } catch {
    if (revision === lookupRevision) lookupFailure.value = 'error'
  } finally {
    if (revision === lookupRevision) loading.value = false
  }
}
function formatDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(en.value ? 'en-US' : 'es-CR', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
  }).format(date)
}
interface ShipmentExtraField { label: string; value: string }
function formatEquipmentConfiguration(count: string | null, size: string | null) {
  const quantity = formatTrackingEquipmentCount(count)?.trim() ?? ''
  const equipmentSize = size?.trim() ?? ''
  if (!quantity) return equipmentSize || null
  if (!equipmentSize) return quantity

  // A configured value may already contain its own quantity × size notation.
  if (/\d\s*[x×]\s*\d/i.test(quantity)) return quantity
  return `${quantity} x ${equipmentSize}`
}
const shipmentExtras = computed<ShipmentExtraField[]>(() => {
  const data = shipment.value
  if (!data) return []
  const asDate = (value: string | null) => value ? formatDate(value) : null
  const fields: { es: string; en: string; value: string | null }[] = [
    { es: 'Incoterm', en: 'Incoterm', value: data.incoterm },
    { es: 'Cantidad x tamaño de equipo', en: 'Equipment quantity x size', value: formatEquipmentConfiguration(data.equipmentCount, data.equipmentSize) },
    { es: 'Confirmación de zarpe', en: 'Departure confirmation', value: asDate(data.departureConfirmedAt) },
    { es: 'Ingreso a bodegas', en: 'Warehouse arrival', value: asDate(data.warehouseReceivedAt) },
    { es: 'ETA en destino', en: 'Destination ETA', value: asDate(data.destinationEta) },
    { es: 'Fecha de oficialización', en: 'Customs formalization date', value: asDate(data.officializedAt) },
    { es: 'Registro de ingreso', en: 'Entry record', value: data.entryAt },
    { es: 'PO', en: 'PO', value: data.po },
    { es: 'Mercancía', en: 'Commodity', value: data.commodity },
    { es: 'Cantidad de bultos', en: 'Package count', value: data.packageCount },
    { es: 'Sello del contenedor', en: 'Container seal', value: data.seal },
    { es: 'Factura', en: 'Invoice', value: data.invoice },
    { es: 'Factura de compañía', en: 'Company invoice', value: data.companyInvoice },
    { es: 'Remitente', en: 'Shipper', value: data.shipper },
    { es: 'Instrucciones del cliente', en: 'Customer instructions', value: data.customerInstructions }
  ]
  return fields
    .filter(field => field.value?.trim() && !/^[\s/]+$/.test(field.value))
    .map(field => ({ label: en.value ? field.en : field.es, value: field.value ?? '' }))
})
// Pair optional Dynamics fields in the same order as the main shipment summary.
const shipmentExtrasPairs = computed<ShipmentExtraField[][]>(() => {
  const fields = shipmentExtras.value
  const rows: ShipmentExtraField[][] = []
  for (let index = 0; index < fields.length; index += 2) rows.push(fields.slice(index, index + 2))
  return rows
})
function iconForShipmentField(label: string) {
  const key = label.toLowerCase()
  if (/origen|destino|puerto|origin|destination|port|bodega|warehouse/.test(key)) return '⌖'
  if (/transporte|transport|mode/.test(key)) return 'truck'
  if (/estado|status|incoterm/.test(key)) return '✓'
  if (/fecha|date|eta|etd|actualiz|updated|confirm|zarpe|arrival|ingreso|registro/.test(key)) return '◷'
  if (/buque|vessel|barco/.test(key)) return 'ship'
  if (/contenedor|container|equipo/.test(key)) return 'container'
  if (/bulto|package|cantidad|quantity/.test(key)) return '▰'
  return '▤'
}
let tour: Driver | null = null
const types = computed(() => en.value ? [
  { id: 'BL', name: 'BL-HBL number (BCF)', help: 'Search BL or HBL using the BCF reference.' },
  { id: 'IDTRA', name: 'IDTRA', help: 'Castro Fallas tracking identifier.' },
  { id: 'CONTAINER', name: 'Container number', help: 'Shipping container identifier.' },
  { id: 'PO', name: 'Purchase order (PO)', help: 'Linked purchase order reference.' }
] : [
  { id: 'BL', name: 'Número BL-HBL (BCF)', help: 'Consultá tu BL o HBL mediante la referencia BCF.' },
  { id: 'IDTRA', name: 'IDTRA', help: 'Identificador de seguimiento Castro Fallas.' },
  { id: 'CONTAINER', name: 'Número de contenedor', help: 'Identificador del contenedor.' },
  { id: 'PO', name: 'Orden de compra (PO)', help: 'Orden de compra vinculada.' }
])
const help = computed(() => types.value.find(item => item.id === kind.value)?.help ?? '')
const copy = computed(() => en.value ? {
  eyebrow: 'CASTRO FALLAS · INTERNATIONAL CARGO', title: 'Track your', accent: 'shipment.',
  intro: 'Search real shipment information by your registered reference. Routes shown on the globe are illustrative.',
  heading: 'Find your shipment', hint: 'Choose the reference type shown on your shipping documents.',
  guide: 'Step-by-step guide', type: 'Reference type', number: 'Shipment reference',
  placeholder: 'Enter reference', search: 'Search shipment', required: 'Enter a reference to continue.',
  unavailable: 'Tracking temporarily unavailable',
  demoLabel: 'DYNAMICS · SHIPMENT', result: 'Shipment summary',
  origin: 'Origin', destination: 'Destination', status: 'Status',
  estimatedDeparture: 'Estimated departure', estimatedArrival: 'Estimated arrival',
  progress: 'Logistics details', loading: 'Searching shipments…', viewRoute: 'View route on globe',
  demoNotice: 'Illustrative route only, not a live GPS position or verified vessel track.',
  notFound: 'No shipment found', notFoundInfo: 'Check the reference type and code.',
  invalid: 'Enter 3–64 letters, digits, hyphens or underscores.',
  limited: 'Too many searches. Please retry shortly.',
  failed: 'Tracking is temporarily unavailable. Try again later.',
  explanation: 'For more information, contact Castro Fallas with your reference.',
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
  intro: 'Consultá información de embarques desde Dynamics. Las rutas del globo son ilustrativas.',
  heading: 'Busca tu embarque', hint: 'Selecciona el tipo de referencia que aparece en los documentos.',
  guide: 'Guía paso a paso', type: 'Tipo de referencia', number: 'Referencia del embarque',
  placeholder: 'Ingresa la referencia', search: 'Buscar embarque', required: 'Ingresa una referencia para continuar.',
  unavailable: 'Rastreo temporalmente no disponible',
  demoLabel: 'DYNAMICS · EMBARQUE', result: 'Resumen del embarque',
  origin: 'Origen', destination: 'Destino', status: 'Estado',
  estimatedDeparture: 'Salida estimada', estimatedArrival: 'Llegada estimada',
  progress: 'Detalles de operación', loading: 'Buscando embarque…', viewRoute: 'Ver ruta en el globo',
  demoNotice: 'Recorrido ilustrativo: no representa GPS ni la ubicación actual del barco.',
  notFound: 'No se encontró el embarque', notFoundInfo: 'Revisá el tipo de referencia y el código.',
  invalid: 'Ingresá de 3 a 64 letras, números, guiones o guiones bajos.',
  limited: 'Demasiadas consultas. Intentá de nuevo dentro de un momento.',
  failed: 'El rastreo está temporalmente no disponible. Intentá más tarde.',
  explanation: 'Para más información, contactá a Castro Fallas con tu referencia.',
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
          <WorldGlobe :shipment="globeRoute" :initial-zoom="0.8" />
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
            <p v-if="!localVisualPreview" class="tracking-hint">{{ help }}</p>
            <p v-if="searched && !reference.trim() && !localVisualPreview" class="tracking-error" role="alert">{{ copy.required }}</p>
            <button id="tracking-guide-submit" type="submit" class="btn btn-primary tracking-submit" :disabled="loading" :aria-busy="loading">{{ loading ? copy.loading : copy.search }} <IconSymbol glyph="→" /></button>
            <p v-if="loading" class="tracking-hint" role="status">{{ copy.loading }}</p>
            <section v-else-if="shipment" class="tracking-demo-result" role="status" aria-live="polite">
              <div class="tracking-demo-result__heading">
                <div>
                  <span class="tracking-demo-result__label">{{ localVisualPreview ? (en ? 'LOCAL PREVIEW · SAMPLE DATA' : 'VISTA LOCAL · DATOS DE EJEMPLO') : copy.demoLabel }}</span>
                  <h3>{{ copy.result }} · {{ shipment.title || reference.trim() }}</h3>
                </div>
                <strong class="tracking-demo-result__status">{{ displayStatus(shipment.status) }}</strong>
              </div>
              <div v-if="matches.length > 1" class="tracking-results-select">
                <strong>{{ en ? 'Matching shipments' : 'Embarques encontrados' }}: {{ selectedIndex + 1 }} / {{ matches.length }}</strong>
                <div>
                  <button type="button" :disabled="selectedIndex === 0" @click="chooseMatch(selectedIndex - 1)">{{ en ? 'Previous' : 'Anterior' }}</button>
                  <button type="button" :disabled="selectedIndex >= matches.length - 1" @click="chooseMatch(selectedIndex + 1)">{{ en ? 'Next' : 'Siguiente' }}</button>
                </div>
              </div>
              <p v-if="truncated" class="tracking-hint">{{ en ? 'Additional matches may be available.' : 'Podrían existir más coincidencias.' }}</p>
              <p v-if="shipment.customerStatus" class="tracking-demo-result__customer-status">
                <strong>{{ en ? 'Customer update' : 'Actualización para el cliente' }}</strong>
                <span>{{ customerUpdateText }}</span>
              </p>
              <div class="tracking-demo-result__route" :aria-label="en ? 'Shipment route' : 'Ruta del embarque'">
                <div class="tracking-demo-result__route-stop">
                  <span class="tracking-demo-result__route-icon"><IconSymbol glyph="⌖" :size="19" /></span>
                  <div><span>{{ copy.origin }}</span><strong>{{ shipment.origin || '—' }}</strong></div>
                </div>
                <span class="tracking-demo-result__route-connector" aria-hidden="true"><IconSymbol glyph="→" :size="19" /></span>
                <div class="tracking-demo-result__route-stop tracking-demo-result__route-stop--destination">
                  <span class="tracking-demo-result__route-icon"><IconSymbol glyph="⌖" :size="19" /></span>
                  <div><span>{{ copy.destination }}</span><strong>{{ shipment.destination || '—' }}</strong></div>
                </div>
              </div>
              <section v-if="journeyStage !== null" class="tracking-journey" :aria-label="en ? 'Shipment journey' : 'Recorrido del embarque'">
                <div class="tracking-journey__heading">
                  <div><span>{{ en ? 'LIVE JOURNEY' : 'RECORRIDO DEL EMBARQUE' }}</span><strong>{{ en ? 'Current stage' : 'Etapa actual' }}</strong></div>
                  <small>{{ journeySteps[journeyStage].label }}</small>
                </div>
                <div class="tracking-journey__steps" :style="{ '--journey-progress': journeyStage === 0 ? '0%' : journeyStage === 1 ? '33.333%' : '66.666%' }">
                  <span class="tracking-journey__rail" aria-hidden="true"></span>
                  <span class="tracking-journey__progress" aria-hidden="true"></span>
                  <div v-for="(step, index) in journeySteps" :key="step.label" class="tracking-journey__step" :class="{ 'is-complete': index < journeyStage, 'is-current': index === journeyStage }">
                    <span class="tracking-journey__node"><IconSymbol :glyph="index < journeyStage ? '✓' : step.icon" :size="17" /></span>
                    <span>{{ step.label }}</span>
                  </div>
                </div>
              </section>
              <div class="tracking-demo-result__grid">
                <div class="tracking-demo-result__pair">
                  <dl class="tracking-demo-result__field"><span class="tracking-demo-result__field-icon"><IconSymbol glyph="truck" :size="17" /></span><dt>{{ en ? 'Transport' : 'Transporte' }}</dt><dd>{{ displayMode(shipment.mode) }}</dd></dl>
                  <dl class="tracking-demo-result__field"><span class="tracking-demo-result__field-icon"><IconSymbol glyph="✓" :size="17" /></span><dt>{{ copy.status }}</dt><dd>{{ displayStatus(shipment.status) }}</dd></dl>
                </div>
                <div class="tracking-demo-result__pair">
                  <dl class="tracking-demo-result__field"><span class="tracking-demo-result__field-icon"><IconSymbol glyph="⚓" :size="17" /></span><dt>{{ en ? 'Port of loading' : 'Puerto de salida' }}</dt><dd>{{ shipment.portOfLoading || '—' }}</dd></dl>
                  <dl class="tracking-demo-result__field"><span class="tracking-demo-result__field-icon"><IconSymbol glyph="⚓" :size="17" /></span><dt>{{ en ? 'Port of entry' : 'Puerto de entrada' }}</dt><dd>{{ shipment.portOfEntry || '—' }}</dd></dl>
                </div>
                <div class="tracking-demo-result__pair">
                  <dl class="tracking-demo-result__field"><span class="tracking-demo-result__field-icon"><IconSymbol glyph="◷" :size="17" /></span><dt>{{ copy.estimatedDeparture }}</dt><dd>{{ formatDate(shipment.etd) }}</dd></dl>
                  <dl class="tracking-demo-result__field"><span class="tracking-demo-result__field-icon"><IconSymbol glyph="◷" :size="17" /></span><dt>{{ copy.estimatedArrival }}</dt><dd>{{ formatDate(shipment.eta) }}</dd></dl>
                </div>
                <div class="tracking-demo-result__pair">
                  <dl class="tracking-demo-result__field"><span class="tracking-demo-result__field-icon"><IconSymbol glyph="ship" :size="17" /></span><dt>{{ en ? 'Vessel' : 'Buque' }}</dt><dd>{{ shipment.vessel || '—' }}</dd></dl>
                  <dl class="tracking-demo-result__field"><span class="tracking-demo-result__field-icon"><IconSymbol glyph="container" :size="17" /></span><dt>{{ en ? 'Container' : 'Contenedor' }}</dt><dd>{{ shipment.container || '—' }}</dd></dl>
                </div>
                <div class="tracking-demo-result__pair">
                  <dl class="tracking-demo-result__field"><span class="tracking-demo-result__field-icon"><IconSymbol glyph="▤" :size="17" /></span><dt>BCF</dt><dd>{{ shipment.bcf || '—' }}</dd></dl>
                  <dl class="tracking-demo-result__field"><span class="tracking-demo-result__field-icon"><IconSymbol glyph="◷" :size="17" /></span><dt>{{ en ? 'Last updated' : 'Última actualización' }}</dt><dd>{{ formatDate(shipment.updatedAtUtc) }}</dd></dl>
                </div>
              </div>
              <section v-if="shipmentExtras.length" class="tracking-demo-result__extra">
                <h4>{{ en ? 'Additional shipment details' : 'Información adicional del embarque' }}</h4>
                <div class="tracking-demo-result__grid">
                  <div v-for="(pair, index) in shipmentExtrasPairs" :key="index" class="tracking-demo-result__pair">
                    <dl v-for="field in pair" :key="field.label" class="tracking-demo-result__field">
                      <span class="tracking-demo-result__field-icon"><IconSymbol :glyph="iconForShipmentField(field.label)" :size="17" /></span>
                      <dt>{{ field.label }}</dt><dd>{{ field.value }}</dd>
                    </dl>
                  </div>
                </div>
              </section>
              <p class="tracking-demo-result__disclaimer">
                {{ globeRoute ? copy.demoNotice :
                  (en ? 'Approximate route unavailable for these locations. The globe stays in its default view.' : 'No hay una ruta aproximada reconocida para estos lugares. El globo mantiene su vista predeterminada.') }}
              </p>
              <button v-if="globeRoute" type="button" class="tracking-demo-result__view" @click="showDemoRoute">{{ copy.viewRoute }} ↑</button>
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
.tracking-fields :deep(.cf-dropdown__trigger) { min-height:52px; }
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
  .tracking-fields :deep(.cf-dropdown__trigger){min-height:54px;padding:13px 15px;font-size:16px}
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
  --tracking-detail-divider: rgba(130, 47, 62, .17);
  margin-top: 24px; padding: clamp(18px,3vw,26px); border: 1px solid #b5092845;
  border-radius: 20px; background: var(--track-surface, #fff); color: inherit;
  box-shadow: 0 12px 32px #4b142110;
}
.tracking-demo-result__heading { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; }
.tracking-demo-result__label { display:inline-block; margin-bottom:10px; font-size:11px; font-weight:800; letter-spacing:.06em; color:#b50928; }
.tracking-demo-result__heading h3 { margin:0; font-size:clamp(16px,2vw,21px); line-height:1.35; overflow-wrap:anywhere; }
.tracking-demo-result__status { padding:7px 11px; border-radius:20px; font-size:12px; background:#b5092817; color:#b50928; }
/* Each visual row is one non-interactive glass surface with two related details. */
.tracking-demo-result__grid {
  display:grid; grid-template-columns:minmax(0,1fr); gap:12px; margin:22px 0;
}
.tracking-demo-result__pair {
  --tracking-glass-divider:rgba(91,105,125,.18);
  --tracking-pair-spacing:clamp(8px,1.5vw,16px);
  position:relative; display:grid; grid-template-columns:repeat(2,minmax(0,1fr));
  align-items:center; column-gap:0; min-width:0;
  padding:clamp(13px,1.8vw,19px) clamp(16px,2.5vw,26px);
  overflow:hidden; border-radius:18px; border:1px solid rgba(255,255,255,.6);
  background:rgba(255,255,255,.18);
  -webkit-backdrop-filter:blur(12px); backdrop-filter:blur(12px);
  box-shadow:0 8px 32px rgba(0,0,0,.1),inset 0 1px 0 rgba(255,255,255,.32),inset 0 -1px 0 rgba(255,255,255,.1);
  cursor:default;
}
.tracking-demo-result__pair::before {
  content:''; position:absolute; top:0; left:0; right:0; height:1px; pointer-events:none;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.8),transparent);
}
.tracking-demo-result__pair::after {
  content:''; position:absolute; top:0; left:0; width:1px; height:100%; pointer-events:none;
  background:linear-gradient(180deg,rgba(255,255,255,.8),transparent,rgba(255,255,255,.3));
}
.tracking-demo-result__field { min-width:0; margin:0; }
.tracking-demo-result__field:first-child:not(:only-child) {
  padding-right:var(--tracking-pair-spacing);
}
.tracking-demo-result__field + .tracking-demo-result__field {
  border-left:1px solid var(--tracking-glass-divider);
  padding-left:var(--tracking-pair-spacing);
}
.tracking-demo-result__field:only-child { grid-column:1/-1; }
.tracking-demo-result__field dt {
  font-size:12px; color:var(--track-muted); font-weight:700; line-height:1.4;
  overflow-wrap:anywhere;
}
.tracking-demo-result__field dd {
  margin:6px 0 0; font-size:clamp(14px,1.15vw,16px); line-height:1.45;
  font-weight:750; overflow-wrap:anywhere;
}
.tracking-demo-result__progress > div:first-child { display:flex; justify-content:space-between; gap:14px; margin:0 0 8px; font-size:13px; }
.tracking-demo-result__track { height:11px; overflow:hidden; border-radius:12px; background:#a3a3a34a; }
.tracking-demo-result__track span { display:block; height:100%; border-radius:12px; background:#b50928; transition:width .5s ease; }
.tracking-demo-result__disclaimer { margin:17px 0 0; font-size:12px; line-height:1.65; opacity:.85; }
@media(max-width:580px) {
  .tracking-demo-result__grid { gap:10px; }
  .tracking-demo-result__pair { --tracking-pair-spacing:12px; column-gap:0; padding:13px 14px; border-radius:14px; }
  .tracking-demo-result__field dt { font-size:11px; }
  .tracking-demo-result__field dd { font-size:13px; }
  .tracking-demo-result__heading { flex-direction:column; }
}
@media(prefers-reduced-motion:reduce) { .tracking-demo-result__track span { transition:none; } }
:global(html.theme-dark) .tracking-demo-result__label,
:global(html.theme-dark) .tracking-demo-result__status { color:#ff8697; }
:global(html.theme-dark) .tracking-demo-result__status { background:#b509283a; }
/* Dark theme: match the tracking FieldDropdown trigger.
   Solid navy fill, neutral blue-gray border, no glass highlights or glow. */
:global(html.theme-dark .app-site.tracking-site .tracking-demo-result) {
  --tracking-glass-navy:#01081D;
  background:transparent !important;
  background-image:none !important;
  border-color:rgba(77,101,133,.35) !important;
  box-shadow:none !important;
}
:global(html.theme-dark .app-site.tracking-site .tracking-demo-result__pair) {
  --tracking-glass-divider:#3b465f;
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  align-items:center;
  column-gap:0;
  padding:clamp(13px,1.8vw,19px) clamp(16px,2.5vw,26px);
  overflow:hidden;
  border-radius:18px;
  border:1px solid #4f5365 !important;
  background:#060f21 !important;
  background-image:none !important;
  -webkit-backdrop-filter:none !important;
  backdrop-filter:none !important;
  box-shadow:none !important;
}
:global(html.theme-dark .app-site.tracking-site .tracking-demo-result__field) {
  min-width:0;
  margin:0 !important;
  padding:0 !important;
  border:0 !important;
  border-radius:0 !important;
  background:transparent !important;
  box-shadow:none !important;
}
:global(html.theme-dark .app-site.tracking-site .tracking-demo-result__field:first-child:not(:only-child)) {
  padding-right:var(--tracking-pair-spacing) !important;
}
:global(html.theme-dark .app-site.tracking-site .tracking-demo-result__field + .tracking-demo-result__field) {
  padding-left:var(--tracking-pair-spacing) !important;
  border-left:1px solid var(--tracking-glass-divider) !important;
}
:global(html.theme-dark .app-site.tracking-site .tracking-demo-result__field dt) {
  margin:0 !important;
  padding:0 !important;
  border:0 !important;
  background:transparent !important;
  color:var(--track-muted);
  font-size:12px;
  font-weight:700;
}
:global(html.theme-dark .app-site.tracking-site .tracking-demo-result__field dd) {
  display:block;
  min-height:0;
  margin:6px 0 0 !important;
  padding:0 !important;
  border:0 !important;
  border-radius:0 !important;
  background:transparent !important;
  background-image:none !important;
  box-shadow:none !important;
  -webkit-backdrop-filter:none !important;
  backdrop-filter:none !important;
  font-size:clamp(14px,1.15vw,16px);
  font-weight:750;
}
:global(html.theme-dark .app-site.tracking-site .tracking-demo-result__pair)::before,
:global(html.theme-dark .app-site.tracking-site .tracking-demo-result__pair)::after {
  content:none !important;
  background:none !important;
}
@media(max-width:580px) {
  :global(html.theme-dark .app-site.tracking-site .tracking-demo-result__pair) {
    padding:13px 14px;
    border-radius:14px;
  }
  :global(html.theme-dark .app-site.tracking-site .tracking-demo-result__field dt) { font-size:11px; }
  :global(html.theme-dark .app-site.tracking-site .tracking-demo-result__field dd) { font-size:13px; }
}
</style>

<style scoped>
.tracking-demo-result__view { margin-top:14px; border:1px solid #b50928; border-radius:12px; padding:10px 15px; background:transparent; color:#b50928; font-weight:750; cursor:pointer; }
.tracking-demo-result__view:focus-visible { outline:2px solid #b50928; outline-offset:3px; }
:global(html.theme-dark) .tracking-demo-result__view { color:#ff8697; border-color:#ff8697; }
</style>

<style scoped>
.tracking-results-select { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin:16px 0; }
.tracking-results-select > div { display:flex; gap:8px; }
.tracking-results-select button { border:1px solid #b5092866; background:transparent; color:inherit; padding:8px 13px; border-radius:10px; cursor:pointer; }
.tracking-results-select button:disabled { opacity:.45; cursor:not-allowed; }
</style>

<style scoped>
.tracking-demo-result__customer-status {
  display:flex;flex-direction:column;gap:5px;margin:18px 0 4px;padding:14px 16px;
  border-left:3px solid #b50928;border-radius:8px;background:#b509280a;
  line-height:1.5;overflow-wrap:anywhere;
}
.tracking-demo-result__customer-status strong { font-size:12px; }
.tracking-demo-result__extra { margin-top:22px;padding-top:18px;border-top:1px solid #b5092840; }
.tracking-demo-result__extra h4 { margin:0;font-size:17px;line-height:1.35; }
.tracking-demo-result__extra .tracking-demo-result__grid { margin:16px 0 0; }
</style>

<style>
/* Tracking dark cards: unscoped override intentionally avoids scoped pseudo-element leakage.
   Match the dark closed FieldDropdown: solid navy, fine neutral outline, no glass. */
html.theme-dark .app-site.tracking-site .tracking-demo-result__pair {
  background: #060f21 !important;
  background-color: #060f21 !important;
  background-image: none !important;
  border: 1px solid #4f5365 !important;
  border-radius: 13px;
  box-shadow: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
html.theme-dark .app-site.tracking-site .tracking-demo-result__pair::before,
html.theme-dark .app-site.tracking-site .tracking-demo-result__pair::after {
  display: none !important;
  content: none !important;
  background: none !important;
  box-shadow: none !important;
}
html.theme-dark .app-site.tracking-site
  .tracking-demo-result__pair .tracking-demo-result__field + .tracking-demo-result__field {
  border-left: 1px solid #3b465f !important;
}
</style>

<style>
/* Turn the result into a route summary plus a lighter, icon-led information grid. */
.app-site.tracking-site .tracking-demo-result__route {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 48px minmax(0, 1fr);
  align-items: center;
  gap: 18px;
  margin: 22px 0 18px;
  padding: 22px 24px;
  border: 1px solid rgba(181, 9, 40, .15);
  border-radius: 24px;
  background: linear-gradient(115deg, rgba(181, 9, 40, .07), rgba(255, 255, 255, .06));
}
.app-site.tracking-site .tracking-demo-result__route-stop {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 14px;
}
.app-site.tracking-site .tracking-demo-result__route-icon,
.app-site.tracking-site .tracking-demo-result__field-icon {
  display: grid;
  flex: 0 0 38px;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 14px;
  background: rgba(181, 9, 40, .09);
  color: #b50928;
}
.app-site.tracking-site .tracking-demo-result__route-stop > div { display: grid; min-width: 0; gap: 5px; }
.app-site.tracking-site .tracking-demo-result__route-stop > div > span {
  color: var(--track-muted, #69707c);
  font-size: 12px;
  font-weight: 750;
}
.app-site.tracking-site .tracking-demo-result__route-stop strong { overflow-wrap: anywhere; font-size: 18px; }
.app-site.tracking-site .tracking-demo-result__route-connector {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 50%;
  background: #b50928;
  color: #fff;
}
.app-site.tracking-site .tracking-journey {
  margin: 0 0 19px;
  padding: 18px 22px 20px;
  border: 1px solid rgba(181, 9, 40, .16);
  border-radius: 22px;
  background: linear-gradient(110deg, rgba(181, 9, 40, .045), rgba(255, 255, 255, .18));
}
.app-site.tracking-site .tracking-journey__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}
.app-site.tracking-site .tracking-journey__heading > div { display: grid; gap: 4px; }
.app-site.tracking-site .tracking-journey__heading > div > span {
  color: #b50928;
  font-size: 10px;
  font-weight: 850;
  letter-spacing: .12em;
}
.app-site.tracking-site .tracking-journey__heading strong { font-size: 15px; }
.app-site.tracking-site .tracking-journey__heading small {
  padding: 7px 11px;
  border: 1px solid rgba(181, 9, 40, .18);
  border-radius: 999px;
  background: rgba(181, 9, 40, .075);
  color: #b50928;
  font-size: 12px;
  font-weight: 800;
}
.app-site.tracking-site .tracking-journey__steps {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: start;
  gap: 0;
}
.app-site.tracking-site .tracking-journey__rail,
.app-site.tracking-site .tracking-journey__progress {
  position: absolute;
  top: 18px;
  left: 16.666%;
  width: 66.666%;
  height: 2px;
  border-radius: 2px;
}
.app-site.tracking-site .tracking-journey__rail { background: rgba(105, 112, 124, .2); }
.app-site.tracking-site .tracking-journey__progress {
  width: var(--journey-progress);
  background: linear-gradient(90deg, #b50928, #e84b63);
  transition: width .45s ease;
}
.app-site.tracking-site .tracking-journey__step {
  position: relative;
  z-index: 1;
  display: grid;
  justify-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--track-muted, #69707c);
  font-size: 12px;
  font-weight: 750;
  text-align: center;
}
.app-site.tracking-site .tracking-journey__node {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid rgba(105, 112, 124, .25);
  border-radius: 50%;
  background: var(--track-surface, #fff8f8);
  color: var(--track-muted, #69707c);
  transition: background .25s ease, color .25s ease, box-shadow .25s ease, transform .25s ease;
}
.app-site.tracking-site .tracking-journey__step.is-complete .tracking-journey__node,
.app-site.tracking-site .tracking-journey__step.is-current .tracking-journey__node {
  border-color: #b50928;
  background: #b50928;
  color: #fff;
}
.app-site.tracking-site .tracking-journey__step.is-current { color: var(--track-ink, #20242b); }
.app-site.tracking-site .tracking-journey__step.is-current .tracking-journey__node {
  box-shadow: 0 0 0 5px rgba(181, 9, 40, .12), 0 0 22px rgba(181, 9, 40, .24);
  transform: translateY(-2px);
  animation: tracking-journey-pulse 2s ease-in-out infinite;
}
@keyframes tracking-journey-pulse {
  50% { box-shadow: 0 0 0 8px rgba(181, 9, 40, .04), 0 0 28px rgba(181, 9, 40, .28); }
}
.app-site.tracking-site .tracking-demo-result__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  margin: 18px 0;
}
.app-site.tracking-site .tracking-demo-result__pair {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  min-width: 0;
}
.app-site.tracking-site .tracking-demo-result__field {
  display: grid !important;
  grid-template-columns: 38px minmax(0, 1fr);
  grid-template-rows: auto auto;
  align-content: center;
  column-gap: 12px;
  min-width: 0;
  min-height: 88px;
  margin: 0 !important;
  padding: 14px 16px !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}
.app-site.tracking-site .tracking-demo-result__field:first-child:not(:only-child) {
  padding-right: clamp(10px, 1.5vw, 20px) !important;
}
.app-site.tracking-site .tracking-demo-result__field + .tracking-demo-result__field {
  padding-left: clamp(16px, 2vw, 26px) !important;
  border-left: 1px solid rgba(91, 105, 125, .34) !important;
}
.app-site.tracking-site .tracking-demo-result__field-icon {
  grid-column: 1;
  grid-row: 1 / span 2;
  width: 36px;
  height: 36px;
  border-radius: 13px;
}
.app-site.tracking-site .tracking-demo-result__field dt { grid-column: 2; grid-row: 1; align-self: end; }
.app-site.tracking-site .tracking-demo-result__field dd {
  grid-column: 2;
  grid-row: 2;
  margin: 4px 0 0 !important;
  font-size: 15px;
}
.app-site.tracking-site .tracking-demo-result__extra .tracking-demo-result__grid { margin-top: 14px; }
.app-site.tracking-site .tracking-demo-result__extra h4 { margin-bottom: 4px; }
.app-site.tracking-site .tracking-demo-result__customer-status {
  border-radius: 8px 20px 20px 8px;
  padding: 17px 20px;
}
html.theme-dark .app-site.tracking-site .tracking-demo-result__route {
  border-color: rgba(120, 137, 166, .28);
  background: linear-gradient(112deg, rgba(181, 9, 40, .12), rgba(16, 24, 43, .68));
}
html.theme-dark .app-site.tracking-site .tracking-demo-result__route-icon,
html.theme-dark .app-site.tracking-site .tracking-demo-result__field-icon {
  background: rgba(181, 9, 40, .19);
  color: #ff8595;
}
html.theme-dark .app-site.tracking-site .tracking-demo-result__field {
  border-top: 0 !important;
  border-right: 0 !important;
  border-bottom: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}
html.theme-dark .app-site.tracking-site .tracking-demo-result__field + .tracking-demo-result__field {
  border-left: 1px solid #3b465f !important;
}
html.theme-dark .app-site.tracking-site .tracking-journey {
  border-color: rgba(120, 137, 166, .27);
  background: linear-gradient(110deg, rgba(181, 9, 40, .1), rgba(16, 24, 43, .52));
}
html.theme-dark .app-site.tracking-site .tracking-journey__heading > div > span,
html.theme-dark .app-site.tracking-site .tracking-journey__heading small { color: #ff8998; }
html.theme-dark .app-site.tracking-site .tracking-journey__heading small {
  border-color: rgba(255, 137, 152, .24);
  background: rgba(181, 9, 40, .2);
}
html.theme-dark .app-site.tracking-site .tracking-journey__node {
  border-color: rgba(120, 137, 166, .36);
  background: #10182b;
  color: #aab4c8;
}
html.theme-dark .app-site.tracking-site .tracking-journey__step.is-current { color: #fff; }
html.theme-dark .app-site.tracking-site .tracking-journey__step.is-complete .tracking-journey__node,
html.theme-dark .app-site.tracking-site .tracking-journey__step.is-current .tracking-journey__node {
  border-color: #b50928;
  background: #b50928;
  color: #fff;
}
@media (max-width: 900px) {
  .app-site.tracking-site .tracking-demo-result__field { min-height: 82px; }
}
@media (max-width: 580px) {
  .app-site.tracking-site .tracking-demo-result__route {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    padding: 18px;
    border-radius: 21px;
  }
  .app-site.tracking-site .tracking-demo-result__route-connector {
    width: 34px;
    height: 34px;
    margin-left: 2px;
    transform: rotate(90deg);
  }
  .app-site.tracking-site .tracking-journey { padding: 16px 13px; }
  .app-site.tracking-site .tracking-journey__step { font-size: 10px; }
  .app-site.tracking-site .tracking-journey__node { width: 34px; height: 34px; }
  .app-site.tracking-site .tracking-journey__rail,
  .app-site.tracking-site .tracking-journey__progress { top: 16px; }
  .app-site.tracking-site .tracking-journey__heading strong { font-size: 13px; }
  .app-site.tracking-site .tracking-demo-result__pair { grid-template-columns: minmax(0, 1fr); }
  .app-site.tracking-site .tracking-demo-result__field { min-height: 70px; padding: 12px 8px !important; }
  .app-site.tracking-site .tracking-demo-result__field + .tracking-demo-result__field {
    padding-left: 8px !important;
    border-left: 0 !important;
    border-top: 1px solid rgba(91, 105, 125, .26) !important;
  }
}
</style>

<style>
/* Softer tracking surfaces: keep the information layout, reduce the rigid box feel. */
.app-site.tracking-site .tracking-search {
  border-radius: 34px;
  border-color: rgba(181, 9, 40, .22);
}
.app-site.tracking-site .tracking-process {
  border-radius: 34px;
}
.app-site.tracking-site .tracking-fields input,
.app-site.tracking-site .tracking-fields select,
.app-site.tracking-site .tracking-fields .cf-dropdown__trigger {
  border-radius: 17px;
}
.app-site.tracking-site .tracking-unavailable {
  border-radius: 21px;
}
.app-site.tracking-site .tracking-demo-result {
  border-radius: 27px;
}
.app-site.tracking-site .tracking-demo-result__pair {
  border-radius: 22px;
  border-color: rgba(130, 47, 62, .16);
  box-shadow: 0 7px 24px rgba(30, 20, 30, .07), inset 0 1px 0 rgba(255, 255, 255, .38);
}
.app-site.tracking-site .tracking-demo-result__status {
  border-radius: 999px;
  padding: 8px 14px;
}
.app-site.tracking-site .tracking-demo-result__view,
.app-site.tracking-site .tracking-results-select button {
  border-radius: 999px;
}
.app-site.tracking-site .tracking-demo-result__customer-status {
  border-radius: 7px 18px 18px 7px;
}
html.theme-dark .app-site.tracking-site .tracking-demo-result__pair {
  border-radius: 21px;
}
@media (max-width: 580px) {
  .app-site.tracking-site .tracking-search,
  .app-site.tracking-site .tracking-process {
    border-radius: 26px;
  }
  .app-site.tracking-site .tracking-demo-result {
    border-radius: 23px;
  }
  .app-site.tracking-site .tracking-demo-result__pair {
    border-radius: 18px;
  }
}
</style>
