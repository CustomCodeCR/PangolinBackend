<script setup lang="ts">
import IconSymbol from './IconSymbol.vue'
import TrackingTransportModel from './TrackingTransportModel.vue'
import type { TrackingDemoShipment, TrackingPoint } from '../types/tracking'
import { computed, nextTick, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CastroGlobe, Marker, ClusterMarker } from '../lib/castroGlobe'

type TrackingRouteShape = Pick<TrackingDemoShipment, 'origin' | 'destination'> &
  Partial<Pick<TrackingDemoShipment, 'progressPercent'>> & {
    stops?: TrackingPoint[]
    transport?: 'air' | 'sea' | 'land' | 'multimodal' | null
  }
const props = defineProps<{ shipment?: TrackingRouteShape | null; initialZoom?: number; satelliteSurface?: boolean }>()
const holder = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const routePoints = computed(() => {
  const route = props.shipment
  if (!route) return []
  return route.stops && route.stops.length >= 2 ? route.stops : [route.origin, route.destination]
})
// Un solo vehículo recorre todas las escalas; la estela sigue el tramo ya transitado.
const transportGlyph = computed(() => props.shipment?.transport === 'air' ? '✈'
  : props.shipment?.transport === 'sea' ? 'ship'
  : props.shipment?.transport === 'land' ? 'truck'
  : props.shipment?.transport === 'multimodal' ? 'ship'
  : props.shipment ? 'container' : null)

const routeLegs = computed(() => {
  const legs = routePoints.value.slice(1).map((end, index) => {
    const start = routePoints.value[index]
    const rad = Math.PI / 180
    const cosine = Math.sin(start.lat * rad) * Math.sin(end.lat * rad)
      + Math.cos(start.lat * rad) * Math.cos(end.lat * rad) * Math.cos((end.lon - start.lon) * rad)
    const degrees = Math.acos(Math.max(-1, Math.min(1, cosine))) / rad
    return { start, end, duration: Math.max(2400, Math.min(13000, degrees * 95)) }
  }).filter(leg => leg.start.lat !== leg.end.lat || leg.start.lon !== leg.end.lon)

  // Dynamics no siempre etiqueta la multimodalidad: un marítimo con dos o
  // más tramos cambia del barco al camión en la PRIMERA escala.
  const seaToRoad = legs.length >= 2
    && (props.shipment?.transport === 'sea' || props.shipment?.transport === 'multimodal')
  return legs.map((leg, index) => ({
    ...leg,
    glyph: seaToRoad ? (index === 0 ? 'ship' : 'truck') : (transportGlyph.value ?? 'container')
  }))
})

const routeVehicle = ref<{ left: number; top: number; glyph: string; reversed: boolean } | null>(null)
const routeTrail = ref('')
const trailSize = ref({ width: 1, height: 1 })
let vehicleFrame = 0
let lastVehicleUpdate = -Infinity
let lastVehicleClock = 0
let vehicleElapsedMs = 0
let motionMedia: MediaQueryList | undefined

function updateRouteVehicle(now: number) {
  if (disposed) return
  // No avanzar el tiempo mientras la pestaña esté oculta.
  if (document.hidden) {
    lastVehicleClock = 0
  } else if (now - lastVehicleUpdate >= 42) {
    lastVehicleUpdate = now
    const legs = routeLegs.value
    if (globe && canvas.value && holder.value && legs.length) {
      if (lastVehicleClock && !motionMedia?.matches) {
        vehicleElapsedMs += Math.min(100, now - lastVehicleClock)
      }
      lastVehicleClock = now

      const total = legs.reduce((sum, leg) => sum + leg.duration, 0)
      let remaining = motionMedia?.matches ? 0 : vehicleElapsedMs % (total + 900)
      let activeIndex = legs.length - 1
      let activeProgress = 1
      for (let index = 0; index < legs.length; index++) {
        if (remaining <= legs[index].duration) {
          activeIndex = index
          activeProgress = remaining / legs[index].duration
          break
        }
        remaining -= legs[index].duration
      }

      const leg = legs[activeIndex]
      const activeGlobe = globe
      // Marítimo y aéreo vuelan sobre la esfera con elevación parabólica.
      // El camión viaja sobre la superficie: sin elevación en ningún punto.
      // El ícono y la estela usan siempre la misma proyección.
      const elevatedPoint = (segment: (typeof legs)[number], progress: number) => {
        const t = Math.max(0, Math.min(1, progress))
        const coordinates = illustrativePosition(segment.start, segment.end, t * 100)
        const lift = segment.glyph === 'truck' ? 0 : .22 * Math.sin(Math.PI * t)
        return activeGlobe.projectElevated(coordinates.lon, coordinates.lat, lift)
      }
      const projected = elevatedPoint(leg, activeProgress)
      const canvasRect = canvas.value.getBoundingClientRect()
      const holderRect = holder.value.getBoundingClientRect()
      const offsetX = canvasRect.left - holderRect.left
      const offsetY = canvasRect.top - holderRect.top
      const width = holderRect.width
      const height = holderRect.height
      if (trailSize.value.width !== width || trailSize.value.height !== height) {
        trailSize.value = { width, height }
      }

      // Dibujar únicamente la porción ya recorrida de cada tramo, incluyendo
      // las escalas completadas. Respetar la cara oculta y el borde del globo.
      if (motionMedia?.matches) {
        routeTrail.value = ''
      } else {
        const commands: string[] = []
        let previous: { x: number; y: number } | null = null
        for (let index = 0; index <= activeIndex; index++) {
          const segment = legs[index]
          const fraction = index === activeIndex ? activeProgress : 1
          const count = Math.max(1, Math.ceil(64 * fraction))
          for (let step = 0; step <= count; step++) {
            const p = elevatedPoint(segment, (step / count) * fraction)
            if (!p?.visible) {
              previous = null
              continue
            }
            const x = p.x + offsetX, y = p.y + offsetY
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
              previous = null
              continue
            }
            const contiguous = previous
              && Math.hypot(x - previous.x, y - previous.y) < Math.max(35, canvasRect.width * .35)
            commands.push((contiguous ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1))
            previous = { x, y }
          }
        }
        routeTrail.value = commands.join(' ')
      }

      if (projected?.visible) {
        const ahead = elevatedPoint(leg, Math.min(1, activeProgress + .01))
        const behind = elevatedPoint(leg, Math.max(0, activeProgress - .01))
        const facingLeft = ahead?.visible && ahead.x !== projected.x
          ? ahead.x < projected.x
          : (behind?.visible ? projected.x < behind.x : false)

        routeVehicle.value = {
          left: projected.x + offsetX,
          top: projected.y + offsetY,
          glyph: leg.glyph,
          reversed: facingLeft
        }
      } else routeVehicle.value = null
    } else {
      lastVehicleClock = 0
      routeVehicle.value = null
      routeTrail.value = ''
    }
  }
  vehicleFrame = requestAnimationFrame(updateRouteVehicle)
}
const error = ref('')
const { locale } = useI18n({ useScope: 'global' })
const english = computed(() => locale.value.toLowerCase().startsWith('en'))
function gmailComposeHref(email: string) {
  const params = new URLSearchParams({ view: 'cm', fs: '1', to: email })
  return `https://mail.google.com/mail/?${params.toString()}`
}

const selectedId = ref<string | null>(null)
const popupPosition = ref({ left: 0, top: 0, below: false })
const mobileLocationPopup = ref(false)
const locationCard = ref<HTMLElement | null>(null)
const locationCloseButton = ref<HTMLButtonElement | null>(null)
const mobilePopupPosition = ref({ left: 0, top: 0, below: false, visible: false })
let locationMedia: MediaQueryList | undefined
function syncLocationLayout() {
  mobileLocationPopup.value = locationMedia?.matches ?? false
  mobilePopupPosition.value.visible = false
  if (selectedOffice.value) {
    void nextTick(() => {
      const office = selectedOffice.value
      const point = office && globe?.project(office.lon, office.lat)
      if (point?.visible) positionPopup(point)
    })
  }
}
function onLocationKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && selectedId.value && mobileLocationPopup.value) {
    event.preventDefault()
    closeLocation()
  }
}
const offices = [
  { id:'curridabat', lat:9.9167, lon:-84.0333, es:'Curridabat', en:'Curridabat', countryEs:'Costa Rica',countryEn:'Costa Rica',address:'Frente a Café Volio, Barrio San José, Curridabat',email:'costarica@grupocastrofallas.com' },
  { id:'tibas', lat:9.9667, lon:-84.0833, es:'Tibás', en:'Tibas', countryEs:'Costa Rica',countryEn:'Costa Rica',address:'Detrás del Hotel El Edén, Tibás',email:'costarica@grupocastrofallas.com' },
  { id:'miami', lat:25.7617, lon:-80.1918, es:'Miami',en:'Miami',countryEs:'Estados Unidos',countryEn:'United States',address:'8501 NW 17 Street, Suite 101, Miami, FL 33126',email:'estadosunidos@grupocastrofallas.com' },
  { id:'new-york', lat:40.8043, lon:-74.0121, es:'North Bergen / Nueva York',en:'North Bergen / New York',countryEs:'Estados Unidos',countryEn:'United States',address:'6801 West Side Avenue, North Bergen, NJ 07047',email:'estadosunidos@grupocastrofallas.com' },
  { id:'houston', lat:29.7604, lon:-95.3698, es:'Houston',en:'Houston',countryEs:'Estados Unidos',countryEn:'United States',address:'2222 N. Wayside Dr., Houston, TX 77020',email:'estadosunidos@grupocastrofallas.com' },
  { id:'los-angeles', lat:33.8358, lon:-118.3406, es:'Los Ángeles / Torrance',en:'Los Angeles / Torrance',countryEs:'Estados Unidos',countryEn:'United States',address:'19001 Harborgate Way, Torrance, CA 90501',email:'estadosunidos@grupocastrofallas.com' },
  { id:'hueneme', lat:34.1975, lon:-119.1771, es:'Oxnard / Hueneme',en:'Oxnard / Hueneme',countryEs:'Estados Unidos',countryEn:'United States',address:'710 N Del Norte Blvd, Oxnard, CA 93030',email:'estadosunidos@grupocastrofallas.com' },
  { id:'barcelona',lat:41.3874,lon:2.1686,es:'Barcelona',en:'Barcelona',countryEs:'España',countryEn:'Spain',address:'C/ Illes Medes, Nave 1, 08192 Sant Quirze, Barcelona',email:'espana@grupocastrofallas.com' },
  { id:'panama',lat:8.9824,lon:-79.5199,es:'Panamá',en:'Panama City',countryEs:'Panamá',countryEn:'Panama',address:'France Field, Calle 7ma., Avenida 5ta., Panamá',email:'panama@grupocastrofallas.com' },
  { id:'xiamen',lat:24.4798,lon:118.0894,es:'Xiamen',en:'Xiamen',countryEs:'China',countryEn:'China',address:'Haoxin Logistics Park, Jinjiang',email:'consolidado-china@grupocastrofallas.com' },
  { id:'ningbo',lat:29.8683,lon:121.544,es:'Ningbo',en:'Ningbo',countryEs:'China',countryEn:'China',address:'No. 188, Citong Avenue, Ningbo',email:'consolidado-china@grupocastrofallas.com' },
  { id:'dalian',lat:38.914,lon:121.6147,es:'Dalian',en:'Dalian',countryEs:'China',countryEn:'China',address:'No. 6, West North Road, Dalian',email:'consolidado-china@grupocastrofallas.com' },
  { id:'qingdao',lat:36.0671,lon:120.3826,es:'Qingdao',en:'Qingdao',countryEs:'China',countryEn:'China',address:'Changqing Logistics Park, Qingdao',email:'consolidado-china@grupocastrofallas.com' },
  { id:'xingang',lat:39.0842,lon:117.2009,es:'Tianjin / Xingang',en:'Tianjin / Xingang',countryEs:'China',countryEn:'China',address:'Jinya Logistics Park, Dongli District, Tianjin',email:'consolidado-china@grupocastrofallas.com' },
  { id:'shenzhen',lat:22.5431,lon:114.0579,es:'Shenzhen',en:'Shenzhen',countryEs:'China',countryEn:'China',address:'Jinpeng Logistics Park, Shenzhen',email:'consolidado-china@grupocastrofallas.com' },
  { id:'guangzhou',lat:23.1291,lon:113.2644,es:'Guangzhou',en:'Guangzhou',countryEs:'China',countryEn:'China',address:'Huabang Logistics Park, Baiyun District, Guangzhou',email:'consolidado-china@grupocastrofallas.com' },
  { id:'fuzhou',lat:26.0745,lon:119.2965,es:'Fuzhou',en:'Fuzhou',countryEs:'China',countryEn:'China',address:'Haoxin Logistics Park, Fujian',email:'consolidado-china@grupocastrofallas.com' }
]
const selectedOffice = computed(() => offices.find(x => x.id === selectedId.value) ?? null)
const costaRicaOffices = offices.filter(location => location.countryEs === 'Costa Rica')
const selectedCostaRica = computed(() => selectedOffice.value?.countryEs === 'Costa Rica')
const selectedCity = computed(() => selectedOffice.value ? (english.value ? selectedOffice.value.en : selectedOffice.value.es) : '')
const selectedCountry = computed(() => selectedOffice.value ? (english.value ? selectedOffice.value.countryEn : selectedOffice.value.countryEs) : '')
const markerData = () => offices.map(office => ({...office, label:(english.value ? office.en : office.es) + ', ' + (english.value ? office.countryEn : office.countryEs), color:'#a80e18',count:1,size:4}))
// Posición interpolada sobre un círculo máximo: avance ficticio, NO una lectura GPS.
function illustrativePosition(start: TrackingPoint, end: TrackingPoint, percentage: number) {
  const toRad = Math.PI / 180
  const vector = (p: TrackingPoint) => {
    const lat = p.lat * toRad, lon = p.lon * toRad
    return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]
  }
  const a = vector(start), b = vector(end)
  const angle = Math.acos(Math.max(-1, Math.min(1, a.reduce((sum, value, i) => sum + value * b[i], 0))))
  const t = Math.max(0, Math.min(1, percentage / 100))
  if (angle < 1e-6) return { lat: start.lat, lon: start.lon }
  const f = Math.sin((1 - t) * angle) / Math.sin(angle)
  const g = Math.sin(t * angle) / Math.sin(angle)
  const x = f * a[0] + g * b[0], y = f * a[1] + g * b[1], z = f * a[2] + g * b[2]
  return { lat: Math.atan2(z, Math.hypot(x, y)) / toRad, lon: Math.atan2(y, x) / toRad }
}

const demoMarkers = () => {
  const shipment = props.shipment
  if (!shipment) return markerData()
  const points = routePoints.value.map((point, index, all) => ({
    id: 'route-stop-' + index, ...point,
    label: point.precision === 'country-centroid'
      ? (english.value ? point.name + ' · approximate country reference' : point.name + ' · referencia aproximada del país')
      : point.name,
    color: index === 0 ? '#1677d2' : index === all.length - 1 ? '#18a86d' : '#b50928',
    count: 1, size: 7
  }))
  const progressValue = shipment.progressPercent
  if (progressValue !== undefined && progressValue > 0 && progressValue < 100) {
    const progress = illustrativePosition(shipment.origin, shipment.destination, progressValue)
    points.push({ id: 'route-progress', name: 'Progreso DEMO', ...progress,
      label: 'DEMO · ' + progressValue + '%', color: '#f5b700', count: 1, size: 8 })
  }
  return points
}
const demoArcs = () => props.shipment || props.satelliteSurface
  ? [] // Tracking: Tierra natural sin arcos decorativos rojos; el envío mantiene su recorrido móvil.
  : offices.filter(item => item.countryEs !== 'Costa Rica').map(item => ({
    from: { lat: 9.9167, lon: -84.0333 },
    to: { lat: item.lat, lon: item.lon },
    color: '#a80e18', width: 1.15
  }))
const costaRicaCenter = { lat: 9.9417, lon: -84.0583 }



let globe: CastroGlobe | undefined
let observer: IntersectionObserver | undefined
let themeObserver: MutationObserver | undefined
let started = false
let disposed = false
let popupFollowFrame = 0
let zoomFrame = 0


function themePalette() {
  // Mismo globo 3D en modo claro y oscuro; el tema de la página sigue siendo independiente.
  return {
    ocean: ['#1e5f8f','#0f2f4f'] as [string,string],
    land:'#5e8d52',
    border:'#83aa79',
    marker:'#a80e18', arc:'#a80e18',
    label:'#ffffff',
    labelStroke:'rgba(10,12,18,.93)',
    graticule:'rgba(203,212,231,.22)',
    showGraticule:true,
    shadeStrength:.52
  }
}
function animateZoom(target: number) {
  if (!globe) return
  cancelAnimationFrame(zoomFrame)
  const from = globe.zoom
  const startedAt = performance.now()
  const tick = (now: number) => {
    if (!globe) return
    const fraction = Math.min(1, (now - startedAt) / 520)
    const eased = 1 - Math.pow(1 - fraction, 3)
    globe.setZoom(from + (target - from) * eased)
    if (fraction < 1) zoomFrame = requestAnimationFrame(tick)
  }
  zoomFrame = requestAnimationFrame(tick)
}
function closeLocation() {
  cancelAnimationFrame(popupFollowFrame)
  popupFollowFrame = 0
  selectedId.value = null
  mobilePopupPosition.value.visible = false
  globe?.setOptions({autoRotate: !props.shipment})
  // Vuelve al minimo real admitido por el motor (0.8), no al zoom de la oficina.
  animateZoom(0.8)
}
function positionPopup(point: {x:number;y:number}) {
  if (!holder.value || !canvas.value) return
  const root = holder.value.getBoundingClientRect()
  const rect = canvas.value.getBoundingClientRect()

  if (mobileLocationPopup.value) {
    const card = locationCard.value
    if (!card) return
    // The card is teleported to body, outside the clipping/stacking context of
    // the globe. Coordinates therefore must be in viewport, not globe, space.
    const vv = window.visualViewport
    const edgeLeft = vv?.offsetLeft ?? 0
    const edgeTop = vv?.offsetTop ?? 0
    const edgeRight = edgeLeft + (vv?.width ?? window.innerWidth)
    const edgeBottom = edgeTop + (vv?.height ?? window.innerHeight)
    const margin = 12
    const gap = 14
    const width = card.getBoundingClientRect().width
    const height = card.getBoundingClientRect().height
    const markerX = selectedCostaRica.value ? rect.left + rect.width / 2 : rect.left + point.x
    const markerY = selectedCostaRica.value ? rect.top + 18 : rect.top + point.y
    const left = Math.max(edgeLeft + margin + width / 2,
      Math.min(markerX, edgeRight - margin - width / 2))
    const spaceAbove = Math.max(0, markerY - edgeTop - margin - gap)
    const spaceBelow = Math.max(0, edgeBottom - markerY - margin - gap)
    const below = spaceAbove < height && spaceBelow > spaceAbove
    // Place the card adjacent to the pin. Flip if there isn't room above,
    // then clamp to the visible viewport so other sections never cover it.
    const top = below
      ? Math.max(edgeTop + margin, Math.min(markerY + gap, edgeBottom - margin - height))
      : Math.max(edgeTop + margin + height, Math.min(markerY - gap, edgeBottom - margin))
    mobilePopupPosition.value = { left, top, below, visible: true }
    return
  }

  if (selectedCostaRica.value) {
    popupPosition.value = {left:root.width / 2,top:14,below:true}
    return
  }
  const popupWidth = Math.min(270,root.width - 28)
  const x = rect.left - root.left + point.x
  const y = rect.top - root.top + point.y
  const below = y < 190
  popupPosition.value = {
    left:Math.max(popupWidth/2+14,Math.min(root.width-popupWidth/2-14,x)),
    top:Math.max(14,Math.min(root.height-14,y+(below?18:-14))),
    below
  }
}
function followSelectedPin(id: string,lon:number,lat:number) {
  cancelAnimationFrame(popupFollowFrame)
  // La ficha sigue al marcador a 20 Hz; evita actualizaciones DOM innecesarias a 60 Hz.
  let lastPositionUpdate = -Infinity
  const update = (now: number) => {
    if (!globe || selectedId.value !== id) return
    if (!document.hidden && now - lastPositionUpdate >= 50) {
      const point = globe.project(lon,lat)
      if (point?.visible) positionPopup(point)
      lastPositionUpdate = now
    }
    popupFollowFrame=requestAnimationFrame(update)
  }
  popupFollowFrame=requestAnimationFrame(update)
}
function selectWarehouse(marker: Marker | ClusterMarker,point: {x:number;y:number}) {
  const id = 'id' in marker ? String(marker.id ?? '') : ''
  const office = offices.find(x=>x.id===id)
  if (!office || !holder.value || !canvas.value) return
  selectedId.value=id
  mobilePopupPosition.value.visible = false
  if (mobileLocationPopup.value) {
    void nextTick(() => {
      positionPopup(point)
      locationCloseButton.value?.focus({ preventScroll: true })
    })
  }
  globe?.setOptions({autoRotate:false})
  positionPopup(point)
  if (globe) {
    globe.flyTo(selectedCostaRica.value ? costaRicaCenter.lon : office.lon, selectedCostaRica.value ? costaRicaCenter.lat : office.lat)
    animateZoom(selectedCostaRica.value ? 1.15 : 1.2)
    followSelectedPin(id,office.lon,office.lat)
  }
}

async function start() {
  if (started || !canvas.value || disposed) return
  started = true

  try {
    // Import the renderer and world-atlas data only when the globe approaches view.
    // The observer already controls when start() runs; keeping this import here
    // prevents these heavy dependencies from joining the initial Home bundle.
    const { createGlobe } = await import('../lib/castroGlobe')
    if (disposed || !canvas.value) return
    globe = createGlobe(canvas.value, {
      mode: 'globe',
      // /tracking should begin at the full-world reset view, not a close-up.
      // The home globe keeps its existing default zoom.
      zoom: props.initialZoom ?? 1,
      // Photographic Tracking starts over the Americas just like the supplied video.
      // Home and actual shipment targeting keep their original behavior.
      center: props.satelliteSurface && !props.shipment
        ? {lon:-75,lat:3} : undefined,
      transparentBackground: true,
      // Explicit opt-in: only Tracking.vue can enable the photographic globe.
      satelliteSurface: props.satelliteSurface === true,
      // Colores corporativos Castro Fallas
      theme: themePalette(),

      // Diseño de contornos
      landStyle: 'outline',

      // Efectos visuales
      graticule: true,
      stars: true,
      shade: true,
      orbits: 0,
      labels: 'markers',

      // Movimiento e interacción
      autoRotate: !props.shipment,
      rotateSpeed: 0.09,
      zoomable: true,
      maxZoom: 800,
      interactive: true,

      // Oficinas internacionales del material del equipo frontend (a validar antes de producción).
      markers: demoMarkers(),
      // Pines negros en claro y rojo en oscuro, igual que el ZIP del frontend.
      renderMarker(ctx, marker, {x,y,depth,scale}) {
        const dark = document.documentElement.classList.contains('theme-dark')
        const markerId = 'id' in marker ? String(marker.id) : ''
        const selected = markerId === selectedId.value
        const radius = (selected ? 9 : 8)*depth*scale
        const height = radius*2.45
        ctx.save()
        ctx.translate(x,y)
        ctx.shadowColor='rgba(10,15,30,.38)'
        ctx.shadowBlur=5*scale
        ctx.shadowOffsetY=2*scale
        ctx.beginPath()
        ctx.moveTo(0,height*.48)
        ctx.bezierCurveTo(-radius*.42,radius*.42,-radius*1.28,-radius*.2,-radius*1.28,-radius*.95)
        ctx.arc(0,-radius*.95,radius*1.28,Math.PI,0,true)
        ctx.bezierCurveTo(radius*1.28,-radius*.2,radius*.42,radius*.42,0,height*.48)
        ctx.closePath()
        ctx.fillStyle = markerId.startsWith('route-') ? ('color' in marker ? String(marker.color) : '#f5b700') : dark ? '#ad0922' : '#000000'
        ctx.fill()
        ctx.shadowColor='transparent'
        ctx.lineWidth=Math.max(1,scale)
        ctx.strokeStyle='#fff'
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(0,-radius*.95,radius*.43,0,Math.PI*2)
        ctx.fillStyle='#fff'
        ctx.fill()
        ctx.restore()
        return height*.65
      },
      onClick: selectWarehouse,
      arcs: demoArcs(),
    })
    if (props.shipment && routeLegs.value.length) {
      const firstLeg = routeLegs.value[0]
      const center = illustrativePosition(firstLeg.start, firstLeg.end, 50)
      globe.flyTo(center.lon, center.lat, { instant: true })
    }
  } catch (e) {
    if (!disposed) error.value =
      e instanceof Error ? e.message : 'Error al iniciar el mapa.'
  }
}

watch(locale, () => globe?.setMarkers(demoMarkers()))
watch(() => props.shipment, (shipment) => {
  vehicleElapsedMs = 0
  lastVehicleClock = 0
  lastVehicleUpdate = -Infinity
  routeVehicle.value = null
  routeTrail.value = ''
  if (!globe) return
  cancelAnimationFrame(popupFollowFrame)
  selectedId.value = null
  globe.setMarkers(demoMarkers())
  globe.setArcs(demoArcs())
  globe.setOptions({ autoRotate: !shipment })
  if (shipment) {
    const point = illustrativePosition(shipment.origin, shipment.destination, shipment.progressPercent ?? 50)
    globe.flyTo(point.lon, point.lat)
    animateZoom(1.45)
  } else {
    animateZoom(props.initialZoom ?? 1)
  }
})
onMounted(() => {
  motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)')
  vehicleFrame = requestAnimationFrame(updateRouteVehicle)
  locationMedia = window.matchMedia('(max-width: 800px)')
  syncLocationLayout()
  locationMedia.addEventListener('change', syncLocationLayout)
  window.addEventListener('keydown', onLocationKeydown)
  if (typeof MutationObserver !== 'undefined') {
    themeObserver = new MutationObserver(() => globe?.setTheme(themePalette()))
    themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['class']})
  }
  if (typeof IntersectionObserver === 'undefined') {
    start()
    return
  }

  observer = new IntersectionObserver(
    entries => {
      if (entries.some(e => e.isIntersecting)) {
        start()
        observer?.disconnect()
      }
    },
    { rootMargin: '150px' }
  )

  if (holder.value) observer.observe(holder.value)
})

onBeforeUnmount(() => {
  disposed = true
  locationMedia?.removeEventListener('change', syncLocationLayout)
  window.removeEventListener('keydown', onLocationKeydown)
  observer?.disconnect()
  themeObserver?.disconnect()
  cancelAnimationFrame(popupFollowFrame)
  cancelAnimationFrame(zoomFrame)
  cancelAnimationFrame(vehicleFrame)
  globe?.destroy?.()
  globe = undefined
})
</script>



<template>
  <div ref="holder" class="world-globe" :class="{ 'world-globe--satellite': props.satelliteSurface }"
    :aria-label="$t('custom.tracking.globeAria')">
    <div class="world-globe__halo"></div>
    <canvas ref="canvas" class="world-globe__canvas" :aria-label="$t('custom.tracking.mapAria')"></canvas>
    <div v-if="props.shipment" class="world-globe__route-vehicles" aria-hidden="true">
      <svg class="world-globe__route-trail" :viewBox="'0 0 ' + trailSize.width + ' ' + trailSize.height" preserveAspectRatio="none">
        <path v-if="routeTrail" class="world-globe__route-trail-halo" :d="routeTrail" />
        <path v-if="routeTrail" class="world-globe__route-trail-border" :d="routeTrail" />
        <path v-if="routeTrail" class="world-globe__route-trail-core" :d="routeTrail" />
      </svg>
      <span v-if="routeVehicle" class="world-globe__route-vehicle"
        :class="{ 'world-globe__route-vehicle--reversed': routeVehicle.reversed }"
        :style="{ left: routeVehicle.left + 'px', top: routeVehicle.top + 'px' }">
        <TrackingTransportModel :glyph="routeVehicle.glyph" />
      </span>
    </div>
    <!-- On phones the location dialog escapes the clipped canvas and the
         surrounding tracking sections via Teleport and a full-screen layer. -->
    <Teleport to="body" :disabled="!mobileLocationPopup">
    <section
      v-if="selectedOffice"
      ref="locationCard"
      class="world-globe__location-card"
      :class="{ 'world-globe__location-card--below': mobileLocationPopup ? mobilePopupPosition.below : popupPosition.below, 'world-globe__location-card--costa-rica': selectedCostaRica }"
      :style="mobileLocationPopup
        ? { left: mobilePopupPosition.left + 'px', top: mobilePopupPosition.top + 'px', visibility: mobilePopupPosition.visible ? 'visible' : 'hidden' }
        : { left: popupPosition.left + 'px', top: popupPosition.top + 'px' }"
      role="region"
      :aria-label="selectedCity + ', ' + selectedCountry">
      <button ref="locationCloseButton" type="button" class="world-globe__location-close" :aria-label="english ? 'Close location' : 'Cerrar ubicación'" @click.stop="closeLocation">×</button>
      <template v-if="selectedCostaRica">
        <h3>Grupo Castro Fallas · Costa Rica</h3>
        <dl class="world-globe__offices">
          <div v-for="office in costaRicaOffices" :key="office.id">
            <dt>{{ english ? 'Office' : 'Oficina' }} {{ english ? office.en : office.es }}</dt>
            <dd>{{ office.address }}</dd>
          </div>
          <div><dt>Email</dt><dd><a :href="gmailComposeHref(selectedOffice.email)" target="_blank" rel="noopener noreferrer" :aria-label="`${english ? 'Compose in Gmail to' : 'Escribir en Gmail a'} ${selectedOffice.email}`">{{ selectedOffice.email }}</a></dd></div>
        </dl>
      </template>
      <template v-else>
        <p class="world-globe__location-country">{{ selectedCountry }}</p>
        <h3>{{ selectedCity }}</h3>
        <dl>
          <div><dt>{{ english ? 'Address' : 'Dirección' }}</dt><dd>{{ selectedOffice.address }}</dd></div>
          <div><dt>Email</dt><dd><a :href="gmailComposeHref(selectedOffice.email)" target="_blank" rel="noopener noreferrer" :aria-label="`${english ? 'Compose in Gmail to' : 'Escribir en Gmail a'} ${selectedOffice.email}`">{{ selectedOffice.email }}</a></dd></div>
        </dl>
      </template>
    </section>
    </Teleport>
    <div class="globe-floating-tag tag-cr"><span></span> {{ $t('custom.tracking.regionalHub') }}</div>
    <div class="globe-floating-tag tag-global">{{ $t('custom.tracking.globalConnections') }} <IconSymbol glyph="↗" /></div>
    <p v-if="error" class="globe-error">{{ $t('custom.tracking.mapUnavailable') }}</p>
  </div>
</template>
<style scoped>
.world-globe {
  --surface-card:#fff; --text-primary:#171923;
  /* Both themes use white 3-D vehicles with graphite-gray facets and outlines. */
  --tracking-model-main:#fff; --tracking-model-shade:#8b96a5;
  --tracking-model-light:#e7ecf1; --tracking-model-highlight:#fff;
  --tracking-model-window:#8c939d; --tracking-model-outline:#606b78;
  --tracking-model-shadow:rgba(36,46,60,.32);
  --tracking-vehicle-shadow:rgba(47,57,71,.26);
  /* Light theme: crisp white core, deep burgundy edge and soft wine-red glow. */
  --tracking-trail-gray:#fff; --tracking-trail-border:#741126;
  --tracking-trail-halo:#67091e; --tracking-trail-halo-opacity:.45;
  --tracking-trail-glow:rgba(103,9,30,.45);
}
:global(html.theme-dark .world-globe) {
  --surface-card:#10182b; --text-primary:#f4f6fb;
  /* Exact same 3-D vehicle palette as light mode. */
  --tracking-model-main:#fff; --tracking-model-shade:#8b96a5;
  --tracking-model-light:#e7ecf1; --tracking-model-highlight:#fff;
  --tracking-model-window:#8c939d; --tracking-model-outline:#606b78;
  --tracking-model-shadow:rgba(36,46,60,.32);
  --tracking-vehicle-shadow:rgba(47,57,71,.26);
  /* Dark theme: warm white core, ruby edge and lighter red glow for contrast. */
  --tracking-trail-gray:#fff7f8; --tracking-trail-border:#ca2948;
  --tracking-trail-halo:#ea4664; --tracking-trail-halo-opacity:.55;
  --tracking-trail-glow:rgba(234,70,100,.55);
}
.world-globe__location-card {
  position:absolute; z-index:12; width:min(270px,calc(100% - 28px)); max-height:min(290px,calc(100% - 25px));
  overflow-x:hidden; overflow-y:auto; padding:17px 19px; box-sizing:border-box;
  border:1px solid #d1d5db; border-radius:16px;
  background:radial-gradient(ellipse at 35% 20%,rgba(194,24,57,.10),transparent 68%),rgba(255,255,255,.97); color:#171923;
  transform:translate(-50%,-100%); box-shadow:0 14px 40px #0005; text-align:left;
}

.world-globe__location-card > * {position:relative; z-index:1}
.world-globe__location-card--below { transform:translate(-50%,0) }
.world-globe__location-card--costa-rica {width:min(290px,calc(100% - 28px)); max-height:calc(100% - 28px)}
.world-globe__location-country {font-size:10px; font-weight:850; letter-spacing:.08em; text-transform:uppercase}
.world-globe__location-card h3 {margin:0 28px 7px 0; font-size:16px; line-height:1.25}
.world-globe__location-card dl {display:grid; gap:7px; margin:0}
.world-globe__location-card dl > div {display:grid; gap:2px}
.world-globe__location-card dt {font-size:10px; color:#687286; font-weight:850; text-transform:uppercase; letter-spacing:.06em}
.world-globe__location-card dd {margin:0; font-size:11px; line-height:1.45; overflow-wrap:anywhere}
.world-globe__location-card a { color:inherit; overflow-wrap:anywhere }
.world-globe__location-close {
  position:absolute; z-index:3; top:8px; right:8px; width:30px; height:30px;
  display:grid; place-items:center; padding:0; box-sizing:border-box;
  border:0; border-radius:50%; background:#e5e7eb; color:#171923;
  cursor:pointer; font-size:0; line-height:1;
}
.world-globe__location-close::before,.world-globe__location-close::after {
  content:''; position:absolute; left:50%; top:50%; width:13px; height:2px;
  background:currentColor; border-radius:2px; pointer-events:none;
  transform:translate(-50%,-50%) rotate(45deg);
}
.world-globe__location-close::after {transform:translate(-50%,-50%) rotate(-45deg)}
.world-globe__offices > div + div {padding-top:6px; border-top:1px solid #8991a233}
.world-globe__offices dt {font-size:11px; letter-spacing:0; text-transform:none; color:inherit}
:global(html.theme-dark .world-globe__location-card) {
  border-color:#ffffff33;
  background:radial-gradient(ellipse at 35% 20%,rgba(194,24,57,.12),transparent 68%),rgba(1,8,29,.96);
  color:#f4f6fb;
}
:global(html.theme-dark .world-globe__location-card dt) {color:#b8c3d6}
:global(html.theme-dark .world-globe__location-close) {background:#ffffff23;color:#fff}
.world-globe__location-card a:focus-visible,.world-globe__location-close:focus-visible {outline:2px solid #b20c2a;outline-offset:3px}
@media (max-width:800px) {
  /* Same compact, pin-anchored card as before; only its stacking changes.
     Teleport ensures later sections cannot clip it or cover it. */
  .world-globe__location-card {
    position:fixed;
    z-index:2147483001;
    width:min(270px,calc(100vw - 24px));
    max-height:min(290px,calc(100dvh - 24px));
    overflow-y:auto;
    overscroll-behavior:contain;
    transform:translate(-50%,-100%);
  }
  .world-globe__location-card--below {
    transform:translate(-50%,0);
  }
  .world-globe__location-card--costa-rica {
    width:min(290px,calc(100vw - 24px));
    max-height:min(290px,calc(100dvh - 24px));
  }
}

/* Only Tracking's satellite globe uses a neutral route: the Earth itself
   never has bright red route overlays. All other globe styles stay untouched. */
.world-globe.world-globe--satellite {
  --tracking-trail-gray:#ffffff;
  --tracking-trail-border:#7d8c9d;
  --tracking-trail-halo:#73879b;
  --tracking-trail-halo-opacity:.24;
  --tracking-trail-glow:rgba(190,206,220,.45);
}
:global(html.theme-dark .world-globe.world-globe--satellite) {
  --tracking-trail-gray:#ffffff;
  --tracking-trail-border:#7d8c9d;
  --tracking-trail-halo:#73879b;
  --tracking-trail-halo-opacity:.24;
  --tracking-trail-glow:rgba(190,206,220,.45);
}
.world-globe__route-vehicles{position:absolute;inset:0;z-index:4;pointer-events:none}
.world-globe__route-trail{position:absolute;inset:0;width:100%;height:100%;overflow:hidden}
.world-globe__route-trail path{fill:none;stroke:var(--tracking-trail-gray);stroke-linecap:round;stroke-linejoin:round}
.world-globe__route-trail-halo{stroke:var(--tracking-trail-halo)!important;stroke-width:9;opacity:var(--tracking-trail-halo-opacity);filter:blur(2px)}
.world-globe__route-trail-border{stroke:var(--tracking-trail-border)!important;stroke-width:6.2}
.world-globe__route-trail-core{stroke-width:2.8;filter:drop-shadow(0 0 4px var(--tracking-trail-glow))}
.world-globe__route-vehicle{position:absolute;display:grid;place-items:center;width:60px;height:42px;color:var(--tracking-model-main);transform:translate(-50%,-50%);filter:none}
.world-globe__route-vehicle--reversed{transform:translate(-50%,-50%) scaleX(-1)}
@media(max-width:580px){
  .world-globe__route-vehicle{width:48px;height:34px}
  .world-globe__route-trail-halo{stroke-width:7}
  .world-globe__route-trail-border{stroke-width:5}
  .world-globe__route-trail-core{stroke-width:2.3}
}
</style>

<!-- route rendering notes: see docs/DHOLE-TRACKING-PREVIEW.md -->
