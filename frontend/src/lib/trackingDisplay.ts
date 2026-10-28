/**
 * Localize known categorical values received from Dynamics, for display only.
 * Do not translate free-form notes, merchandise descriptions or identifiers:
 * those must remain exactly as entered by the customer/operations team.
 */
type Language = 'es' | 'en'
type LocalizedValue = Readonly<{ es: string; en: string }>

function normalizeLookup(value: string): string {
  return value.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-_\/\u2010-\u2015]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const maritime: LocalizedValue = { es: 'Marítimo', en: 'Maritime' }
const air: LocalizedValue = { es: 'Aéreo', en: 'Air' }
const ground: LocalizedValue = { es: 'Terrestre', en: 'Road' }

const transportNames: Readonly<Record<string, LocalizedValue>> = {
  maritimo: maritime, maritime, ocean: maritime, 'ocean freight': maritime,
  sea: maritime, 'sea freight': maritime,
  aereo: air, air, 'air freight': air,
  terrestre: ground, ground, road: ground, 'road freight': ground, land: ground
}

const preliquidation: LocalizedValue = { es: 'Preliquidación', en: 'Pre-liquidation' }
// Booking is an established logistics term. "Ready" must not imply confirmed.
const bookingReady: LocalizedValue = { es: 'Booking listo', en: 'Booking ready' }
const delayed: LocalizedValue = { es: 'Demorado', en: 'Delayed' }
const inTransit: LocalizedValue = { es: 'En tránsito', en: 'In transit' }
const completed: LocalizedValue = { es: 'Completado', en: 'Completed' }
const cancelled: LocalizedValue = { es: 'Cancelado', en: 'Cancelled' }

const shipmentStatuses: Readonly<Record<string, LocalizedValue>> = {
  'booking listo': bookingReady,
  'booking ready': bookingReady,
  demorado: delayed,
  delayed,
  'pre liquidacion': preliquidation,
  preliquidacion: preliquidation,
  'pre liquidation': preliquidation,
  preliquidation,
  programado: { es: 'Programado', en: 'Scheduled' },
  scheduled: { es: 'Programado', en: 'Scheduled' },
  pendiente: { es: 'Pendiente', en: 'Pending' },
  pending: { es: 'Pendiente', en: 'Pending' },
  'en transito': inTransit,
  'in transit': inTransit,
  'en proceso': { es: 'En proceso', en: 'In progress' },
  'in progress': { es: 'En proceso', en: 'In progress' },
  'en aduana': { es: 'En aduana', en: 'At customs' },
  'at customs': { es: 'En aduana', en: 'At customs' },
  'despacho aduanal': { es: 'Despacho aduanal', en: 'Customs clearance' },
  'customs clearance': { es: 'Despacho aduanal', en: 'Customs clearance' },
  entregado: { es: 'Entregado', en: 'Delivered' },
  delivered: { es: 'Entregado', en: 'Delivered' },
  completado: completed,
  finalizado: completed,
  completed,
  cancelado: cancelled,
  canceled: cancelled,
  cancelled
}

/**
 * Values like "1 contenedor" represent a plain equipment count, not a
 * configuration. Show only the number; preserve complex configurations,
 * unknown values and the original record from Dynamics.
 */
export function formatTrackingEquipmentCount(value: string | null | undefined): string | null {
  const original = value?.trim()
  if (!original) return null
  const countOnly = /^(\d+)\s+(?:contenedor(?:es)?|container(?:s)?)\.?$/i.exec(original)
  return countOnly ? countOnly[1] : original
}

export function localizeTrackingMode(value: string | null | undefined, language: Language): string {
  const original = value?.trim()
  if (!original) return '—'
  const normalized = normalizeLookup(original)
  // Equipment abbreviations are identifiers, not words to translate.
  const parts = /^(.*?)(?:\s+(fcl|lcl|ftl|ltl))?$/.exec(normalized)
  if (!parts) return original
  const translated = transportNames[parts[1]]
  if (!translated) return original
  return translated[language] + (parts[2] ? ' ' + parts[2].toUpperCase() : '')
}

export function localizeTrackingStatus(value: string | null | undefined, language: Language): string {
  const original = value?.trim()
  if (!original) return '—'
  return shipmentStatuses[normalizeLookup(original)]?.[language] ?? original
}
