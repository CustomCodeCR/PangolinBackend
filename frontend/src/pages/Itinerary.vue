<script setup lang="ts">
import IconSymbol from '../components/IconSymbol.vue'
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'

type TransportMode = 'maritime' | 'ground'
type ItineraryStatus = 'planning' | 'transit' | 'delivered' | 'delayed'
type Itinerary = {
  id: number
  pol: string
  pod: string
  closing: string
  status: ItineraryStatus
  etd: string
  eta: string
  transport: TransportMode
  modality: string
}

const { t, tm } = useI18n({ useScope: 'global' })
const modes = computed(() => tm('custom.itinerary.modes') as string[])
const statusValues: ItineraryStatus[] = ['planning', 'transit', 'delivered', 'delayed']
const statuses = computed(() => (tm('custom.itinerary.form.statuses') as string[]).map((label, index) => ({ value: statusValues[index], label })))
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
const expandedResultId = ref<number | null>(null)

function createItinerary(id: number): Itinerary {
  return { id, pol: '', pod: '', closing: '', status: 'planning', etd: '', eta: '', transport: 'maritime', modality: 'FCL' }
}

function optionsFor(item: Itinerary) {
  return item.transport === 'maritime' ? maritimeOptions.value : groundOptions.value
}

function portPlaceholder(item: Itinerary, port: 'pol' | 'pod') {
  return transportDetails.value[item.transport === 'maritime' ? 0 : 1][port]
}

function changeTransport(item: Itinerary) {
  item.modality = optionsFor(item)[0]
}

function selectTransport(mode: TransportMode) {
  const item = activeItinerary.value
  if (!item) return
  item.transport = mode
  changeTransport(item)
  searchPerformed.value = false
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

async function searchItineraries() {
  searchPerformed.value = true
  expandedResultId.value = null
  await nextTick()
  resultsRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
        <span class="itinerary-demo">{{ t('custom.itinerary.demoTag') }}</span>
      </div>
    </section>

    <main class="container itinerary-content">
      <nav v-if="activeItinerary" class="itinerary-transport-tabs" :aria-label="t('custom.itinerary.modeLabel')">
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
          <div><p class="section-tag">{{ t('custom.itinerary.form.eyebrow') }}</p><h2>{{ t('custom.itinerary.form.itemTitle', { number: String(itineraries.findIndex(entry => entry.id === item.id) + 1).padStart(2, '0') }) }}</h2></div>
          <button v-if="itineraries.length > 1" class="itinerary-remove" type="button" :aria-label="t('custom.itinerary.form.remove')" @click="removeItinerary(item.id)">× <span>{{ t('custom.itinerary.form.remove') }}</span></button>
        </header>

        <div class="itinerary-form-lines">
          <label class="itinerary-form-line"><strong>{{ t('custom.itinerary.form.status') }}</strong><select v-model="item.status"><option v-for="status in statuses" :key="status.value" :value="status.value">{{ status.label }}</option></select></label>
          <label class="itinerary-form-line"><strong>POL</strong><input v-model="item.pol" type="text" :placeholder="portPlaceholder(item, 'pol')" /></label>
          <label class="itinerary-form-line"><strong>POD</strong><input v-model="item.pod" type="text" :placeholder="portPlaceholder(item, 'pod')" /></label>
          <label class="itinerary-form-line"><strong>Closing</strong><input v-model="item.closing" type="date" /></label>
          <label class="itinerary-form-line"><strong>ETD</strong><input v-model="item.etd" type="date" /></label>
          <label class="itinerary-form-line"><strong>ETA</strong><input v-model="item.eta" type="date" /></label>
          <label class="itinerary-form-line"><strong>{{ labels.modality }}</strong><select v-model="item.modality"><option v-for="option in optionsFor(item)" :key="option" :value="option">{{ option }}</option></select></label>
        </div>
        </template>
      </section>

      <div class="itinerary-actions">
        <button class="itinerary-search-button" type="button" @click="searchItineraries"><IconSymbol glyph="⌕" aria-hidden="true" />{{ t('custom.itinerary.form.search') }}</button>
      </div>

      <section v-if="searchPerformed" ref="resultsRef" class="itinerary-search-results" aria-live="polite">
        <header class="itinerary-search-results__heading">
          <div><p class="section-tag">{{ t('custom.itinerary.form.resultsEyebrow') }}</p><h2>{{ t('custom.itinerary.form.resultsTitle') }}</h2></div>
          <span>{{ itineraries.length }} {{ t('custom.itinerary.form.resultsCount') }}</span>
        </header>
        <article v-for="(item, index) in itineraries" :key="item.id" class="itinerary-result-card">
          <div class="itinerary-result-card__status">
            <small>{{ t('custom.itinerary.form.status') }}</small>
            <strong>{{ t('custom.itinerary.form.itemTitle', { number: String(index + 1).padStart(2, '0') }) }}</strong>
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
      </section>

      <section class="itinerary-cta"><div><p class="section-tag light-tag">CASTRO FALLAS</p><h2>{{ t('custom.itinerary.ctaTitle') }}</h2></div><a href="/cotizaciones" class="btn btn-white">{{ t('custom.itinerary.ctaButton') }} <IconSymbol glyph="↗" /></a></section>
      <a class="itinerary-back" href="/home"><IconSymbol glyph="←" /> {{ t('custom.itinerary.backHome') }}</a>
    </main>
    <SiteFooter />
  </div>
</template>
