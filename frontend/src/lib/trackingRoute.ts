// Illustrative port coordinates only. Never interpret these points as vessel GPS positions.
// quoteCatalogName entries correspond to the verified official quote seaport names.
// This lightweight mapping does not change the official quotes database, selections or API.
import type { TrackingPoint } from '../types/tracking'
import trackingPorts from './trackingPorts.json'

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,/()\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function containsLocation(haystack: string, needle: string): boolean {
  const normalized = normalize(needle)
  return normalized.length > 0 && (` ${haystack} `).includes(` ${normalized} `)
}

function locate(value: string | null | undefined): TrackingPoint | null {
  if (!value) return null
  const normalized = normalize(value)
  for (const port of trackingPorts) {
    const names = [port.name, port.quoteCatalogName, ...port.aliases]
    if (names.some(name => name && containsLocation(normalized, name))) {
      return { name: port.name, lat: port.lat, lon: port.lon }
    }
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
