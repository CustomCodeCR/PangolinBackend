<script setup lang="ts">
import IconSymbol from '../components/IconSymbol.vue'
import FieldDropdown from '../components/FieldDropdown.vue'
import ItineraryLocationSelect from '../components/ItineraryLocationSelect.vue'
import { useItineraryLocations } from '../lib/itineraryLocations'
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import { authState } from '../services/auth'
import { subscribeToChanges } from '../services/realtime'
import { readManagedItineraries, type ManagedItinerary } from '../adminContent'
import { localizeTrackingMode, localizeTrackingStatus } from '../lib/trackingDisplay'

type TransportMode = 'maritime' | 'ground' | ''
type ItineraryStatus = 'planning' | 'transit' | 'delivered' | 'delayed'
// Formulario de búsqueda: id numérico local (NO es un registro de PostgreSQL).
type Itinerary = {
  id: number
  pol: string
  pod: string
  closing: string
  status: ItineraryStatus | ''
  etd: string
  eta: string
  transport: TransportMode
  modality: string
}

// Registro devuelto por la API /api/itinerarios. Su id es UUID (string).
type ItineraryResultado = {
  id: string
  pol: string
  pod: string
  closing: string | null
  status: ItineraryStatus
  etd: string
  eta: string
  transport: TransportMode
  modality: string
  carrier?: string | null
  vessel?: string | null
  voyage?: string | null
}

type ItineraryPageResponse = {
  items: ItineraryResultado[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const { t, tm, locale } = useI18n({ useScope: 'global' })
const en = computed(() => locale.value.toLowerCase().startsWith('en'))
// Published itinerary records store Spanish values; translate them for display only.
const displayPublishedTransport = (value: string) => localizeTrackingMode(value, en.value ? 'en' : 'es')
const displayPublishedStatus = (value: string) => localizeTrackingStatus(value, en.value ? 'en' : 'es')
const modes = computed(() => tm('custom.itinerary.modes') as string[])
const statusValues: ItineraryStatus[] = ['planning', 'transit', 'delivered', 'delayed']
const statuses = computed(() => (tm('custom.itinerary.form.statuses') as string[]).map((label, index) => ({ value: statusValues[index], label })))
const statusChoices = computed(() => [{ value: '', label: en.value ? 'All' : 'Todos' }, ...statuses.value])
const modalityChoices = (item: Itinerary) => [{value:'',label:en.value ? 'All' : 'Todas'}, ...optionsFor(item).map(value => ({value,label:value}))]
function chooseStatus(item: Itinerary, value: string) {
  item.status = statusValues.includes(value as ItineraryStatus) ? value as ItineraryStatus : ''
}
const labels = computed(() => tm('custom.itinerary.table.fields') as Record<string, string>)
const placeholders = computed(() => tm('custom.itinerary.table.values') as Record<string, string>)
const transportDetails = computed(() => tm('custom.itinerary.table.transportDetails') as Array<{ pol: string; pod: string }>)
const maritimeOptions = computed(() => tm('custom.itinerary.table.modalities.0') as string[])
const groundOptions = computed(() => tm('custom.itinerary.table.modalities.1') as string[])
const itineraries = ref<Itinerary[]>([createItinerary(1)])
const activeItineraryId = ref(1)
const activeItinerary = computed(() => itineraries.value.find(item => item.id === activeItineraryId.value) ?? itineraries.value[0])
const searchPerformed = ref(false)
const resultsRef = ref<HTMLElement | null>(null)
const resultados = ref<ItineraryResultado[]>([])
const publishedItineraries = ref<ManagedItinerary[]>([])
const earliestDeparture = ref('')
onMounted(async () => {
  // GIO carries the exact filters into this public results screen.
  const params = new URLSearchParams(window.location.search)
  if (params.get('from') === 'gio') {
    const selected = activeItinerary.value
    if (selected) {
      selected.pol = (params.get('pol') || '').slice(0, 150)
      selected.pod = (params.get('pod') || '').slice(0, 150)
      const transport = params.get('transporte')
      selected.transport = transport === 'maritime' || transport === 'ground' ? transport : ''
      const departure = params.get('etdDesde') || ''
      if (/^\d{4}-\d{2}-\d{2}$/.test(departure)) earliestDeparture.value = departure
    }
  }
  publishedItineraries.value = readManagedItineraries()
  await searchItineraries(1, false)
})
const stopItineraryEvents = ['itineraries', 'sync'].map(resource =>
  subscribeToChanges(resource, () => {
    if (searchPerformed.value && !cargando.value && !authState.previewRole)
      void searchItineraries(currentPage.value)
  }))
onUnmounted(() => {
  stopItineraryEvents.forEach(stop => stop())
  searchController?.abort()
})
const cargando = ref(false)
const errorBusqueda = ref('')
const currentPage = ref(1)
const totalPages = ref(0)
const totalResults = ref(0)
const pageSize = 20
let appliedFilters = ''
let searchController: AbortController | null = null
let searchGeneration = 0
const { origins, destinations, loadingLocations, locationError } = useItineraryLocations(
  computed(() => activeItinerary.value?.transport ?? '')
)

function createItinerary(id: number): Itinerary {
  return {
    id, pol: '', pod: '', status: '', transport: 'maritime', modality: '',
    closing: '', etd: '', eta: ''
  }
}

function optionsFor(item: Itinerary) {
  return item.transport === 'maritime' ? maritimeOptions.value : item.transport === 'ground' ? groundOptions.value : []
}

function portPlaceholder(item: Itinerary, port: 'pol' | 'pod') {
  return item.transport ? transportDetails.value[item.transport === 'maritime' ? 0 : 1][port] : port.toUpperCase()
}

function changeTransport(item: Itinerary) {
  item.modality = ''
  item.pol = ''
  item.pod = ''
}

function selectTransport(mode: TransportMode) {
  const item = activeItinerary.value
  if (!item) return
  if (item.transport === mode) return
  item.transport = mode
  changeTransport(item)
  void searchItineraries(1, false)
}

function removeItinerary(id: number) {
  if (itineraries.value.length > 1) {
    itineraries.value = itineraries.value.filter(item => item.id !== id)
    if (activeItineraryId.value === id) activeItineraryId.value = itineraries.value[0].id
    searchPerformed.value = false
  }
}

function statusLabel(status: ItineraryStatus) {
  return statuses.value.find(option => option.value === status)?.label ?? status
}

async function searchItineraries(pageNumber = 1, scrollToResults = true) {
  if (pageNumber < 1 || (pageNumber > 1 && pageNumber > totalPages.value)) return

  if (pageNumber === 1) {
    const f = activeItinerary.value
    if (!f) return

    const filters = new URLSearchParams()
    // The catalogue uses complete city/country labels; older itineraries may
    // store only the city. Filter on the city part to match both spellings.
    if (f.pol.trim()) filters.set('pol', f.pol.split(',')[0].trim())
    if (f.pod.trim()) filters.set('pod', f.pod.split(',')[0].trim())
    if (f.status) filters.set('status', f.status)
    if (f.transport) filters.set('transporte', f.transport)
    if (earliestDeparture.value) filters.set('etdDesde', earliestDeparture.value)
    if (f.modality) filters.set('modalidad', f.modality)
    // La API acepta fechas exactas: closing, etd y eta; sin rangos duplicados.
    for (const key of ['closing', 'etd', 'eta'] as const) {
      if (f[key]) filters.set(key, f[key])
    }
    appliedFilters = filters.toString()
  }

  const qs = new URLSearchParams(appliedFilters)
  qs.set('page', String(pageNumber))
  qs.set('pageSize', String(pageSize))

  searchController?.abort()
  const controller = new AbortController()
  searchController = controller
  const generation = ++searchGeneration
  cargando.value = true
  errorBusqueda.value = ''
  searchPerformed.value = true

  try {
    const response = await fetch(`/api/itinerarios?${qs.toString()}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    })

    if (generation !== searchGeneration) return
    if (response.status === 401 && authState.previewRole) {
      const f = activeItinerary.value
      if (f) resultados.value = [{ id: 'preview-' + f.id, pol: f.pol || 'San José, Costa Rica', pod: f.pod || 'Miami, Estados Unidos', closing: f.closing || null, status: f.status || 'planning', etd: f.etd || '', eta: f.eta || '', transport: f.transport, modality: f.modality || (f.transport === 'maritime' ? 'FCL' : 'LTL') }]
      totalResults.value = resultados.value.length
      totalPages.value = 1
      currentPage.value = 1
      return
    }
    if (!response.ok) throw new Error(`No se pudieron consultar itinerarios (${response.status}).`)

    const data: unknown = await response.json()
    if (!data || typeof data !== 'object' || !('items' in data) || !Array.isArray(data.items)
      || !('total' in data) || typeof data.total !== 'number'
      || !('page' in data) || typeof data.page !== 'number'
      || !('totalPages' in data) || typeof data.totalPages !== 'number') {
      throw new Error('La API devolvió un formato inesperado.')
    }
    if (generation !== searchGeneration) return
    const result = data as ItineraryPageResponse
    resultados.value = result.items
    totalResults.value = result.total
    totalPages.value = result.totalPages
    currentPage.value = result.page
  } catch (error) {
    if (controller.signal.aborted || generation !== searchGeneration) return
    errorBusqueda.value = error instanceof Error ? error.message : 'Error desconocido.'
    resultados.value = []
    totalResults.value = 0
    totalPages.value = 0
  } finally {
    if (generation === searchGeneration) {
      cargando.value = false
      if (scrollToResults) {
        await nextTick()
        resultsRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }
}

</script>

<template>
  <div class="app-site itinerary-page">
    <section class="itinerary-hero">
      <SiteHeader active="embarque" overlay />
      <div class="container itinerary-hero__content">
        <p class="section-tag light-tag">{{ t('custom.itinerary.eyebrow') }}</p>
        <h1>{{ t('custom.itinerary.titleStart') }} <span>{{ t('custom.itinerary.titleEnd') }}</span></h1>
        <p class="itinerary-intro">{{ t('custom.itinerary.intro') }}</p>
      </div>
    </section>

    <main class="container itinerary-content">
      <nav v-if="activeItinerary" class="itinerary-transport-tabs" :aria-label="t('custom.itinerary.modeLabel')">
        <button type="button" :class="{ 'is-active': activeItinerary.transport === '' }" :aria-pressed="activeItinerary.transport === ''" @click="selectTransport('')">
          <IconSymbol glyph="⌕" :size="22" />
          <span>{{ en ? 'All' : 'Todos' }}</span>
        </button>
        <button type="button" :class="{ 'is-active': activeItinerary.transport === 'maritime' }" :aria-pressed="activeItinerary.transport === 'maritime'" @click="selectTransport('maritime')">
          <IconSymbol glyph="ship" :size="22" />
          <span>{{ modes[0] }}</span>
        </button>
        <button type="button" :class="{ 'is-active': activeItinerary.transport === 'ground' }" :aria-pressed="activeItinerary.transport === 'ground'" @click="selectTransport('ground')">
          <IconSymbol glyph="truck" :size="22" />
          <span>{{ modes[1] }}</span>
        </button>
      </nav>
      <section v-if="activeItinerary" :key="activeItinerary.id" class="itinerary-form-card">
        <template v-for="item in [activeItinerary]" :key="item.id">
        <header class="itinerary-form-card__heading">
          <div><p class="section-tag">{{ en ? 'SEARCH FILTERS' : 'FILTROS DE BÚSQUEDA' }}</p><h2>{{ en ? 'Search itineraries' : 'Buscar itinerarios' }}</h2></div>
          <button v-if="itineraries.length > 1" class="itinerary-remove" type="button" :aria-label="t('custom.itinerary.form.remove')" @click="removeItinerary(item.id)">× <span>{{ t('custom.itinerary.form.remove') }}</span></button>
        </header>

        <div class="itinerary-form-lines">
          <div class="itinerary-form-line"><strong>{{ t('custom.itinerary.form.status') }}</strong><FieldDropdown :model-value="item.status" :options="statusChoices" :aria-label="t('custom.itinerary.form.status')" @update:model-value="value => chooseStatus(item, value)" /></div>
          <div class="itinerary-form-line"><strong :title="portPlaceholder(item, 'pol')">POL</strong><ItineraryLocationSelect v-model="item.pol" :options="origins" aria-label="POL" :placeholder="en ? 'Search city or country' : 'Buscar ciudad o país'" :loading="loadingLocations" /></div>
          <div class="itinerary-form-line"><strong :title="portPlaceholder(item, 'pod')">POD</strong><ItineraryLocationSelect v-model="item.pod" :options="destinations" aria-label="POD" :placeholder="en ? 'Search city or country' : 'Buscar ciudad o país'" :loading="loadingLocations" /></div>
          <label class="itinerary-form-line"><strong>Closing</strong><input v-model="item.closing" type="date" /></label>
          <label class="itinerary-form-line"><strong>ETD</strong><input v-model="item.etd" type="date" /></label>
          <div v-if="earliestDeparture" class="itinerary-location-feedback">
            {{ en ? 'Showing departures from' : 'Mostrando salidas desde' }} {{ earliestDeparture }}
            <button type="button" @click="earliestDeparture = ''; searchItineraries(1, false)">{{ en ? 'Clear filter' : 'Quitar filtro' }}</button>
          </div>
          <label class="itinerary-form-line"><strong>ETA</strong><input v-model="item.eta" type="date" /></label>
          <div class="itinerary-form-line"><strong>{{ labels.modality }}</strong><FieldDropdown v-model="item.modality" :options="modalityChoices(item)" :aria-label="labels.modality" /></div>
        </div>
        <p v-if="locationError" class="itinerary-location-feedback" role="status">{{ locationError }} {{ en ? 'Other filters still work.' : 'Podés seguir usando los demás filtros.' }}</p>
        </template>

      </section>

      <div class="itinerary-actions">
        <button class="itinerary-search-button" type="button" :disabled="cargando" @click="searchItineraries(1)"><IconSymbol glyph="⌕" aria-hidden="true" />{{ cargando ? (en ? 'Searching…' : 'Buscando…') : t('custom.itinerary.form.search') }}</button>
      </div>

      <section v-if="searchPerformed" ref="resultsRef" class="itinerary-search-results" aria-live="polite">
        <header class="itinerary-search-results__heading">
          <div><p class="section-tag">{{ t('custom.itinerary.form.resultsEyebrow') }}</p><h2>{{ t('custom.itinerary.form.resultsTitle') }}</h2></div>
          <span v-if="!errorBusqueda">{{ totalResults }} {{ t('custom.itinerary.form.resultsCount') }}</span>
        </header>
        <p v-if="cargando" role="status">{{ en ? "Loading itineraries…" : "Consultando itinerarios…" }}</p>
        <p v-else-if="errorBusqueda" role="alert">{{ errorBusqueda }}</p>
        <p v-else-if="resultados.length === 0">{{ en ? "No itineraries matched those filters." : "No se encontraron itinerarios con esos filtros." }}</p>
        <article v-for="(item, index) in (!cargando && !errorBusqueda ? resultados : [])"
          :key="item.id" class="itinerary-summary-card" :class="`itinerary-summary-card--${item.status}`">
          <header class="itinerary-summary-card__header">
            <div class="itinerary-summary-card__heading">
              <span class="itinerary-summary-card__eyebrow">{{ en ? 'LOGISTICS ITINERARY' : 'ITINERARIO LOGÍSTICO' }}</span>
              <h3>{{ t('custom.itinerary.form.itemTitle', { number: String((currentPage - 1) * pageSize + index + 1).padStart(2, '0') }) }}</h3>
            </div>
            <div class="itinerary-summary-card__badges">
              <span class="itinerary-summary-card__mode">
                <IconSymbol :glyph="item.transport === 'ground' ? 'truck' : 'ship'" :size="15" aria-hidden="true" />
                {{ modes[item.transport === 'maritime' ? 0 : 1] }}
                <span aria-hidden="true">·</span> {{ item.modality || t('custom.itinerary.form.notSpecified') }}
              </span>
              <span class="itinerary-result-status" :class="`itinerary-result-status--${item.status}`">{{ statusLabel(item.status) }}</span>
            </div>
          </header>

          <div class="itinerary-summary-card__route" :aria-label="en ? 'Itinerary origin and destination' : 'Origen y destino del itinerario'">
            <div class="itinerary-summary-card__stop">
              <span class="itinerary-summary-card__pin" aria-hidden="true"><IconSymbol glyph="⌖" :size="19" /></span>
              <div class="itinerary-summary-card__stop-copy">
                <span class="itinerary-summary-card__stop-label">{{ en ? 'Origin' : 'Origen' }} · POL</span>
                <strong>{{ item.pol || t('custom.itinerary.form.notSpecified') }}</strong>
                <small>{{ t('custom.itinerary.form.loadingPort') }}</small>
              </div>
            </div>
            <div class="itinerary-summary-card__route-line" aria-hidden="true"><span>→</span></div>
            <div class="itinerary-summary-card__stop itinerary-summary-card__stop--destination">
              <span class="itinerary-summary-card__pin" aria-hidden="true"><IconSymbol glyph="⌖" :size="19" /></span>
              <div class="itinerary-summary-card__stop-copy">
                <span class="itinerary-summary-card__stop-label">{{ en ? 'Destination' : 'Destino' }} · POD</span>
                <strong>{{ item.pod || t('custom.itinerary.form.notSpecified') }}</strong>
                <small>{{ t('custom.itinerary.form.unloadingPort') }}</small>
              </div>
            </div>
          </div>

          <div class="itinerary-summary-card__information">
            <div class="itinerary-summary-card__facts" :aria-label="en ? 'Key dates' : 'Fechas principales'">
              <div class="itinerary-summary-card__fact"><span>Closing</span><strong>{{ item.closing || t('custom.itinerary.form.notSpecified') }}</strong></div>
              <div class="itinerary-summary-card__fact"><span>ETD</span><strong>{{ item.etd || t('custom.itinerary.form.notSpecified') }}</strong></div>
              <div class="itinerary-summary-card__fact"><span>ETA</span><strong>{{ item.eta || t('custom.itinerary.form.notSpecified') }}</strong></div>
            </div>
            <div class="itinerary-summary-card__facts itinerary-summary-card__facts--logistics" :aria-label="en ? 'Transport details' : 'Detalles de transporte'">
              <div class="itinerary-summary-card__fact"><span>{{ en ? 'Carrier' : 'Transportista' }}</span><strong>{{ item.carrier || t('custom.itinerary.form.notSpecified') }}</strong></div>
              <div class="itinerary-summary-card__fact"><span>{{ en ? 'Vessel' : 'Buque' }}</span><strong>{{ item.vessel || t('custom.itinerary.form.notSpecified') }}</strong></div>
              <div class="itinerary-summary-card__fact"><span>{{ en ? 'Voyage' : 'Viaje' }}</span><strong>{{ item.voyage || t('custom.itinerary.form.notSpecified') }}</strong></div>
            </div>
          </div>
        </article>
        <nav v-if="!cargando && !errorBusqueda && totalPages > 1" class="itinerary-pagination" :aria-label="t('custom.itinerary.form.paginationLabel')">
          <button type="button" :disabled="currentPage <= 1" @click="searchItineraries(currentPage - 1)">{{ t('custom.itinerary.form.previousPage') }}</button>
          <span>{{ t('custom.itinerary.form.pageOf', { page: currentPage, total: totalPages }) }}</span>
          <button type="button" :disabled="currentPage >= totalPages" @click="searchItineraries(currentPage + 1)">{{ t('custom.itinerary.form.nextPage') }}</button>
        </nav>
      </section>

      <section v-if="authState.previewRole && publishedItineraries.length" class="published-itineraries">
        <p class="section-tag">CASTRO FALLAS</p>
        <h2>{{ en ? 'Scheduled itineraries' : 'Itinerarios programados' }}</h2>
        <article v-for="item in publishedItineraries" :key="item.id" class="published-itinerary-card">
          <div><small>{{ displayPublishedTransport(item.transport) }} · {{ displayPublishedStatus(item.status) }}</small><strong>{{ item.origin }} <span>→</span> {{ item.destination }}</strong></div>
          <div class="published-itinerary-dates"><span v-if="item.departure">{{ en ? 'Departure' : 'Salida' }}: {{ item.departure }}</span><span v-if="item.arrival">{{ en ? 'Arrival' : 'Llegada' }}: {{ item.arrival }}</span></div>
        </article>
      </section>

      <section class="itinerary-cta"><div><p class="section-tag light-tag">CASTRO FALLAS</p><h2>{{ t('custom.itinerary.ctaTitle') }}</h2></div><a href="/cotizaciones" class="btn btn-white">{{ t('custom.itinerary.ctaButton') }} <IconSymbol glyph="↗" /></a></section>
      <a class="itinerary-back" href="/home"><IconSymbol glyph="←" /> {{ t('custom.itinerary.backHome') }}</a>
    </main>
    <SiteFooter />
  </div>
</template>

<style scoped>

.itinerary-location-feedback{margin:12px 0 0;color:#a80e18;font-size:12px;font-weight:600}
.itinerary-result-card{grid-template-columns:minmax(130px,.65fr) minmax(0,3fr);gap:18px 24px}
.itinerary-result-card__details{grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:13px 20px;border-top:1px solid #eee7e9;padding-top:15px}
.itinerary-result-card__details>span{min-width:0}
.itinerary-result-card__details strong{font-size:12px;overflow-wrap:anywhere}
@media(max-width:760px){.itinerary-result-card{grid-template-columns:minmax(0,1fr)}.itinerary-result-card__details{grid-column:1/-1;grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:390px){.itinerary-result-card__details{grid-template-columns:minmax(0,1fr)}}
.published-itineraries{margin:36px 0}.published-itineraries h2{margin:0 0 18px;font-size:clamp(24px,3vw,36px)}.published-itinerary-card{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:10px 0;padding:18px 22px;border:1px solid #ffffff3c;border-radius:16px;background:#ffffff0c;backdrop-filter:blur(12px);color:inherit}.published-itinerary-card>div:first-child{display:grid;gap:7px}.published-itinerary-card small,.published-itinerary-dates{opacity:.75}.published-itinerary-card strong{font-size:18px}.published-itinerary-card strong span{color:#ef3340;padding:0 5px}.published-itinerary-dates{display:flex;gap:16px;font-size:13px}@media(max-width:600px){.published-itinerary-card{align-items:flex-start;flex-direction:column}.published-itinerary-card strong{font-size:16px}.published-itinerary-dates{flex-wrap:wrap}}


/* Logistics itinerary cards use the same calm white/glass hierarchy as the
   Dynamics shipment summary, without changing search, pagination or API data. */
.itinerary-summary-card{
  --itinerary-result-border:rgba(174,38,66,.18);
  --itinerary-result-line:rgba(137,82,97,.17);
  --itinerary-result-muted:#737780;
  position:relative;isolation:isolate;overflow:hidden;
  margin-top:14px;padding:clamp(16px,2.2vw,25px);
  border:1px solid var(--itinerary-result-border);border-radius:22px;
  background:linear-gradient(125deg,#fff8f9 0%,#fff 42%,#fff 100%);
  box-shadow:0 12px 30px rgba(47,18,28,.06);color:#20242b;
}
.itinerary-summary-card::before{
  content:"";position:absolute;left:0;top:22px;bottom:22px;width:3px;
  border-radius:0 4px 4px 0;background:#b20c2a;
}
.itinerary-summary-card__header{
  display:flex;align-items:center;justify-content:space-between;
  gap:16px 26px;flex-wrap:wrap;margin-bottom:18px;
}
.itinerary-summary-card__heading{display:grid;gap:5px;min-width:0}
.itinerary-summary-card__eyebrow{
  color:#b20c2a;font-size:10px;font-weight:900;letter-spacing:.11em;
}
.itinerary-summary-card__heading h3{
  margin:0;color:inherit;font-size:clamp(18px,2vw,23px);
  line-height:1.2;font-weight:850;letter-spacing:-.025em;
}
.itinerary-summary-card__badges{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.itinerary-summary-card__mode{
  display:inline-flex;align-items:center;gap:7px;min-height:31px;
  padding:6px 11px;border:1px solid rgba(178,12,42,.16);
  border-radius:999px;background:rgba(178,12,42,.045);
  color:#5b4048;font-size:11px;font-weight:750;white-space:normal;
}
.itinerary-summary-card__mode .lucide-symbol{flex:none;color:#b20c2a}
.itinerary-summary-card__route{
  display:grid;grid-template-columns:minmax(0,1fr) minmax(58px,.32fr) minmax(0,1fr);
  align-items:center;gap:clamp(8px,1.7vw,22px);
  padding:clamp(14px,2vw,20px);border:1px solid rgba(178,12,42,.13);
  border-radius:18px;background:rgba(176,12,42,.035);
}
.itinerary-summary-card__stop{display:flex;align-items:center;gap:clamp(8px,1vw,14px);min-width:0}
.itinerary-summary-card__stop--destination{justify-content:flex-end}
.itinerary-summary-card__stop-copy{display:grid;gap:4px;min-width:0}
.itinerary-summary-card__stop-label{
  color:#ae0b2b;font-size:10px;font-weight:850;letter-spacing:.03em;
}
.itinerary-summary-card__stop-copy strong{
  font-size:clamp(15px,1.65vw,21px);line-height:1.3;
  font-weight:850;letter-spacing:-.02em;overflow-wrap:anywhere;
}
.itinerary-summary-card__stop-copy small{
  color:var(--itinerary-result-muted);font-size:10px;line-height:1.45;
}
.itinerary-summary-card__pin{
  display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;
  color:#b20c2a;background:#f8e7eb;border-radius:12px;
}
.itinerary-summary-card__route-line{
  position:relative;display:flex;align-items:center;justify-content:center;min-width:0;
}
.itinerary-summary-card__route-line::before{
  content:"";position:absolute;left:0;right:0;top:50%;height:1px;background:#d9a4af;
}
.itinerary-summary-card__route-line span{
  position:relative;display:grid;place-items:center;width:34px;height:34px;
  border-radius:50%;background:#b20c2a;color:#fff;
  font-size:19px;line-height:1;box-shadow:0 3px 10px rgba(178,12,42,.18);
}
.itinerary-summary-card__information{
  display:grid;grid-template-columns:1fr 1fr;gap:0;margin-top:17px;
  padding:16px 0 0;border-top:1px solid var(--itinerary-result-line);
}
.itinerary-summary-card__facts{
  display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 16px;min-width:0;
}
.itinerary-summary-card__facts--logistics{
  padding-left:22px;border-left:1px solid var(--itinerary-result-line);
}
.itinerary-summary-card__fact{display:grid;align-content:start;gap:5px;min-width:0}
.itinerary-summary-card__fact>span{
  color:var(--itinerary-result-muted);font-size:10px;font-weight:850;
  letter-spacing:.065em;text-transform:uppercase;
}
.itinerary-summary-card__fact>strong{
  font-size:12px;font-weight:750;color:inherit;
  line-height:1.55;overflow-wrap:anywhere;
}
:global(html.theme-dark) .itinerary-summary-card{
  --itinerary-result-border:rgba(237,102,126,.26);
  --itinerary-result-line:rgba(255,255,255,.14);
  --itinerary-result-muted:#b8bac4;
  background:linear-gradient(125deg,#302028 0%,#241c23 43%,#211b23 100%);
  color:#fff;box-shadow:0 12px 30px rgba(0,0,0,.15);
}
:global(html.theme-dark) .itinerary-summary-card__route{
  border-color:rgba(255,255,255,.13);background:rgba(255,255,255,.035);
}
:global(html.theme-dark) .itinerary-summary-card__mode{
  color:#f2d5dd;background:rgba(237,23,55,.1);border-color:rgba(237,23,55,.24);
}
:global(html.theme-dark) .itinerary-summary-card__stop-label,
:global(html.theme-dark) .itinerary-summary-card__eyebrow{color:#ff7791}
:global(html.theme-dark) .itinerary-summary-card__pin{background:rgba(237,23,55,.14);color:#ff91a3}
:global(html.theme-dark) .itinerary-summary-card__route-line::before{background:#a24b60}
@media(max-width:860px){
  .itinerary-summary-card__information{grid-template-columns:1fr;gap:14px}
  .itinerary-summary-card__facts--logistics{
    padding:14px 0 0;border-left:0;border-top:1px solid var(--itinerary-result-line)
  }
}
@media(max-width:550px){
  .itinerary-summary-card{border-radius:17px}
  .itinerary-summary-card__header{align-items:flex-start;gap:12px}
  .itinerary-summary-card__badges{width:100%}
  .itinerary-summary-card__route{
    grid-template-columns:minmax(0,1fr) 32px minmax(0,1fr);gap:7px;padding:12px 10px;
  }
  .itinerary-summary-card__stop{gap:5px}
  .itinerary-summary-card__pin{display:none}
  .itinerary-summary-card__route-line span{width:28px;height:28px;font-size:17px}
  .itinerary-summary-card__stop-copy strong{font-size:14px}
  .itinerary-summary-card__stop-copy small{font-size:9px}
  .itinerary-summary-card__facts{gap:10px}
  .itinerary-summary-card__fact>span{font-size:9px}
  .itinerary-summary-card__fact>strong{font-size:11px}
}
@media(max-width:355px){
  .itinerary-summary-card__facts{grid-template-columns:repeat(2,minmax(0,1fr))}
}

</style>
