import { ref, watch, type Ref } from 'vue'

// Reuse the verified quote catalogue, without introducing an external API or
// copying a second (soon stale) list of cities into the itinerary screens.
export type ItineraryTransport = 'maritime' | 'ground'
export type ItineraryLocationRole = 'origin' | 'destination'
export type ItineraryLocationChoice = { value: string; label: string }

type CatalogueResponse = { items?: Array<{ displayName?: string; code?: string | null }> }
const catalogueCache = new Map<string, Promise<ItineraryLocationChoice[]>>()
// The catalogue is public, changes infrequently, and is shared by itinerary and admin.
// sessionStorage prevents a full burst of catalogue requests on every refresh.
const STORAGE_PREFIX = 'castrofallas:itinerary-locations:v1:'
const CACHE_MS = 5 * 60 * 1000

function readStored(key: string): ItineraryLocationChoice[] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key)
    if (!raw) return null
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object' || !('expires' in data) || !('items' in data)) return null
    const saved = data as { expires: unknown; items: unknown }
    if (typeof saved.expires !== 'number' || saved.expires <= Date.now() || !Array.isArray(saved.items)) return null
    if (!saved.items.every(item => item && typeof item.value === 'string' && typeof item.label === 'string')) return null
    return saved.items
  } catch { return null } // Storage can be disabled by browser policy.
}

function store(key: string, items: ItineraryLocationChoice[]) {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ expires: Date.now() + CACHE_MS, items }))
    sessionStorage.removeItem(STORAGE_PREFIX + 'cooldown:' + key)
  } catch { /* Keep the in-memory cache if storage is unavailable. */ }
}

function cooldownRemaining(key: string): number {
  try {
    const expires = Number(sessionStorage.getItem(STORAGE_PREFIX + 'cooldown:' + key))
    return Number.isFinite(expires) ? Math.max(0, Math.ceil((expires - Date.now()) / 1000)) : 0
  } catch { return 0 }
}

function cooldown(key: string, response: Response) {
  const header = Number(response.headers.get('Retry-After'))
  const seconds = Number.isFinite(header) && header > 0 ? Math.min(300, Math.ceil(header)) : 60
  try { sessionStorage.setItem(STORAGE_PREFIX + 'cooldown:' + key, String(Date.now() + seconds * 1000)) }
  catch { /* Optional browser storage. */ }
  return seconds
}

function loadRole(mode: ItineraryTransport | '', role: ItineraryLocationRole): Promise<ItineraryLocationChoice[]> {
  const key = (mode || 'all') + ':' + role
  const cached = catalogueCache.get(key)
  if (cached) return cached
  const stored = readStored(key)
  if (stored) return Promise.resolve(stored)
  const remaining = cooldownRemaining(key)
  if (remaining) return Promise.reject(new Error(`Demasiadas consultas. Volvé a intentar en ${remaining} segundos.`))

  // One aggregated public catalogue per role; the backend performs the FCL/LCL
  // or FTL/LTL union safely against the existing official quote tables.
  const qs = new URLSearchParams({ transport: mode || 'all', routeRole: role })
  const request = fetch('/api/itinerarios/locations?' + qs.toString(), {
    credentials: 'same-origin', cache: 'no-store'
  }).then(async response => {
    if (response.status === 429) {
      const seconds = cooldown(key, response)
      throw new Error(`Demasiadas consultas. Volvé a intentar en ${seconds} segundos.`)
    }
    if (!response.ok) throw new Error('No se pudo cargar el catálogo de ubicaciones.')
    const data = await response.json() as CatalogueResponse
    if (!Array.isArray(data.items)) throw new Error('El catálogo devolvió datos inesperados.')
    const unique = new Map<string, ItineraryLocationChoice>()
    for (const item of data.items) {
      const name = (item.displayName || '').trim()
      if (name) unique.set(name.toLocaleLowerCase(), { value: name, label: name })
    }
    const choices = [...unique.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'))
    store(key, choices)
    return choices
  }).catch(error => {
    catalogueCache.delete(key) // permit retry after a transient outage
    throw error
  })
  catalogueCache.set(key, request)
  // Also expire the in-memory entry for long-lived tabs.
  setTimeout(() => {
    if (catalogueCache.get(key) === request) catalogueCache.delete(key)
  }, CACHE_MS)
  return request
}

export function useItineraryLocations(transport: Ref<ItineraryTransport | ''>) {
  const origins = ref<ItineraryLocationChoice[]>([])
  const destinations = ref<ItineraryLocationChoice[]>([])
  const loadingLocations = ref(false)
  const locationError = ref('')
  let generation = 0

  watch(transport, async mode => {
    const current = ++generation
    origins.value = []
    destinations.value = []
    locationError.value = ''
    loadingLocations.value = true

    try {
      const [origin, destination] = await Promise.all([
        loadRole(mode, 'origin'),
        loadRole(mode, 'destination')
      ])
      if (current !== generation) return
      origins.value = origin
      destinations.value = destination
    } catch (error) {
      if (current !== generation) return
      locationError.value = error instanceof Error ? error.message : 'Error al cargar las ubicaciones.'
    } finally {
      if (current === generation) loadingLocations.value = false
    }
  }, { immediate: true })

  return { origins, destinations, loadingLocations, locationError }
}
