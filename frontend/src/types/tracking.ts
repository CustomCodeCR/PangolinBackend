// Estructura pública de datos ficticios de tracking (nunca coordenadas GPS reales).
export type TrackingStatus = 'planned' | 'in_transit' | 'arrived' | 'delivered'
export interface TrackingPoint {
  name: string
  lat: number
  lon: number
  /** Approximate map location only. A country centroid is never an airport or port. */
  precision?: 'known-place' | 'city-centroid' | 'regional-centroid' | 'port-approximation' | 'country-centroid'
  /** Used to avoid rendering an extra country stop when a specific place is known. */
  countryIso?: string
}
export interface TrackingDemoShipment {
  demo: true
  referenceType: 'BL' | 'HBL' | 'IDTRA' | 'CONTAINER' | 'PO'
  referenceCode: string
  origin: TrackingPoint
  destination: TrackingPoint
  status: TrackingStatus
  progressPercent: number
  etd: string
  eta: string
  updatedAtUtc: string
}

// Route geometry is illustrative, not a satellite position.
