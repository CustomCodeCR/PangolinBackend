<script setup lang="ts">
import IconSymbol from './IconSymbol.vue'
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { createGlobe } from '3d-world-map'

const holder = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const error = ref('')
const { locale } = useI18n({ useScope: 'global' })
const english = computed(() => locale.value.toLowerCase().startsWith('en'))
const selectedId = ref<string | null>(null)
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
const markerData = () => offices.map(office => ({...office, label:english.value ? office.en : office.es, color:'#a80e18',count:1,size:4}))


let globe: ReturnType<typeof createGlobe> | undefined
let observer: IntersectionObserver | undefined
let themeObserver: MutationObserver | undefined
let started = false

function start() {
  if (started || !canvas.value) return
  started = true

  try {
    globe = createGlobe(canvas.value, {
      mode: 'globe',
      transparentBackground: true,
      // Colores corporativos Castro Fallas
      theme: {
        ocean: ['#120000', '#000000'],
        land: '#a80e18',
        marker: '#a80e18',
        arc: '#a80e18',
      },

      // Diseño de contornos
      landStyle: 'outline',

      // Efectos visuales
      graticule: true,
      stars: true,
      shade: true,
      orbits: 0,

      // Movimiento e interacción
      autoRotate: true,
      rotateSpeed: 0.09,
      zoomable: true,
      interactive: true,

      // Oficinas internacionales del material del equipo frontend (a validar antes de producción).
      markers: markerData(),
      onClick: marker => {
        const id = 'id' in marker ? String(marker.id ?? '') : ''
        const office = offices.find(item => item.id === id)
        if (!office) return
        selectedId.value = office.id
        globe?.setOptions({ autoRotate: false })
        globe?.flyTo(office.lon, office.lat)
        globe?.setZoom(1.2)
      },
      arcs: offices.filter(item => item.countryEs !== 'Costa Rica').map(item => ({
        from: { lat: 9.9167, lon: -84.0333 },
        to: { lat:item.lat, lon:item.lon },
        color:'#a80e18', width:1.15
      })),
    })
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : 'Error al iniciar el mapa.'
  }
}

watch(locale, () => globe?.setMarkers(markerData()))
onMounted(() => {
  if (typeof MutationObserver !== 'undefined') {
    themeObserver = new MutationObserver(() => globe?.setTheme({
      ocean: document.documentElement.classList.contains('theme-dark') ? ['#120000','#000000'] : ['#fffafa','#fffafa'],
      land:'#a80e18', marker:'#a80e18', arc:'#a80e18'
    }))
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
  globe?.destroy?.()
  globe = undefined
})
</script>



<template>
  <div ref="holder" class="world-globe" :aria-label="$t('custom.tracking.globeAria')">
    <div class="world-globe__halo"></div>
    <canvas ref="canvas" class="world-globe__canvas" :aria-label="$t('custom.tracking.mapAria')"></canvas>
    <section v-if="selectedOffice" class="globe-office" role="region" :aria-label="english ? 'Selected location' : 'Ubicación seleccionada'">
      <button type="button" class="globe-office__close" :aria-label="english ? 'Close location' : 'Cerrar ubicación'" @click="selectedId = null; globe?.setOptions({ autoRotate: true }); globe?.setZoom(1)">×</button>
      <strong>{{ english ? selectedOffice.en : selectedOffice.es }}</strong>
      <p>{{ english ? selectedOffice.countryEn : selectedOffice.countryEs }}</p>
      <p>{{ selectedOffice.address }}</p>
      <a :href="'mailto:' + selectedOffice.email">{{ selectedOffice.email }}</a>
    </section>
    <div class="globe-floating-tag tag-cr"><span></span> {{ $t('custom.tracking.regionalHub') }}</div>
    <div class="globe-floating-tag tag-global">{{ $t('custom.tracking.globalConnections') }} <IconSymbol glyph="↗" /></div>
    <p v-if="error" class="globe-error">{{ $t('custom.tracking.mapUnavailable') }}</p>
  </div>
</template>
<style scoped>
.globe-office { position:absolute; z-index:12; left:50%; bottom:40px; transform:translateX(-50%); width:min(300px,calc(100% - 24px)); max-height:65%; overflow:auto; box-sizing:border-box; background:#fff8f8; color:#20242b; padding:17px 20px; border:1px solid #a80e1880; border-radius:15px; box-shadow:0 10px 32px #0004; }
:global(html.theme-dark .globe-office) { background:#171316; color:#fff; }
.globe-office strong { display:block; margin-right:26px; font-size:16px; }
.globe-office p { margin:7px 0; line-height:1.45; font-size:12px; overflow-wrap:anywhere; }
.globe-office a { display:block; color:#a80e18; overflow-wrap:anywhere; font-size:12px; }
.globe-office__close { position:absolute; top:8px; right:10px; border:0; background:transparent; color:inherit; font-size:25px; cursor:pointer; }
</style>
