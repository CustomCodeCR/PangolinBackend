<script setup lang="ts">
import { reactive, ref } from 'vue'

type Quote = {
  id: string
  serviceType: string
  origin: string
  destination: string
  cargoType: string
  weightKg: number
  pieces: number
  notes?: string | null
  status: string
  createdAtUtc: string
}

const form = reactive({
  serviceType: (['Air','Land','Maritime'].includes(new URLSearchParams(window.location.search).get('servicio') ?? '') ? new URLSearchParams(window.location.search).get('servicio') : 'Maritime') as string,
  origin: 'Shanghai, China',
  destination: 'Puerto Caldera, Costa Rica',
  cargoType: 'General cargo',
  weightKg: 15000,
  pieces: 1,
  notes: ''
})

const loading = ref(false)
const error = ref('')
const quote = ref<Quote | null>(null)
const source = ref('')

async function readApiResponse(response: Response) {
    const raw = await response.text()
    let data: any = null

    if (raw) {
      try {
        data = JSON.parse(raw)
      } catch {
        // Manejo silencioso si no es JSON válido
      }
    }

    // CORREGIDO: Lanzar error SOLO si la respuesta NO es exitosa (!response.ok)
    if (!response.ok) {
      const message =
        data?.error ??
        data?.detail ??
        `Error HTTP ${response.status}`

      throw new Error(message)
    }

    if (!data) {
      throw new Error(`La API no devolvió una respuesta válida.`)
    }
    return data
}

async function submitQuote() {
  loading.value = true
  error.value = ''
  quote.value = null

  try {
    const response = await fetch('/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })

    const data = await readApiResponse(response)

    quote.value = data
    source.value = 'postgres'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error inesperado.'
  } finally {
    loading.value = false
  }
}

async function reloadQuote() {
  if (!quote.value) return

  loading.value = true
  error.value = ''

  try {
    // CORREGIDO: Usar acentos graves (backticks) para la interpolación de variables de JS
    const response = await fetch(`/api/quotes/${quote.value.id}`)
    const data = await readApiResponse(response)

    quote.value = data
    source.value = response.headers.get('X-Data-Source') ?? 'desconocido'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error inesperado.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="page-shell">
    <section class="hero">
      <p class="eyebrow">TU SOLICITUD</p>
      <h2>Detalles de tu carga</h2>
      <p>
        Completá la información para registrar tu solicitud de cotización.
      </p>
    </section>

    <section class="panel">
      <form class="quote-form" @submit.prevent="submitQuote">
        <label>
          Servicio
          <select v-model="form.serviceType">
            <option value="Maritime">Marítimo</option>
            <option value="Air">Aéreo</option>
            <option value="Land">Terrestre</option>
          </select>
        </label>

        <div class="two-columns">
          <label>
            Origen
            <input v-model="form.origin" required />
          </label>

          <label>
            Destino
            <input v-model="form.destination" required />
          </label>
        </div>

        <label>
          Tipo de carga
          <input v-model="form.cargoType" required />
        </label>

        <div class="two-columns">
          <label>
            Peso total (kg)
            <input v-model.number="form.weightKg" type="number" min="0.01" step="0.01" required />
          </label>

          <label>
            Piezas
            <input v-model.number="form.pieces" type="number" min="1" required />
          </label>
        </div>

        <label>
          Información adicional
          <textarea v-model="form.notes" rows="4" placeholder="Detalles opcionales de la carga" />
        </label>

        <button :disabled="loading" type="submit">
          {{ loading ? 'Procesando…' : 'Enviar a Pricing' }}
        </button>
      </form>

      <p v-if="error" class="error">{{ error }}</p>

      <article v-if="quote" class="result-card">
        <div>
          <span class="status">{{ quote.status }}</span>
          <h2>Solicitud recibida</h2>
          <p class="quote-id">{{ quote.id }}</p>
        </div>

        <dl>
          <div><dt>Ruta</dt><dd>{{ quote.origin }} → {{ quote.destination }}</dd></div>
          <div><dt>Servicio</dt><dd>{{ quote.serviceType }}</dd></div>
          <div><dt>Carga</dt><dd>{{ quote.cargoType }}</dd></div>
          <div><dt>Peso</dt><dd>{{ quote.weightKg }} kg</dd></div>
          <div><dt>Piezas</dt><dd>{{ quote.pieces }}</dd></div>
        </dl>

        <div class="result-footer">
          <small>Fuente de la última operación: {{ source }}</small>
          <button class="secondary" :disabled="loading" @click="reloadQuote">
            Consultar nuevamente
          </button>
        </div>
      </article>
    </section>
  </main>
</template>
