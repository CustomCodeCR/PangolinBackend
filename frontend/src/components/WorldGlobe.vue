<script setup lang="ts">
import IconSymbol from './IconSymbol.vue'
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { createGlobe } from '3d-world-map'

const holder = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const error = ref('')

let globe: ReturnType<typeof createGlobe> | undefined
let observer: IntersectionObserver | undefined
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

      // Puntos logísticos ilustrativos
      markers: [
        {
          lat: 9.93,
          lon: -84.09,
          label: 'Costa Rica',
          count: 12,
          color: '#a80e18',
          live: true,
        },
        {
          lat: 31.23,
          lon: 121.47,
          label: 'Shanghái',
          count: 8,
          color: '#a80e18',
          live: true,
        },
        {
          lat: 25.77,
          lon: -80.19,
          label: 'Miami',
          count: 6,
          color: '#a80e18',
          live: true,
        },
        {
          lat: 51.51,
          lon: -0.13,
          label: 'Londres',
          count: 4,
          color: '#a80e18',
          live: true,
        },
      ],

      // Conexiones internacionales
      arcs: [
        {
          from: { lat: 9.93, lon: -84.09 },
          to: { lat: 31.23, lon: 121.47 },
          color: '#a80e18',
        },
        {
          from: { lat: 9.93, lon: -84.09 },
          to: { lat: 25.77, lon: -80.19 },
          color: '#a80e18',
        },
        {
          from: { lat: 9.93, lon: -84.09 },
          to: { lat: 51.51, lon: -0.13 },
          color: '#a80e18',
        },
      ],
    })
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : 'Error al iniciar el mapa.'
  }
}

onMounted(() => {
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
  globe?.destroy?.()
  globe = undefined
})
</script>



<template>
  <div ref="holder" class="world-globe" :aria-label="$t('custom.tracking.globeAria')">
    <div class="world-globe__halo"></div>
    <canvas ref="canvas" class="world-globe__canvas" :aria-label="$t('custom.tracking.mapAria')"></canvas>
    <div class="globe-floating-tag tag-cr"><span></span> {{ $t('custom.tracking.regionalHub') }}</div>
    <div class="globe-floating-tag tag-global">{{ $t('custom.tracking.globalConnections') }} <IconSymbol glyph="↗" /></div>
    <p v-if="error" class="globe-error">{{ $t('custom.tracking.mapUnavailable') }}</p>
  </div>
</template>