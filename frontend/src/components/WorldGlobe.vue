<script setup lang="ts">
import IconSymbol from './IconSymbol.vue'
import type { TrackingDemoShipment, TrackingPoint } from '../types/tracking'
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { createGlobe, type Marker, type ClusterMarker, type HexBinMarker } from '3d-world-map'

const props = defineProps<{ shipment?: TrackingDemoShipment | null }>()
const holder = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const error = ref('')
const { locale } = useI18n({ useScope: 'global' })
const english = computed(() => locale.value.toLowerCase().startsWith('en'))
function gmailComposeHref(email: string) {
  const params = new URLSearchParams({ view: 'cm', fs: '1', to: email })
  return `https://mail.google.com/mail/?${params.toString()}`
}

const selectedId = ref<string | null>(null)
const popupPosition = ref({ left: 0, top: 0, below: false })
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
  const progress = illustrativePosition(shipment.origin, shipment.destination, shipment.progressPercent)
  const points = [
    { id: 'route-origin', ...shipment.origin, label: shipment.origin.name, color: '#1677d2', count: 1, size: 7 },
    { id: 'route-destination', ...shipment.destination, label: shipment.destination.name, color: '#18a86d', count: 1, size: 7 }
  ]
  if (shipment.progressPercent > 0 && shipment.progressPercent < 100) {
    points.push({ id: 'route-progress', ...progress, label: 'DEMO · ' + shipment.progressPercent + '%', color: '#f5b700', count: 1, size: 8 })
  }
  return points
}
const demoArcs = () => props.shipment ? [{
  from: { lat: props.shipment.origin.lat, lon: props.shipment.origin.lon },
  to: { lat: props.shipment.destination.lat, lon: props.shipment.destination.lon },
  color: '#b50928', width: 2, duration: 4000
}] : offices.filter(item => item.countryEs !== 'Costa Rica').map(item => ({
  from: { lat: 9.9167, lon: -84.0333 },
  to: { lat: item.lat, lon: item.lon },
  color: '#a80e18', width: 1.15
}))
const costaRicaCenter = { lat: 9.9417, lon: -84.0583 }



let globe: ReturnType<typeof createGlobe> | undefined
let observer: IntersectionObserver | undefined
let themeObserver: MutationObserver | undefined
let started = false
let popupFollowFrame = 0
let zoomFrame = 0


function themePalette() {
  const dark = document.documentElement.classList.contains('theme-dark')
  return {
    ocean: (dark ? ['#120000','#000000'] : ['#fffafa','#fffafa']) as [string,string],
    land:'#a80e18', marker:'#a80e18', arc:'#a80e18',
    label: dark ? '#ffffff' : '#41434b'
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
  selectedId.value = null
  globe?.setOptions({autoRotate:true})
  animateZoom(1)
}
function positionPopup(point: {x:number;y:number}) {
  if (!holder.value || !canvas.value) return
  const root = holder.value.getBoundingClientRect()
  const rect = canvas.value.getBoundingClientRect()
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
  const update = () => {
    if (!globe || selectedId.value !== id) return
    const point = globe.project(lon,lat)
    if (point?.visible) positionPopup(point)
    popupFollowFrame=requestAnimationFrame(update)
  }
  popupFollowFrame=requestAnimationFrame(update)
}
function selectWarehouse(marker: Marker | ClusterMarker | HexBinMarker,point: {x:number;y:number}) {
  const id = 'id' in marker ? String(marker.id ?? '') : ''
  const office = offices.find(x=>x.id===id)
  if (!office || !holder.value || !canvas.value) return
  selectedId.value=id
  globe?.setOptions({autoRotate:false})
  positionPopup(point)
  if (globe) {
    globe.flyTo(selectedCostaRica.value ? costaRicaCenter.lon : office.lon, selectedCostaRica.value ? costaRicaCenter.lat : office.lat)
    animateZoom(selectedCostaRica.value ? 1.15 : 1.2)
    followSelectedPin(id,office.lon,office.lat)
  }
}

function start() {
  if (started || !canvas.value) return
  started = true

  try {
    globe = createGlobe(canvas.value, {
      mode: 'globe',
      transparentBackground: true,
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
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : 'Error al iniciar el mapa.'
  }
}

watch(locale, () => globe?.setMarkers(demoMarkers()))
watch(() => props.shipment, (shipment) => {
  if (!globe) return
  cancelAnimationFrame(popupFollowFrame)
  selectedId.value = null
  globe.setMarkers(demoMarkers())
  globe.setArcs(demoArcs())
  globe.setOptions({ autoRotate: !shipment })
  if (shipment) {
    const point = illustrativePosition(shipment.origin, shipment.destination, shipment.progressPercent)
    globe.flyTo(point.lon, point.lat)
    animateZoom(1.45)
  } else {
    animateZoom(1)
  }
})
onMounted(() => {
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
  observer?.disconnect()
  themeObserver?.disconnect()
  cancelAnimationFrame(popupFollowFrame)
  cancelAnimationFrame(zoomFrame)
  globe?.destroy?.()
  globe = undefined
})
</script>



<template>
  <div ref="holder" class="world-globe" :aria-label="$t('custom.tracking.globeAria')">
    <div class="world-globe__halo"></div>
    <canvas ref="canvas" class="world-globe__canvas" :aria-label="$t('custom.tracking.mapAria')"></canvas>
    <section
      v-if="selectedOffice"
      class="world-globe__location-card"
      :class="{ 'world-globe__location-card--below': popupPosition.below, 'world-globe__location-card--costa-rica': selectedCostaRica }"
      :style="{left: popupPosition.left + 'px', top: popupPosition.top + 'px'}"
      role="region"
      :aria-label="selectedCity + ', ' + selectedCountry">
      <button type="button" class="world-globe__location-close" :aria-label="english ? 'Close location' : 'Cerrar ubicación'" @click="closeLocation">×</button>
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
    <div class="globe-floating-tag tag-cr"><span></span> {{ $t('custom.tracking.regionalHub') }}</div>
    <div class="globe-floating-tag tag-global">{{ $t('custom.tracking.globalConnections') }} <IconSymbol glyph="↗" /></div>
    <p v-if="error" class="globe-error">{{ $t('custom.tracking.mapUnavailable') }}</p>
  </div>
</template>
<style scoped>
.world-globe { --surface-card:#fff; --text-primary:#171923; }
:global(html.theme-dark .world-globe) { --surface-card:#10182b; --text-primary:#f4f6fb; }
.world-globe__location-card {
  position:absolute; z-index:12; width:min(270px,calc(100% - 28px)); max-height:min(290px,calc(100% - 25px));
  overflow:auto; padding:17px 19px; box-sizing:border-box;
  border:1px solid #d1d5db; border-radius:16px; background:rgba(255,255,255,.97); color:#171923;
  transform:translate(-50%,-100%); box-shadow:0 14px 40px #0005; text-align:left;
}
.world-globe__location-card::before {
  content:''; position:absolute; z-index:0; inset:-40%; border-radius:50%;
  background:radial-gradient(ellipse at center,rgba(194,24,57,.11),transparent 65%);
  pointer-events:none;
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
.world-globe__location-close {position:absolute; z-index:3; top:8px; right:8px; width:30px; height:30px; border:0; border-radius:50%; background:#e5e7eb; color:#171923; cursor:pointer; font-size:22px}
.world-globe__offices > div + div {padding-top:6px; border-top:1px solid #8991a233}
.world-globe__offices dt {font-size:11px; letter-spacing:0; text-transform:none; color:inherit}
:global(html.theme-dark .world-globe__location-card) {border-color:#ffffff33; background:rgba(1,8,29,.96); color:#f4f6fb}
:global(html.theme-dark .world-globe__location-card dt) {color:#b8c3d6}
:global(html.theme-dark .world-globe__location-close) {background:#ffffff23;color:#fff}
.world-globe__location-card a:focus-visible,.world-globe__location-close:focus-visible {outline:2px solid #b20c2a;outline-offset:3px}
@media(max-width:580px){.world-globe__location-card {max-height:65%;}}
</style>
