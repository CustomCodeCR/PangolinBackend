<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { authState, refreshSession } from '../services/auth'

interface DynamicsRecord {
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
}
interface SearchResponse {
  source: 'dynamics'
  referenceType: string
  referenceCode: string
  records: DynamicsRecord[]
  truncated: boolean
}

const { locale } = useI18n({ useScope: 'global' })
const en = computed(() => locale.value.toLowerCase().startsWith('en'))
const admin = computed(() => authState.user?.role === 'administrador')
const type = ref('IDTRA')
const reference = ref('')
const busy = ref(false)
const searched = ref(false)
const failure = ref('')
const data = ref<SearchResponse | null>(null)
let requestController: AbortController | null = null

onMounted(() => { void refreshSession() })
onBeforeUnmount(() => requestController?.abort())
watch([type, reference, admin], () => {
  requestController?.abort()
  busy.value = false
  searched.value = false
  failure.value = ''
  data.value = null
})

const labels = computed(() => en.value ? {
  title: 'Dynamics tracking · Admin preview',
  hint: 'Protected test view. Real records are visible only to administrators. The globe above still illustrates demo data.',
  type: 'Search by', reference: 'Reference', search: 'Consult Dhole', loading: 'Consulting…',
  invalid: 'Enter 3–64 letters, digits, hyphens or underscores.',
  unavailable: 'The lookup is not available or your session has expired.',
  empty: 'No matching shipment records were returned.',
  found: 'Records returned', more: 'More records may exist. This preview displays at most 25.',
  status: 'Status', origin: 'Origin', destination: 'Destination', mode: 'Transport',
  pol: 'Port of loading', poe: 'Port of entry', etd: 'Estimated departure', eta: 'Estimated arrival',
  vessel: 'Vessel', container: 'Container', bcf: 'BCF', updated: 'Last updated',
  notice: 'These are Dynamics records, not GPS tracking. No current vessel position or progress percentage is inferred.'
} : {
  title: 'Rastreo Dynamics · Vista previa de administración',
  hint: 'Consulta de prueba protegida. Solo administradores pueden ver estos registros. El globo superior continúa mostrando datos de demostración.',
  type: 'Buscar por', reference: 'Referencia', search: 'Consultar Dhole', loading: 'Consultando…',
  invalid: 'Ingresá de 3 a 64 letras, números, guiones o guiones bajos.',
  unavailable: 'La consulta no está disponible o tu sesión expiró.',
  empty: 'No se encontraron embarques con esa referencia.',
  found: 'Registros recibidos', more: 'Puede haber más registros. Esta vista muestra un máximo de 25.',
  status: 'Estado', origin: 'Origen', destination: 'Destino', mode: 'Transporte',
  pol: 'Puerto de salida', poe: 'Puerto de entrada', etd: 'Salida estimada', eta: 'Llegada estimada',
  vessel: 'Buque', container: 'Contenedor', bcf: 'BCF', updated: 'Última actualización',
  notice: 'Estos datos vienen de Dynamics, no de GPS. No se inventan posiciones ni porcentajes de progreso.'
})

function displayDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(en.value ? 'en-US' : 'es-CR', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
  }).format(date)
}

async function search() {
  requestController?.abort()
  const controller = new AbortController()
  requestController = controller
  const code = reference.value.trim()
  searched.value = true
  failure.value = ''
  data.value = null
  if (!/^[a-z0-9_-]{3,64}$/i.test(code)) {
    failure.value = labels.value.invalid
    return
  }
  busy.value = true
  try {
    const response = await fetch('/api/tracking/dynamics/search', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ type: type.value, reference: code }),
      signal: controller.signal
    })
    if (!response.ok) {
      failure.value = response.status === 400 ? labels.value.invalid : labels.value.unavailable
      return
    }
    const payload: SearchResponse = await response.json()
    if (payload.source !== 'dynamics' || !Array.isArray(payload.records)) {
      failure.value = labels.value.unavailable
      return
    }
    data.value = payload
  } catch {
    if (!controller.signal.aborted) failure.value = labels.value.unavailable
  } finally {
    if (requestController === controller) {
      busy.value = false
      requestController = null
    }
  }
}
</script>

<template>
  <section v-if="admin" class="dhole-preview" aria-label="Dhole Dynamics">
    <div class="dhole-preview__heading">
      <div>
        <span class="dhole-preview__badge">ADMIN · DHOLE</span>
        <h2>{{ labels.title }}</h2>
      </div>
    </div>
    <p class="dhole-preview__hint">{{ labels.hint }}</p>
    <form @submit.prevent="search">
      <div class="dhole-preview__fields">
        <label>{{ labels.type }}
          <select v-model="type" :disabled="busy">
            <option value="IDTRA">IDTRA</option>
            <option value="BCF">BCF</option>
            <option value="CONTAINER">{{ en ? 'Container' : 'Contenedor' }}</option>
            <option value="PO">PO</option>
          </select>
        </label>
        <label>{{ labels.reference }}
          <input v-model="reference" maxlength="64" autocomplete="off" :placeholder="labels.reference" :disabled="busy" />
        </label>
      </div>
      <button class="btn btn-primary dhole-preview__button" type="submit" :disabled="busy">
        {{ busy ? labels.loading : labels.search }}
      </button>
    </form>
    <p v-if="failure" role="alert" class="dhole-preview__error">{{ failure }}</p>
    <div v-else-if="searched && data" class="dhole-preview__results" role="status" aria-live="polite">
      <p><strong>{{ labels.found }}: {{ data.records.length }}</strong></p>
      <p v-if="data.records.length === 0">{{ labels.empty }}</p>
      <p v-if="data.truncated">{{ labels.more }}</p>
      <article v-for="(item, index) in data.records" :key="index" class="dhole-preview__record">
        <h3>{{ item.title || data.referenceCode }}</h3>
        <dl>
          <div><dt>{{ labels.status }}</dt><dd>{{ item.status || '—' }}</dd></div>
          <div><dt>{{ labels.origin }}</dt><dd>{{ item.origin || '—' }}</dd></div>
          <div><dt>{{ labels.destination }}</dt><dd>{{ item.destination || '—' }}</dd></div>
          <div><dt>{{ labels.mode }}</dt><dd>{{ item.mode || '—' }}</dd></div>
          <div><dt>{{ labels.pol }}</dt><dd>{{ item.portOfLoading || '—' }}</dd></div>
          <div><dt>{{ labels.poe }}</dt><dd>{{ item.portOfEntry || '—' }}</dd></div>
          <div><dt>{{ labels.etd }}</dt><dd>{{ displayDate(item.etd) }}</dd></div>
          <div><dt>{{ labels.eta }}</dt><dd>{{ displayDate(item.eta) }}</dd></div>
          <div><dt>{{ labels.vessel }}</dt><dd>{{ item.vessel || '—' }}</dd></div>
          <div><dt>{{ labels.container }}</dt><dd>{{ item.container || '—' }}</dd></div>
          <div><dt>{{ labels.bcf }}</dt><dd>{{ item.bcf || '—' }}</dd></div>
          <div><dt>{{ labels.updated }}</dt><dd>{{ displayDate(item.updatedAtUtc) }}</dd></div>
        </dl>
      </article>
      <p class="dhole-preview__hint">{{ labels.notice }}</p>
    </div>
  </section>
</template>

<style scoped>
.dhole-preview { margin-top:24px; padding:clamp(22px,4vw,36px); border:1px solid #a80e184d; border-radius:24px; background:var(--track-surface,#fff); color:var(--track-ink,#222); }
.dhole-preview__heading { display:flex; justify-content:space-between; align-items:start; }
.dhole-preview__heading h2 { margin:8px 0; font-size:clamp(23px,3vw,30px); }
.dhole-preview__badge { display:inline-block; color:#b50928; font-size:12px; font-weight:800; letter-spacing:.06em; }
.dhole-preview__hint { color:var(--track-muted,#69707c); line-height:1.6; }
.dhole-preview__fields { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,2fr); gap:16px; }
.dhole-preview__fields label { display:grid; gap:9px; font-weight:700; min-width:0; }
.dhole-preview__fields select,.dhole-preview__fields input { width:100%; box-sizing:border-box; min-height:52px; padding:10px 12px; border:1px solid #96969b7d; border-radius:12px; color:inherit; background:var(--track-surface,#fff); font:inherit; }
.dhole-preview__button { width:100%; margin-top:18px; }
.dhole-preview__error { color:#b50928; font-weight:700; }
.dhole-preview__record { margin-top:18px; padding:18px; border-radius:15px; border:1px solid #96969b4d; }
.dhole-preview__record h3 { margin:0 0 14px; overflow-wrap:anywhere; }
.dhole-preview__record dl { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:15px; margin:0; }
.dhole-preview__record dt { font-size:12px; font-weight:700; opacity:.75; }
.dhole-preview__record dd { margin:4px 0 0; overflow-wrap:anywhere; }
@media(max-width:650px) { .dhole-preview__fields,.dhole-preview__record dl { grid-template-columns:minmax(0,1fr); } }
</style>
