<script setup lang="ts">
import IconSymbol from './components/IconSymbol.vue'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { authState } from './services/auth'

type Quote = {
  id: string
  serviceType: string
  origin: string
  destination: string
  cargoType: string
  weightKg: number | null
  pieces: number | null
  notes?: string | null
  status: string
  createdAtUtc: string
}

type QuoteMode = 'land' | 'air' | 'maritime' | 'multimodal'
type TransportKind = 'FTL' | 'LTL'

const { t, tm } = useI18n({ useScope: 'global' })
const mode = ref<QuoteMode | null>(null)
const landStep = ref(0)
const transportKind = ref<TransportKind>('FTL')
const loading = ref(false)
const error = ref('')
const quote = ref<Quote | null>(null)
const source = ref('')
const quickSent = ref(false)
const contact = reactive({ fullName: '', email: '', country: 'Costa Rica', phone: '', company: '' })
const quickContact = reactive({ fullName: '', email: '', country: '', phone: '', company: '', request: '' })
const land = reactive({ origin: '', destination: '', equipment: '', insured: false, customerType: '', weightKg: '' as number | '' })
const cargo = reactive({
  weightKg: '' as number | '', contactName: '', company: '', phone: '', email: '', nationalization: '', shippingType: 'Marítimo FCL - Contenedor completo', operation: 'Exportación', incoterm: '', origin: '', destination: '', entryCountry: '', containerType: '', description: '', containers: 1, dangerous: '', details: ''
})

const countries = computed(() => tm('custom.quote.countries') as unknown as string[])
const landEquipment = computed(() => transportKind.value === 'FTL'
  ? tm('custom.quote.equipmentOptions.ftl') as unknown as string[]
  : tm('custom.quote.equipmentOptions.ltl') as unknown as string[])
const landAsideTitle = computed(() => landStep.value === 0 ? t('custom.quote.landAsideStart') : t(transportKind.value === 'FTL' ? 'custom.quote.asideFtl' : 'custom.quote.asideLtl'))

function startFlow(selected: QuoteMode) {
  mode.value = selected
  landStep.value = 0
  quote.value = null
  error.value = ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function backToLanding() {
  mode.value = null
  landStep.value = 0
  quote.value = null
  error.value = ''
}

function advanceLand() {
  error.value = ''
  if (landStep.value === 1 && (!land.origin || !land.destination || !land.equipment)) {
    error.value = t('custom.quote.completeRoute')
    return
  }
  if (landStep.value === 2 && (!contact.email || !contact.company || !contact.phone || !contact.fullName || !land.customerType)) {
    error.value = t('custom.quote.completeContact')
    return
  }
  landStep.value = Math.min(2, landStep.value + 1)
}

function retreatLand() {
  error.value = ''
  landStep.value = Math.max(0, landStep.value - 1)
}

function startCargoForm(selected: 'air' | 'maritime' | 'multimodal') {
  mode.value = selected
  cargo.entryCountry = ''
  cargo.shippingType = selected === 'air' ? 'Aéreo' : selected === 'multimodal'
    ? 'Multimodal' : 'Marítimo FCL - Contenedor completo'
  error.value = ''
  quickSent.value = false
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function sendQuickContact() {
  const subject = encodeURIComponent(t('custom.quote.emailSubject'))
  const body = encodeURIComponent([
    `${t('custom.quote.fullName')}: ${quickContact.fullName}`,
    `${t('custom.quote.company')}: ${quickContact.company}`,
    `${t('custom.quote.country')}: ${quickContact.country}`,
    `${t('custom.quote.phone')}: ${quickContact.phone}`,
    `${t('custom.quote.email')}: ${quickContact.email}`,
    '', quickContact.request
  ].join('\n'))
  window.location.href = `mailto:comercial@castrofallas.com?subject=${subject}&body=${body}`
  quickSent.value = true
}

async function readApiResponse(response: Response) {
  const raw = await response.text()
  let data: any = null
  if (raw) {
    try { data = JSON.parse(raw) } catch { /* La API debe devolver JSON. */ }
  }
  if (response.status === 401) throw new Error(t('custom.quote.sessionExpired'))
  if (!response.ok) throw new Error(data?.error ?? data?.detail ?? t('custom.login.errorHttp', { status: response.status }))
  if (!data) throw new Error(t('custom.quote.invalidApi'))
  return data
}

function quotePayload() {
  if (mode.value === 'land') {
    return {
      serviceType: 'Land', origin: land.origin, destination: land.destination,
      weightKg: land.weightKg === '' ? null : Number(land.weightKg),
      contact: {
        fullName: contact.fullName, company: contact.company,
        email: contact.email, phone: contact.phone, country: contact.country
      },
      land: {
        transportKind: transportKind.value, equipment: land.equipment,
        insured: land.insured, customerType: land.customerType
      }
    }
  }
  const isMultimodal = mode.value === 'multimodal'
  const isAir = mode.value === 'air'
  const serviceType = isMultimodal ? 'Multimodal' : isAir ? 'Air' : 'Maritime'
  const base = {
    serviceType, origin: cargo.origin, destination: cargo.destination,
    weightKg: cargo.weightKg === '' ? null : Number(cargo.weightKg),
    contact: {
      fullName: cargo.contactName, company: cargo.company,
      email: cargo.email, phone: cargo.phone, country: null
    }
  }
  const shared = {
    operation: cargo.operation, incoterm: cargo.incoterm,
    nationalization: cargo.nationalization === 'Sí',
    description: cargo.description, quantity: Number(cargo.containers),
    dangerousGoods: cargo.dangerous === '' ? null : cargo.dangerous === 'Sí',
    additionalDetails: cargo.details || null
  }
  if (isAir && !isMultimodal) {
    return { ...base, air: { ...shared, equipmentType: cargo.containerType } }
  }
  if (isMultimodal) {
    return {
      ...base, multimodal: {
        ...shared, entryCountry: cargo.entryCountry.trim(), containerType: cargo.containerType
      }
    }
  }
  return {
    ...base,
    maritime: {
      ...shared,
      shippingType: cargo.shippingType.includes('LCL') ? 'LCL' : 'FCL',
      containerType: cargo.containerType
    }
  }
}

async function submitQuote() {
  if (authState.user?.role !== 'cliente') {
    window.location.assign('/bienvenidos?next=' + encodeURIComponent('/cotizaciones'))
    return
  }
  if (mode.value === 'multimodal' && !cargo.entryCountry.trim()) {
    error.value = t('custom.quote.entryCountryRequired')
    return
  }
  if (mode.value === 'land' && (!contact.email || !contact.company || !contact.phone || !contact.fullName || !land.customerType)) {
    error.value = t('custom.quote.completeContactBeforeSend')
    return
  }
  loading.value = true
  error.value = ''
  quote.value = null
  try {
    const response = await fetch('/api/quotes', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(quotePayload())
    })
    quote.value = await readApiResponse(response)
    source.value = response.headers.get('X-Data-Source') ?? t('custom.quote.sourceRegistered')
    if (mode.value === 'land') landStep.value = 3
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('custom.quote.submitError')
  } finally {
    loading.value = false
  }
}

async function reloadQuote() {
  if (!quote.value) return
  loading.value = true
  error.value = ''
  try {
    const response = await fetch(`/api/quotes/${quote.value.id}`)
    quote.value = await readApiResponse(response)
    source.value = response.headers.get('X-Data-Source') ?? t('custom.quote.sourceUpdated')
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('custom.quote.checkError')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="quote-flow">
    <section v-if="!mode" class="quote-landing">
      <header class="quote-landing-heading">
        <p class="quote-kicker">{{ $t('custom.quote.landingEyebrow') }}</p>
        <h1>{{ $t('custom.quote.landingHeading') }} <span>{{ $t('custom.quote.landingHighlight') }}</span></h1>
        <p>{{ $t('custom.quote.landingIntro') }}</p>
      </header>
      <div class="quote-landing-grid">
        <div class="quote-choice-stack">
          <article class="quote-choice-card quote-choice-card--land">
            <div><span class="quote-choice-icon" aria-hidden="true">▰</span><p class="quote-kicker">{{ $t('custom.quote.landLabel') }}</p><h2>{{ $t('custom.quote.landTitle') }}</h2><p>{{ $t('custom.quote.landDescription') }}</p></div>
            <button class="quote-pill quote-pill--red" type="button" @click="startFlow('land')">{{ $t('custom.quote.landButton') }} <IconSymbol glyph="↗" /></button>
          </article>
          <article class="quote-choice-card quote-choice-card--ocean">
            <div><span class="quote-choice-icon" aria-hidden="true"><IconSymbol glyph="✈" :size="24" /></span><p class="quote-kicker">{{ $t('custom.quote.airLabel') }}</p><h2>{{ $t('custom.quote.airTitle') }}</h2><p>{{ $t('custom.quote.airDescription') }}</p></div>
            <button class="quote-pill quote-pill--navy" type="button" @click="startCargoForm('air')">{{ $t('custom.quote.airButton') }} <IconSymbol glyph="↗" /></button>
          </article>
          <article class="quote-choice-card quote-choice-card--ocean">
            <div><span class="quote-choice-icon" aria-hidden="true">⚓</span><p class="quote-kicker">{{ $t('custom.quote.maritimeLabel') }}</p><h2>{{ $t('custom.quote.maritimeTitle') }}</h2><p>{{ $t('custom.quote.maritimeDescription') }}</p></div>
            <button class="quote-pill quote-pill--navy" type="button" @click="startCargoForm('maritime')">{{ $t('custom.quote.maritimeButton') }} <IconSymbol glyph="↗" /></button>
          </article>
          <article class="quote-choice-card quote-choice-card--ocean">
            <div><span class="quote-choice-icon" aria-hidden="true">⇄</span><p class="quote-kicker">{{ $t('custom.quote.multimodalLabel') }}</p><h2>{{ $t('custom.quote.multimodalTitle') }}</h2><p>{{ $t('custom.quote.multimodalDescription') }}</p></div>
            <button class="quote-pill quote-pill--navy" type="button" @click="startCargoForm('multimodal')">{{ $t('custom.quote.multimodalButton') }} <IconSymbol glyph="↗" /></button>
          </article>
        </div>
        <form class="quote-quick-form" @submit.prevent="sendQuickContact">
          <p class="quote-kicker">{{ $t('custom.quote.quickEyebrow') }}</p><h2>{{ $t('custom.quote.quickTitle') }}</h2>
          <p class="quote-quick-intro">{{ $t('custom.quote.quickIntro') }}</p>
          <div class="quote-fields quote-fields--two">
            <label>{{ $t('custom.quote.fullName') }} <i>*</i><input v-model="quickContact.fullName" autocomplete="name" required /></label>
            <label>{{ $t('custom.quote.company') }} <i>*</i><input v-model="quickContact.company" autocomplete="organization" required /></label>
            <label>{{ $t('custom.quote.country') }} <i>*</i><input v-model="quickContact.country" list="quote-countries" required /></label>
            <label>{{ $t('custom.quote.phone') }} <i>*</i><input v-model="quickContact.phone" type="tel" autocomplete="tel" required /></label>
            <label class="quote-field-wide">{{ $t('custom.quote.email') }} <i>*</i><input v-model="quickContact.email" type="email" autocomplete="email" required /></label>
            <label class="quote-field-wide">{{ $t('custom.quote.requestLabel') }} <i>*</i><textarea v-model="quickContact.request" rows="3" required /></label>
          </div>
          <datalist id="quote-countries"><option v-for="country in countries" :key="country" :value="country" /></datalist>
          <button class="quote-submit" type="submit">{{ $t('custom.quote.sendRequest') }} <IconSymbol glyph="↗" /></button>
          <p v-if="quickSent" class="quote-hint">{{ $t('custom.quote.mailOpened') }}</p>
        </form>
      </div>
    </section>

    <section v-else-if="mode === 'land'" class="quote-wizard">
      <button class="quote-text-back" type="button" @click="backToLanding">{{ $t('custom.quote.back') }}</button>
      <div class="quote-wizard-title"><p class="quote-kicker">{{ $t('custom.quote.requestEyebrow') }}</p><h1>{{ $t('custom.quote.transportHeading') }} <span>{{ $t('custom.quote.land') }}</span></h1><p>{{ $t('custom.quote.prepare') }}</p></div>
      <div class="quote-progress" :aria-label="$t('custom.quote.progressAria')">
        <div v-for="(label, index) in [$t('custom.quote.steps.0'), $t('custom.quote.steps.1'), $t('custom.quote.steps.2')]" :key="label" class="quote-progress-step" :class="{ 'is-active': index <= landStep, 'is-current': quote ? index === 2 : index === landStep }">
          <span><IconSymbol :glyph="index === 0 ? '▰' : index === 1 ? '▤' : '✓'" /></span><small>{{ label }}</small>
        </div>
      </div>

      <div class="quote-wizard-layout">
        <aside class="quote-wizard-aside"><div class="quote-map-dots" aria-hidden="true"></div><span class="quote-truck-art" aria-hidden="true"><IconSymbol glyph="truck" :size="128" /></span><p class="quote-kicker">{{ $t('custom.quote.asideEyebrow') }}</p><h2>{{ landAsideTitle }}</h2><p>{{ $t('custom.quote.asideIntro') }}</p></aside>
        <section class="quote-wizard-panel">
          <template v-if="landStep === 0">
            <p class="quote-panel-kicker">{{ $t('custom.quote.transportStep') }}</p><h2>{{ $t('custom.quote.chooseTransport') }}</h2><p class="quote-panel-copy">{{ $t('custom.quote.chooseTransportHelp') }}</p>
            <div class="transport-options">
              <button type="button" class="transport-choice" :class="{ 'is-selected': transportKind === 'FTL' }" @click="transportKind = 'FTL'"><span class="transport-truck" aria-hidden="true">▰</span><strong>{{ $t('custom.quote.ftl') }}</strong><small>{{ $t('custom.quote.ftlDetail') }}</small></button>
              <button type="button" class="transport-choice" :class="{ 'is-selected': transportKind === 'LTL' }" @click="transportKind = 'LTL'"><span class="transport-truck" aria-hidden="true">▰</span><strong>{{ $t('custom.quote.ltl') }}</strong><small>{{ $t('custom.quote.ltlDetail') }}</small></button>
            </div>
          </template>

          <template v-else-if="landStep === 1">
            <p class="quote-panel-kicker">{{ $t('custom.quote.cargoStep') }}</p><h2>{{ $t('custom.quote.cargoDetails') }}</h2><p class="quote-panel-copy">{{ $t('custom.quote.cargoDetailsHelp') }}</p>
            <div class="quote-fields">
              <label>{{ $t('custom.quote.equipment') }} <i>*</i><select v-model="land.equipment" required><option disabled value="">{{ $t('custom.quote.select') }}</option><option v-for="equipment in landEquipment" :key="equipment">{{ equipment }}</option></select></label>
              <label class="quote-check"><input v-model="land.insured" type="checkbox" /> {{ $t('custom.quote.insured') }}</label>
              <label>{{ $t('custom.quote.weightKg') }} <input v-model.number="land.weightKg" type="number" min="0.01" step="0.01" /></label>
              <div class="quote-fields--two">
              <label>{{ $t('custom.quote.origin') }} <i>*</i><select v-model="land.origin" required><option disabled value="">{{ $t('custom.quote.selectCountry') }}</option><option v-for="country in countries" :key="country">{{ country }}</option></select></label>
              <label>{{ $t('custom.quote.destination') }} <i>*</i><select v-model="land.destination" required><option disabled value="">{{ $t('custom.quote.selectCountry') }}</option><option v-for="country in countries" :key="country">{{ country }}</option></select></label>
              </div>
            </div>
          </template>

          <template v-else>
            <p class="quote-panel-kicker">{{ $t('custom.quote.contactStep') }}</p><h2>{{ $t('custom.quote.contactDetails') }}</h2><p class="quote-panel-copy">{{ $t('custom.quote.contactHelp') }}</p>
            <div class="quote-fields">
              <div class="quote-fields--two">
                <label>{{ $t('custom.quote.legalName') }} <i>*</i><input v-model="contact.company" autocomplete="organization" required /></label>
                <label>{{ $t('custom.quote.contactName') }} <i>*</i><input v-model="contact.fullName" autocomplete="name" required /></label>
                <label>{{ $t('custom.quote.email') }} <i>*</i><input v-model="contact.email" type="email" autocomplete="email" required /></label>
                <label>{{ $t('custom.quote.phone') }} <i>*</i><input v-model="contact.phone" type="tel" autocomplete="tel" required /></label>
              </div>
              <label>{{ $t('custom.quote.customerType') }} <i>*</i><select v-model="land.customerType" required><option disabled value="">{{ $t('custom.quote.select') }}</option><option>{{ $t('custom.quote.companyType') }}</option><option>{{ $t('custom.quote.individualType') }}</option></select></label>
            </div>
          </template>

          <p v-if="error" class="quote-error">{{ error }}</p>
          <div v-if="!quote" class="quote-wizard-actions"><button v-if="landStep > 0" class="quote-previous" type="button" @click="retreatLand">{{ $t('custom.quote.backStep') }}</button><span v-else></span><button v-if="landStep < 2" class="quote-next" type="button" @click="advanceLand">{{ $t('custom.quote.next') }} <span>›</span></button><button v-else class="quote-next" type="button" :disabled="loading" @click="submitQuote">{{ loading ? $t('custom.quote.sending') : $t('custom.quote.requestRate') }} <span>›</span></button></div>
          <article v-if="quote" class="quote-success"><IconSymbol glyph="✓" :size="20" /><h2>{{ $t('custom.quote.successTitle') }}</h2><p>{{ $t('custom.quote.landSuccess') }}</p><small>{{ $t('custom.quote.requestNumber') }} {{ quote.id }}</small><button class="quote-next" type="button" :disabled="loading" @click="reloadQuote">{{ loading ? $t('custom.quote.checking') : $t('custom.quote.checkStatus') }}</button><small>{{ $t('custom.quote.status') }} {{ quote.status }} · {{ source }}</small></article>
        </section>
      </div>
    </section>

    <section v-else class="quote-ocean-flow">
      <button class="quote-text-back" type="button" @click="backToLanding">{{ $t('custom.quote.back') }}</button>
      <header class="quote-cargo-heading"><p class="quote-kicker">{{ $t('custom.quote.oceanEyebrow') }}</p><h1>{{ mode === 'air' ? $t('custom.quote.airTitle') : mode === 'maritime' ? $t('custom.quote.maritimeTitle') : $t('custom.quote.multimodalTitle') }} <span>{{ $t('custom.quote.withUs') }}</span></h1><p>{{ $t('custom.quote.oceanIntro') }}</p></header>
      <form class="quote-cargo-form" @submit.prevent="submitQuote">
        <section class="cargo-form-section">
          <div class="cargo-form-section__heading"><span>01</span><div><h2>{{ $t('custom.quote.routeService') }}</h2><p>{{ $t('custom.quote.routeHelp') }}</p></div></div>
          <div class="quote-fields quote-fields--two">
            <label>{{ $t('custom.quote.origin') }} <i>*</i><input v-model="cargo.origin" list="quote-countries" required /></label>
            <label>{{ $t('custom.quote.destination') }} <i>*</i><input v-model="cargo.destination" list="quote-countries" required /></label>
            <label v-if="mode === 'maritime'" class="quote-field-wide">{{ $t('custom.quote.service') }} <i>*</i><select v-model="cargo.shippingType" required><option value="Marítimo FCL - Contenedor completo">{{ $t('custom.quote.maritimeFcl') }}</option><option value="Marítimo LCL - Carga consolidada">{{ $t('custom.quote.maritimeLcl') }}</option></select></label>
            <label v-if="mode === 'multimodal'" class="quote-field-wide">{{ $t('custom.quote.entryCountry') }} <i>*</i><input v-model.trim="cargo.entryCountry" list="quote-countries" required /></label>
            <label>{{ $t('custom.quote.operation') }} <i>*</i><select v-model="cargo.operation" required><option value="Exportación">{{ $t('custom.quote.export') }}</option><option value="Importación">{{ $t('custom.quote.import') }}</option></select></label>
            <label>{{ $t('custom.quote.incoterm') }} <i>*</i><select v-model="cargo.incoterm" required><option disabled value="">{{ $t('custom.quote.choose') }}</option><option v-for="term in ['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP']" :key="term">{{ term }}</option></select></label>
            <label class="quote-field-wide">{{ $t('custom.quote.nationalization') }} <i>*</i><select v-model="cargo.nationalization" required><option disabled value="">{{ $t('custom.quote.choose') }}</option><option value="Sí">{{ $t('custom.quote.yes') }}</option><option value="No">{{ $t('custom.quote.no') }}</option></select></label>
          </div>
        </section>
        <section class="cargo-form-section">
          <div class="cargo-form-section__heading"><span>02</span><div><h2>{{ $t('custom.quote.detailsGoods') }}</h2><p>{{ $t('custom.quote.goodsHelp') }}</p></div></div>
          <div class="quote-fields quote-fields--two">
            <label class="quote-field-wide">{{ $t('custom.quote.descriptionGoods') }} <i>*</i><small>{{ $t('custom.quote.goodsExample') }}</small><textarea v-model="cargo.description" rows="2" required /></label>
            <label>{{ mode === 'air' ? $t('custom.quote.airEquipment') : $t('custom.quote.containerType') }} <i>*</i><select v-model="cargo.containerType" required><option disabled value="">{{ $t('custom.quote.choose') }}</option><option>{{ $t('custom.quote.container20') }}</option><option>{{ $t('custom.quote.container40') }}</option><option>{{ $t('custom.quote.container40hc') }}</option><option>{{ $t('custom.quote.refrigerated') }}</option><option>{{ $t('custom.quote.notApplicable') }}</option></select></label>
            <label>{{ $t('custom.quote.quantity') }} <i>*</i><input v-model.number="cargo.containers" type="number" min="1" required /></label>
            <label>{{ $t('custom.quote.weightKg') }} <input v-model.number="cargo.weightKg" type="number" min="0.01" step="0.01" /></label>
            <label>{{ $t('custom.quote.dangerous') }} <select v-model="cargo.dangerous"><option value="">{{ $t('custom.quote.choose') }}</option><option value="Sí">{{ $t('custom.quote.yes') }}</option><option value="No">{{ $t('custom.quote.no') }}</option></select></label>
            <label>{{ $t('custom.quote.moreDetails') }}<textarea v-model="cargo.details" rows="3" /></label>
          </div>
        </section>
        <section class="cargo-form-section">
          <div class="cargo-form-section__heading"><span>03</span><div><h2>{{ $t('custom.quote.contactDetails') }}</h2><p>{{ $t('custom.quote.contactSectionHelp') }}</p></div></div>
          <div class="quote-fields quote-fields--two">
            <label>{{ $t('custom.quote.company') }} <i>*</i><input v-model="cargo.company" autocomplete="organization" required /></label>
            <label>{{ $t('custom.quote.name') }} <i>*</i><input v-model="cargo.contactName" autocomplete="name" required /></label>
            <label>{{ $t('custom.quote.companyEmail') }} <i>*</i><input v-model="cargo.email" type="email" autocomplete="email" required /></label>
            <label>{{ $t('custom.quote.customerPhone') }} <i>*</i><input v-model="cargo.phone" type="tel" autocomplete="tel" required /></label>
          </div>
        </section>
        <datalist id="quote-countries"><option v-for="country in countries" :key="country" :value="country" /></datalist>
        <p v-if="error" class="quote-error">{{ error }}</p>
        <button class="quote-submit" type="submit" :disabled="loading">{{ loading ? $t('custom.quote.sending') : $t('custom.quote.sendQuote') }} <IconSymbol glyph="↗" /></button>
        <article v-if="quote" class="quote-success quote-success--cargo"><IconSymbol glyph="✓" :size="20" /><h2>{{ $t('custom.quote.successTitle') }}</h2><p>{{ $t('custom.quote.oceanSuccess') }}</p><small>{{ $t('custom.quote.requestNumber') }} {{ quote.id }} · {{ $t('custom.quote.status') }} {{ quote.status }} · {{ source }}</small></article>
      </form>
    </section>
  </main>
</template>
