<script setup lang="ts">
import IconSymbol from '../components/IconSymbol.vue'
import FieldDropdown from '../components/FieldDropdown.vue'
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import { authState, refreshSession } from '../services/auth'
import { subscribeToChanges } from '../services/realtime'
import { readManagedItineraries, type ManagedItinerary } from '../adminContent'
import { localizeTrackingMode, localizeTrackingStatus } from '../lib/trackingDisplay'

type TransportMode = 'maritime' | 'ground'
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
  transport: TransportMode | ''
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
const advancedFiltersOpen = ref(false)
const activeItineraryId = ref(1)
const activeItinerary = computed(() => itineraries.value.find(item => item.id === activeItineraryId.value) ?? itineraries.value[0])
const searchPerformed = ref(false)
const resultsRef = ref<HTMLElement | null>(null)
const expandedResultId = ref<string | null>(null)
const resultados = ref<ItineraryResultado[]>([])
const publishedItineraries = ref<ManagedItinerary[]>([])
onMounted(async () => {
  await refreshSession()
  publishedItineraries.value = readManagedItineraries()
  // Show the complete itinerary summary on entry, without forcing a scroll.
  await searchItineraries(1, false)
})
const stopItineraryEvents = ['itineraries', 'sync'].map(resource =>
  subscribeToChanges(resource, () => {
    if (searchPerformed.value && !cargando.value && !authState.previewRole)
      void searchItineraries(currentPage.value)
  }))
onUnmounted(() => stopItineraryEvents.forEach(stop => stop()))
const cargando = ref(false)
const errorBusqueda = ref('')
const currentPage = ref(1)
const totalPages = ref(0)
const totalResults = ref(0)
const pageSize = 20
let appliedFilters = ''

function createItinerary(id: number): Itinerary {
  return {
    id, pol: '', pod: '', status: '', transport: '', modality: '',
    closing: '', etd: '', eta: ''
  }
}

function optionsFor(item: Itinerary) {
  return item.transport === 'ground' ? groundOptions.value : maritimeOptions.value
}

function portPlaceholder(item: Itinerary, port: 'pol' | 'pod') {
  return transportDetails.value[item.transport === 'maritime' ? 0 : 1][port]
}

function changeTransport(item: Itinerary) {
  item.modality = ''
}

function selectTransport(mode: TransportMode | '') {
  const item = activeItinerary.value
  if (!item) return
  item.transport = mode
  changeTransport(item)
}

function removeItinerary(id: number) {
  if (itineraries.value.length > 1) {
    itineraries.value = itineraries.value.filter(item => item.id !== id)
    if (activeItineraryId.value === id) activeItineraryId.value = itineraries.value[0].id
    searchPerformed.value = false
  }
}

function clearFilters() {
  const current = activeItinerary.value
  if (!current) return
  Object.assign(current, createItinerary(current.id))
  advancedFiltersOpen.value = false
  void searchItineraries(1, false)
}

function statusLabel(status: ItineraryStatus) {
  return statuses.value.find(option => option.value === status)?.label ?? status
}

async function searchItineraries(pageNumber = 1, scrollToResults = true) {
  if (cargando.value || pageNumber < 1 || (pageNumber > 1 && pageNumber > totalPages.value)) return

  if (pageNumber === 1) {
    const f = activeItinerary.value
    if (!f) return

    const filters = new URLSearchParams()
    if (f.pol.trim()) filters.set('pol', f.pol.trim())
    if (f.pod.trim()) filters.set('pod', f.pod.trim())
    if (f.status) filters.set('status', f.status)
    if (f.transport) filters.set('transporte', f.transport)
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

  cargando.value = true
  errorBusqueda.value = ''
  resultados.value = []
  searchPerformed.value = true
  expandedResultId.value = null

  try {
    const response = await fetch(`/api/itinerarios?${qs.toString()}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    })

    if (response.status === 401 && authState.previewRole) {
      const f = activeItinerary.value
      if (f) resultados.value = [{ id: 'preview-' + f.id, pol: f.pol || 'San José, Costa Rica', pod: f.pod || 'Miami, Estados Unidos', closing: f.closing || null, status: f.status || 'planning', etd: f.etd || '', eta: f.eta || '', transport: f.transport, modality: f.modality || (f.transport === 'maritime' ? 'FCL' : 'LTL') }]
      totalResults.value = resultados.value.length
      totalPages.value = 1
      currentPage.value = 1
      return
    }
    if (response.status === 401) {
      window.location.assign('/bienvenidos?next=' + encodeURIComponent(window.location.pathname + window.location.search))
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
    const result = data as ItineraryPageResponse
    resultados.value = result.items
    totalResults.value = result.total
    totalPages.value = result.totalPages
    currentPage.value = result.page
  } catch (error) {
    errorBusqueda.value = error instanceof Error ? error.message : 'Error desconocido.'
    resultados.value = []
    totalResults.value = 0
    totalPages.value = 0
  } finally {
    cargando.value = false
    await nextTick()
    if (scrollToResults) resultsRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
          <IconSymbol glyph="▦" :size="22" />
          <span>{{ en ? 'All itineraries' : 'Todos los itinerarios' }}</span>
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
      <section v-if="activeItinerary" class="itinerary-form-card itinerary-filter-card">
        <header class="itinerary-form-card__heading">
          <div>
            <p class="section-tag">{{ en ? 'FIND A ROUTE' : 'FILTRAR RESULTADOS' }}</p>
            <h2>{{ en ? 'Search itineraries' : 'Buscar itinerario' }}</h2>
            <p class="itinerary-filter-card__help">{{ en ? 'Use one or more filters, or leave them empty to see everything.' : 'Usá uno o varios filtros. Si no completás ninguno, verás todos los itinerarios.' }}</p>
          </div>
        </header>
        <div class="itinerary-form-lines itinerary-filter-card__primary">
          <div class="itinerary-form-line"><strong>{{ t('custom.itinerary.form.status') }}</strong><FieldDropdown :model-value="activeItinerary.status" :options="statusChoices" :aria-label="t('custom.itinerary.form.status')" @update:model-value="value => chooseStatus(activeItinerary, value)" /></div>
          <label class="itinerary-form-line"><strong>{{ en ? 'Origin / POL' : 'Origen / POL' }}</strong><input v-model="activeItinerary.pol" type="text" maxlength="150" :placeholder="en ? 'Any origin' : 'Cualquier origen'" /></label>
          <label class="itinerary-form-line"><strong>{{ en ? 'Destination / POD' : 'Destino / POD' }}</strong><input v-model="activeItinerary.pod" type="text" maxlength="150" :placeholder="en ? 'Any destination' : 'Cualquier destino'" /></label>
        </div>
        <button type="button" class="itinerary-filter-card__advanced-toggle" :aria-expanded="advancedFiltersOpen" @click="advancedFiltersOpen = !advancedFiltersOpen">
          {{ advancedFiltersOpen ? (en ? 'Fewer filters' : 'Menos filtros') : (en ? 'More filters (optional)' : 'Más filtros (opcional)') }}
          <IconSymbol glyph="⌄" :size="16" aria-hidden="true" />
        </button>
        <div v-if="advancedFiltersOpen" class="itinerary-form-lines itinerary-filter-card__advanced">
          <div class="itinerary-form-line"><strong>{{ labels.modality }}</strong><FieldDropdown v-model="activeItinerary.modality" :options="modalityChoices(activeItinerary)" :aria-label="labels.modality" /></div>
          <label class="itinerary-form-line"><strong>Closing</strong><input v-model="activeItinerary.closing" type="date" /></label>
          <label class="itinerary-form-line"><strong>ETD</strong><input v-model="activeItinerary.etd" type="date" /></label>
          <label class="itinerary-form-line"><strong>ETA</strong><input v-model="activeItinerary.eta" type="date" /></label>
        </div>
      </section>

      <div class="itinerary-actions">
        <button class="itinerary-filter-card__clear" type="button" :disabled="cargando" @click="clearFilters">{{ en ? 'Clear filters' : 'Limpiar filtros' }}</button>
        <button class="itinerary-search-button" type="button" :disabled="cargando" @click="searchItineraries(1)"><IconSymbol glyph="⌕" aria-hidden="true" />{{ cargando ? (en ? 'Searching…' : 'Buscando…') : t('custom.itinerary.form.search') }}</button>
      </div>

      <section v-if="searchPerformed" ref="resultsRef" class="itinerary-search-results" aria-live="polite">
        <header class="itinerary-search-results__heading">
          <div><p class="section-tag">{{ t('custom.itinerary.form.resultsEyebrow') }}</p><h2>{{ t('custom.itinerary.form.resultsTitle') }}</h2></div>
          <span v-if="!errorBusqueda">{{ totalResults }} {{ t('custom.itinerary.form.resultsCount') }}</span>
        </header>
        <p v-if="cargando" role="status">{{ en ? "Loading itineraries…" : "Consultando itinerarios…" }}</p>
        <p v-else-if="errorBusqueda" role="alert">{{ errorBusqueda }}</p>
        <p v-else-if="resultados.length === 0">{{ en ? "No itineraries matched those filters. Try fewer filters." : "No se encontraron itinerarios. Probá con menos filtros." }}</p>
        <article v-for="(item, index) in (!cargando && !errorBusqueda ? resultados : [])" :key="item.id" class="itinerary-result-card">
          <div class="itinerary-result-card__status">
            <small>{{ t('custom.itinerary.form.status') }}</small>
            <strong>{{ t('custom.itinerary.form.itemTitle', { number: String((currentPage - 1) * pageSize + index + 1).padStart(2, '0') }) }}</strong>
            <span class="itinerary-result-status" :class="`itinerary-result-status--${item.status}`">{{ statusLabel(item.status) }}</span>
          </div>
          <div class="itinerary-result-card__route">
            <div class="itinerary-result-card__endpoints">
              <div><small>{{ item.etd || t('custom.itinerary.form.notSpecified') }}</small><strong>{{ item.pol || t('custom.itinerary.form.notSpecified') }}</strong><span>POL · {{ t('custom.itinerary.form.loadingPort') }}</span></div>
              <div class="itinerary-result-card__connector"><span>{{ modes[item.transport === 'maritime' ? 0 : 1] }}</span><i aria-hidden="true"></i><span>{{ item.modality }}</span></div>
              <div><small>{{ item.eta || t('custom.itinerary.form.notSpecified') }}</small><strong>{{ item.pod || t('custom.itinerary.form.notSpecified') }}</strong><span>POD · {{ t('custom.itinerary.form.unloadingPort') }}</span></div>
            </div>
            <div class="itinerary-result-card__dates"><span><small>Closing</small><strong>{{ item.closing || t('custom.itinerary.form.notSpecified') }}</strong></span><span><small>ETD</small><strong>{{ item.etd || t('custom.itinerary.form.notSpecified') }}</strong></span><span><small>ETA</small><strong>{{ item.eta || t('custom.itinerary.form.notSpecified') }}</strong></span></div>
          </div>
          <div class="itinerary-result-card__actions">
            <button type="button" :aria-expanded="expandedResultId === item.id" @click="expandedResultId = expandedResultId === item.id ? null : item.id">{{ expandedResultId === item.id ? t('custom.itinerary.form.hideDetails') : t('custom.itinerary.form.viewDetails') }}</button>
          </div>
          <div v-if="expandedResultId === item.id" class="itinerary-result-card__details">
            <span><small>{{ labels.transport }}</small><strong>{{ modes[item.transport === 'maritime' ? 0 : 1] }}</strong></span>
            <span><small>{{ labels.modality }}</small><strong>{{ item.modality }}</strong></span>
            <span><small>{{ t('custom.itinerary.form.status') }}</small><strong>{{ statusLabel(item.status) }}</strong></span>
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

.published-itineraries{margin:36px 0}.published-itineraries h2{margin:0 0 18px;font-size:clamp(24px,3vw,36px)}.published-itinerary-card{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:10px 0;padding:18px 22px;border:1px solid #ffffff3c;border-radius:16px;background:#ffffff0c;backdrop-filter:blur(12px);color:inherit}.published-itinerary-card>div:first-child{display:grid;gap:7px}.published-itinerary-card small,.published-itinerary-dates{opacity:.75}.published-itinerary-card strong{font-size:18px}.published-itinerary-card strong span{color:#ef3340;padding:0 5px}.published-itinerary-dates{display:flex;gap:16px;font-size:13px}@media(max-width:600px){.published-itinerary-card{align-items:flex-start;flex-direction:column}.published-itinerary-card strong{font-size:16px}.published-itinerary-dates{flex-wrap:wrap}}


.itinerary-filter-card__help { margin: 9px 0 0; color: inherit; opacity: .78; font-size: 14px; line-height: 1.5; }
.itinerary-filter-card__primary { margin-top: 22px; }
.itinerary-filter-card__advanced-toggle,
.itinerary-filter-card__clear {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 42px; padding: 9px 14px; border: 1px solid rgba(255,255,255,.24);
  border-radius: 12px; background: rgba(255,255,255,.06); color: inherit;
  font: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
}
.itinerary-filter-card__advanced-toggle { margin-top: 20px; }
.itinerary-filter-card__advanced { margin-top: 14px; }
.itinerary-filter-card__clear:disabled { opacity: .55; cursor: not-allowed; }
.itinerary-filter-card__advanced-toggle:focus-visible,
.itinerary-filter-card__clear:focus-visible { outline: 2px solid #f04464; outline-offset: 3px; }
@media (max-width: 600px) {
  .itinerary-filter-card__help { font-size: 13px; }
  .itinerary-filter-card__advanced-toggle { width: 100%; }
}
</style>
