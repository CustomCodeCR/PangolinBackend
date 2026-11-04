// Approximate geographic points for illustration only; never vessel GPS.
// trackingQuoteCoordinates.json contains approximate city and port geography:
// the original city dataset is ODbL 1.0; additional locations retain per-source
// attribution (see docs/DHOLE-TRACKING-PREVIEW.md). This data is separate from
// the official quote database and its operational data.
// The quoteCatalogName entries reuse verified names from the official quote catalog
// without changing its database, selectable locations or API.
import type { TrackingPoint } from '../types/tracking'
import trackingPorts from './trackingPorts.json'
import trackingQuoteCoordinates from './trackingQuoteCoordinates.json'
import trackingCountries from './trackingCountries.json'

type KnownPort = {
  name: string
  lat: number
  lon: number
  aliases: string[]
  quoteCatalogName?: string
  coordinatePrecision?: TrackingPoint['precision']
}
type KnownCountry = {
  name: string
  nameEs: string
  iso2: string
  lat: number
  lon: number
}

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,/()\-:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Only use explicitly known alternative names. Do not guess airports from
// a country or let short ISO codes collide with normal words.
const extraCountryAliases: Record<string, string[]> = {
  US: ['USA', 'U.S.A.', 'EEUU', 'EE. UU.', 'Estados Unidos de América', 'United States of America'],
  GB: ['UK', 'Gran Bretaña', 'Great Britain'],
  KR: ['Corea del Sur', 'South Korea'],
  TW: ['Taiwán', 'Taiwan'],
  HK: ['Hong Kong SAR', 'Hong Kong'],
  CZ: ['Chequia', 'Czechia', 'Czech Republic'],
  AE: ['Emiratos Árabes Unidos', 'UAE'],
  DO: ['República Dominicana', 'Dominican Republic']
}
const countryCatalog = (trackingCountries as KnownCountry[]).map(country => ({
  ...country,
  aliases: [...new Set([country.name, country.nameEs, ...(extraCountryAliases[country.iso2] ?? [])]
    .map(normalize).filter(Boolean))]
}))

/** Match only a complete country or a country at the END of a location field.
 * Prefer the longest match, and reject ambiguous ties. */
function findCountry(value: string): KnownCountry | null {
  const normalized = normalize(value)
  if (!normalized) return null
  let best: KnownCountry | null = null
  let bestLength = 0
  let ambiguous = false
  for (const country of countryCatalog) {
    for (const alias of country.aliases) {
      if (normalized !== alias && !normalized.endsWith(' ' + alias)) continue
      if (alias.length > bestLength) {
        best = country
        bestLength = alias.length
        ambiguous = false
      } else if (alias.length === bestLength && best?.iso2 !== country.iso2) {
        ambiguous = true
      }
    }
  }
  return ambiguous ? null : best
}

// Resolve the existing verified quote coordinates first. A generic country is
// a fallback only and never overrides a specific matching city or port.
const portCatalog = ([...trackingPorts, ...trackingQuoteCoordinates] as KnownPort[]).map(port => ({
  point: {
    name: port.name, lat: port.lat, lon: port.lon,
    precision: port.coordinatePrecision ?? 'known-place',
    countryIso: findCountry(port.name)?.iso2
  } satisfies TrackingPoint,
  aliases: [port.name, port.quoteCatalogName, ...port.aliases]
    .filter((value): value is string => !!value)
    .map(normalize)
}))

/** Resolve Dynamics text to an explicitly labelled *illustrative* point.
 * No online geocoder is called and no port, city or airport is fabricated. */
export function resolveTrackingLocation(value: string | null | undefined): TrackingPoint | null {
  if (!value?.trim()) return null
  const normalized = ' ' + normalize(value) + ' '
  for (const port of portCatalog) {
    if (port.aliases.some(alias => alias && normalized.includes(' ' + alias + ' '))) {
      return port.point
    }
  }
  const country = findCountry(value)
  if (!country) return null
  return {
    name: country.nameEs || country.name,
    lat: country.lat, lon: country.lon,
    precision: 'country-centroid', countryIso: country.iso2
  }
}

export function illustrativeRoute(record: {
  portOfLoading: string | null; portOfEntry: string | null
  origin: string | null; destination: string | null
}): { origin: TrackingPoint; destination: TrackingPoint } | null {
  const origin = resolveTrackingLocation(record.portOfLoading) ?? resolveTrackingLocation(record.origin)
  const destination = resolveTrackingLocation(record.portOfEntry) ?? resolveTrackingLocation(record.destination)
  if (!origin || !destination) return null
  if (origin.lat === destination.lat && origin.lon === destination.lon) return null
  return { origin, destination }
}

/** Uses only locations actually supplied by Dynamics. Country-only values map to
 * clearly labelled country reference coordinates, never to a guessed airport. */
export function illustrativeJourney(record: {
  origin: string | null; portOfLoading: string | null
  portOfEntry: string | null; destination: string | null
  routeStops?: string[] | null
}): TrackingPoint[] {
  const supplied = [record.origin, record.portOfLoading, ...(record.routeStops ?? []), record.portOfEntry, record.destination]
  const resolved = supplied.map(resolveTrackingLocation).filter((point): point is TrackingPoint => !!point)
  // A generic origin/destination country must not introduce fictional stops
  // when a more precise location in the same country was supplied.
  const countriesWithSpecificPlaces = new Set(resolved
    .filter(point => point.precision !== 'country-centroid' && point.countryIso)
    .map(point => point.countryIso))
  const points: TrackingPoint[] = []
  for (const point of resolved) {
    if (point.precision === 'country-centroid' && countriesWithSpecificPlaces.has(point.countryIso)) continue
    const last = points[points.length - 1]
    if (last && last.lat === point.lat && last.lon === point.lon) continue
    points.push(point)
  }
  return points.length >= 2 ? points : []
}
