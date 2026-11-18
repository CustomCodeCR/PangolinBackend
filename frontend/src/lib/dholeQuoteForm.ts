// Dynamically projected, validated server-side by the official quotes backend.
// No Dhole key or upstream URL is ever used in the browser.
export type DholeFormLocation = { id: string; displayName: string; code: string | null }
export type DholeFormChoice = { value: string; label: string }

export type DholeQuoteFormOptions = {
  source: 'dhole'
  mode: 'Maritime' | 'Air' | 'Land'
  shipmentType: 'FCL' | 'LCL' | 'AIR_LCL' | 'FTL' | 'LTL'
  incoterms: string[]
  origins: DholeFormLocation[]
  destinations: DholeFormLocation[]
  pods: DholeFormLocation[]
  equipmentSizes: DholeFormChoice[]
  equipmentTypesBySize: Record<string, string[]>
}

function isLocation(item: unknown): item is DholeFormLocation {
  if (!item || typeof item !== 'object') return false
  const value = item as Record<string, unknown>
  return typeof value.id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id) &&
    typeof value.displayName === 'string' &&
    value.displayName.length > 0 &&
    (value.code === null || typeof value.code === 'string')
}

function isChoice(item: unknown): item is DholeFormChoice {
  if (!item || typeof item !== 'object') return false
  const choice = item as Record<string, unknown>
  return typeof choice.value === 'string' && !!choice.value &&
    typeof choice.label === 'string' && !!choice.label
}

function checkOptions(value: unknown,
  mode: DholeQuoteFormOptions['mode'],
  shipmentType: DholeQuoteFormOptions['shipmentType']
): value is DholeQuoteFormOptions {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.source !== 'dhole' || v.mode !== mode || v.shipmentType !== shipmentType ||
      !Array.isArray(v.incoterms) || !v.incoterms.every(x => typeof x === 'string' && !!x) ||
      !Array.isArray(v.origins) || !v.origins.every(isLocation) ||
      !Array.isArray(v.destinations) || !v.destinations.every(isLocation) ||
      !Array.isArray(v.pods) || !v.pods.every(isLocation) ||
      !Array.isArray(v.equipmentSizes) || !v.equipmentSizes.every(isChoice) ||
      !v.equipmentTypesBySize || typeof v.equipmentTypesBySize !== 'object' ||
      Array.isArray(v.equipmentTypesBySize)) return false
  const types = Object.values(v.equipmentTypesBySize as Record<string, unknown>)
  return v.incoterms.length > 0 && v.origins.length > 0 && v.destinations.length > 0 &&
    (mode !== 'Maritime' || v.pods.length > 0) &&
    (shipmentType !== 'FCL' && shipmentType !== 'FTL' || v.equipmentSizes.length > 0) &&
    types.every(list => Array.isArray(list) && list.every(x => typeof x === 'string' && !!x))
}

export async function loadDholeQuoteFormOptions(
  mode: DholeQuoteFormOptions['mode'],
  shipmentType: DholeQuoteFormOptions['shipmentType']
): Promise<DholeQuoteFormOptions | null> {
  const query = new URLSearchParams({ mode, shipmentType })
  const response = await fetch('/api/quotes/official/dhole-options?' + query, {
    credentials: 'same-origin',
    cache: 'no-store'
  })
  if (response.status === 404) {
    // Only a known feature-disabled response permits legacy catalogue fallback.
    // An unexpected 404 means an inconsistent rollout; do not silently submit old data.
    const body = await response.json().catch(() => null) as {code?: string} | null
    if (body?.code === 'dhole_form_disabled') return null
  }
  if (!response.ok) throw new Error('No se pudo cargar el catálogo oficial de Dhole.')
  const data: unknown = await response.json()
  if (!checkOptions(data, mode, shipmentType)) {
    throw new Error('El catálogo de Dhole devolvió opciones incompletas.')
  }
  return data
}
