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
    const response = await fetch('/api/quotes/official/locations?' + qs.toString(), {
      credentials: 'same-origin', cache: 'no-store'
    })
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
    loadingLocations.value = !!mode
    if (!mode) return

    try {
      const [origin, destination] = await Promise.all([
        loadRole(mode, 'origin'), loadRole(mode, 'destination')
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
