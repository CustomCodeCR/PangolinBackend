// Illustrative port coordinates only. Never interpret these points as vessel GPS positions.
import type { TrackingPoint } from '../types/tracking'

const portCatalog: ReadonlyArray<{ keys: string[]; point: TrackingPoint }> = [
  { keys: ['qingdao'], point: { name: 'Qingdao, China', lat: 36.0671, lon: 120.3826 } },
  { keys: ['pto. caldera', 'puerto caldera', 'caldera'], point: { name: 'Caldera, Costa Rica', lat: 9.912, lon: -84.72 } },
  { keys: ['mundra'], point: { name: 'Mundra, India', lat: 22.74, lon: 69.70 } },
  { keys: ['cristobal', 'colon, panama'], point: { name: 'Cristóbal, Panamá', lat: 9.35, lon: -79.90 } },
  { keys: ['san jose, costa rica'], point: { name: 'San José, Costa Rica', lat: 9.93, lon: -84.09 } }
]

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function locate(value: string | null | undefined): TrackingPoint | null {
  if (!value) return null
  const normalized = normalize(value)
  for (const port of portCatalog) {
    if (port.keys.some(key => normalized.includes(key))) return port.point
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
