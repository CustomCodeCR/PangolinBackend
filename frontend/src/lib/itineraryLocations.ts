// Shared active place catalog used by the official quotation wizard.
// Keep itinerary locations as display names, since itinerary records store text.
export type ItineraryLocation = { id: string; displayName: string; code: string | null }
export type ItineraryLocationMode = 'maritime' | 'ground' | 'all'
type LocationRole = 'origin' | 'destination'
const cache = new Map<string, Promise<ItineraryLocation[]>>()

function requestLocations(kind: string, shipmentType: string, role: LocationRole): Promise<ItineraryLocation[]> {
  const params = new URLSearchParams({ kind, shipmentType, routeRole: role })
  const key = params.toString()
  const cached = cache.get(key)
  if (cached) return cached
  const promise = fetch('/api/assistant/quote-locations?' + key, {
    credentials: 'same-origin', cache: 'no-store'
  }).then(async response => {
    if (!response.ok) throw new Error('No se pudo consultar el catálogo de ubicaciones.')
    const data = await response.json() as { items?: ItineraryLocation[] }
    if (!Array.isArray(data.items)) throw new Error('El catálogo devolvió un formato inesperado.')
    return data.items
  }).catch((error: unknown) => {
    cache.delete(key) // Allow a later retry after network or rate-limit failures.
    throw error
  })
  cache.set(key, promise)
  return promise
}

export async function itineraryLocationChoices(mode: ItineraryLocationMode, role: LocationRole): Promise<ItineraryLocation[]> {
  const types = [
    ...(mode === 'all' || mode === 'maritime' ? [['seaport', 'FCL'], ['seaport', 'LCL']] : []),
    ...(mode === 'all' || mode === 'ground' ? [['inland', 'FTL'], ['inland', 'LTL']] : [])
  ]
  const lists = await Promise.all(types.map(([kind, type]) => requestLocations(kind, type, role)))
  const distinct = new Map<string, ItineraryLocation>()
  for (const location of lists.flat()) {
    if (!location || !location.displayName) continue
    distinct.set(location.displayName.trim().toLocaleLowerCase(), location)
  }
  return [...distinct.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'))
}
