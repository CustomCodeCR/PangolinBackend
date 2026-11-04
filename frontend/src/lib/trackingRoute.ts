// Approximate geographic points for illustration only; never vessel GPS.
// trackingQuoteCoordinates.json contains city-centroid data (ODbL v1.0) and
// is kept separate from the official quote catalog and its operational data.
// The quoteCatalogName entries reuse verified names from the official quote catalog
// without changing its database, selectable locations or API.
import type { TrackingPoint } from '../types/tracking'
import trackingPorts from './trackingPorts.json'
import trackingQuoteCoordinates from './trackingQuoteCoordinates.json'

type KnownPort = { name: string; lat: number; lon: number; aliases: string[]; quoteCatalogName?: string }

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,/()\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Pre-normalize aliases once; require token boundaries so generic country
// names never masquerade as an actual port.
const portCatalog = ([...trackingPorts, ...trackingQuoteCoordinates] as KnownPort[]).map(port => ({
  point: { name: port.name, lat: port.lat, lon: port.lon },
  aliases: [port.name, port.quoteCatalogName, ...port.aliases]
    .filter((value): value is string => !!value)
    .map(normalize)
}))

function locate(value: string | null | undefined): TrackingPoint | null {
  if (!value) return null
  const normalized = ` ${normalize(value)} `
  for (const port of portCatalog) {
    if (port.aliases.some(alias => alias && normalized.includes(` ${alias} `))) return port.point
  }
  return null
}

export function illustrativeRoute(record: {
  portOfLoading: string | null; portOfEntry: string | null
  origin: string | null; destination: string | null
}): { origin: TrackingPoint; destination: TrackingPoint } | null {
  const origin = locate(record.portOfLoading) ?? locate(record.origin)
  const destination = locate(record.portOfEntry) ?? locate(record.destination)
  if (!origin || !destination) return null
  if (origin.lat === destination.lat && origin.lon === destination.lon) return null
  return { origin, destination }
}

/** Uses only named locations actually supplied by Dynamics, with illustrative catalog coordinates.
 * Unknown locations are skipped, never replaced with invented transit stops. */
export function illustrativeJourney(record: {
  origin: string | null; portOfLoading: string | null
  portOfEntry: string | null; destination: string | null
  routeStops?: string[] | null
}): TrackingPoint[] {
  const supplied = [record.origin, record.portOfLoading, ...(record.routeStops ?? []), record.portOfEntry, record.destination]
  const points: TrackingPoint[] = []
  for (const name of supplied) {
    const point = locate(name)
    if (!point) continue
    const last = points[points.length - 1]
    if (last && last.lat === point.lat && last.lon === point.lon) continue
    points.push(point)
  }
  return points.length >= 2 ? points : []
}
