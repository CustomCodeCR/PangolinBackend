import { ref, watch, type Ref } from 'vue'

// Reuse the verified quote catalogue, without introducing an external API or
// copying a second (soon stale) list of cities into the itinerary screens.
export type ItineraryTransport = 'maritime' | 'ground'
export type ItineraryLocationRole = 'origin' | 'destination'
export type ItineraryLocationChoice = { value: string; label: string }

type CatalogueResponse = { items?: Array<{ displayName?: string; code?: string | null }> }
const catalogueCache = new Map<string, Promise<ItineraryLocationChoice[]>>()

function loadRole(mode: ItineraryTransport, role: ItineraryLocationRole): Promise<ItineraryLocationChoice[]> {
  const key = mode + ':' + role
  const cached = catalogueCache.get(key)
  if (cached) return cached

  const kind = mode === 'maritime' ? 'seaport' : 'inland'
  const types = mode === 'maritime' ? ['FCL', 'LCL'] : ['FTL', 'LTL']
  const request = Promise.all(types.map(async shipmentType => {
    const qs = new URLSearchParams({ kind, shipmentType, routeRole: role })
    let response = await fetch('/api/quotes/official/locations?' + qs.toString(), {
      credentials: 'same-origin', cache: 'no-store'
    })
    // Development previews may not have a registered cookie. Reuse the guest
    // quote catalogue in that case; both endpoints read the same location tables.
    if (response.status === 401 || response.status === 403) {
      response = await fetch('/api/assistant/quote-locations?' + qs.toString(), {
        credentials: 'same-origin', cache: 'no-store'
      })
    }
    if (!response.ok) throw new Error('No se pudo cargar el catálogo de ubicaciones.')
    const data = await response.json() as CatalogueResponse
    if (!Array.isArray(data.items)) throw new Error('El catálogo devolvió datos inesperados.')
    return data.items
  })).then(groups => {
    const unique = new Map<string, ItineraryLocationChoice>()
    for (const item of groups.flat()) {
      const name = (item.displayName || '').trim()
      if (name) unique.set(name.toLocaleLowerCase(), { value: name, label: name })
    }
    return [...unique.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'))
  }).catch(error => {
    catalogueCache.delete(key) // permit retry after a transient outage
    throw error
  })
  catalogueCache.set(key, request)
  return request
}

async function loadAllRoles(role: ItineraryLocationRole): Promise<ItineraryLocationChoice[]> {
  const [sea, land] = await Promise.all([loadRole('maritime', role), loadRole('ground', role)])
  const unique = new Map<string, ItineraryLocationChoice>()
  for (const item of [...sea, ...land]) unique.set(item.value.toLocaleLowerCase(), item)
  return [...unique.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'))
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
        mode ? loadRole(mode, 'origin') : loadAllRoles('origin'),
        mode ? loadRole(mode, 'destination') : loadAllRoles('destination')
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
