<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { createGlobe } from '3d-world-map'
const holder = ref<HTMLElement|null>(null)
const canvas = ref<HTMLCanvasElement|null>(null)
const error = ref('')
let globe: ReturnType<typeof createGlobe>|undefined
let observer: IntersectionObserver|undefined
let started = false
function start() {
  if (started || !canvas.value) return
  started=true
  try {
    globe = createGlobe(canvas.value,{
      preset:'hologram',mode:'globe',autoRotate:true,
      markers:[
        {lat:9.93,lon:-84.09,label:'Costa Rica'},
        {lat:31.23,lon:121.47,label:'Shanghái'},
        {lat:25.77,lon:-80.19,label:'Miami'},
        {lat:51.51,lon:-0.13,label:'Londres'},
        {lat:40.42,lon:-3.70,label:'Madrid'}
      ],
      arcs:[
        {from:{lat:31.23,lon:121.47},to:{lat:9.93,lon:-84.09}},
        {from:{lat:25.77,lon:-80.19},to:{lat:9.93,lon:-84.09}},
        {from:{lat:51.51,lon:-0.13},to:{lat:9.93,lon:-84.09}},
        {from:{lat:40.42,lon:-3.70},to:{lat:9.93,lon:-84.09}}
      ]
    })
  } catch(e) { error.value=e instanceof Error ? e.message : 'No se pudo iniciar el mapa.' }
}
onMounted(()=>{
  if (typeof IntersectionObserver === 'undefined') return start()
  observer=new IntersectionObserver(entries=>{ if(entries.some(e=>e.isIntersecting)){start();observer?.disconnect()} },{rootMargin:'150px'})
  if(holder.value) observer.observe(holder.value)
})
onBeforeUnmount(()=>{observer?.disconnect();globe?.destroy?.()})
</script>
<template>
  <div ref="holder" class="world-globe" aria-label="Globo mundial 3D con rutas logísticas ilustrativas">
    <div class="world-globe__halo"></div>
    <canvas ref="canvas" class="world-globe__canvas" aria-label="Mapa mundial interactivo de demostración"></canvas>
    <div class="globe-floating-tag tag-cr"><span></span> COSTA RICA · HUB REGIONAL</div>
    <div class="globe-floating-tag tag-global">CONEXIONES GLOBALES ↗</div>
    <p v-if="error" class="globe-error">El mapa interactivo no está disponible en este navegador.</p>
  </div>
</template>
