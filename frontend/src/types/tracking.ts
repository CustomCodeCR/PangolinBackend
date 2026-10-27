// Estructura pública de datos ficticios de tracking (nunca coordenadas GPS reales).
export type TrackingStatus = 'planned' | 'in_transit' | 'arrived' | 'delivered'
export interface TrackingPoint {
  name: string
  lat: number
  lon: number
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
