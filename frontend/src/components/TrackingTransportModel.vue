<script setup lang="ts">
import IconSymbol from './IconSymbol.vue'

// Miniaturas vectoriales isométricas con volumen y reflejos.
// No requieren WebGL, descargas de modelos externos ni licencias adicionales.
defineProps<{ glyph: string }>()
</script>

<template>
  <svg v-if="glyph === 'ship'" class="tracking-transport-model tracking-transport-model--ship"
    viewBox="0 0 96 62" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="tracking-ship-hull-3d" x1="0" y1="0" x2=".6" y2="1">
        <stop offset="0%" style="stop-color:var(--tracking-model-light)" />
        <stop offset="55%" style="stop-color:var(--tracking-model-main)" />
        <stop offset="100%" style="stop-color:var(--tracking-model-shade)" />
      </linearGradient>
      <linearGradient id="tracking-ship-house-3d" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" style="stop-color:var(--tracking-model-light)" />
        <stop offset="100%" style="stop-color:var(--tracking-model-main)" />
      </linearGradient>
    </defs>
    <ellipse cx="47" cy="54" rx="34" ry="3" fill="var(--tracking-model-shade)" opacity=".17" />
    <path d="M10 33 84 31 73 48 24 53 14 45Z" fill="url(#tracking-ship-hull-3d)" />
    <path d="M10 33 22 37 72 36 84 31 76 28 18 29Z" fill="var(--tracking-model-light)" />
    <path d="m84 31-11 17-7-3 9-13Z" fill="var(--tracking-model-shade)" opacity=".55" />
    <path d="M27 17h33l5 13H24Z" fill="url(#tracking-ship-house-3d)" />
    <path d="m27 17 7-6h32l-6 6Z" fill="var(--tracking-model-highlight)" />
    <path d="M33 20h8v5h-8zm12 0h8v5h-8z" fill="var(--tracking-model-window)" />
    <path d="M35 10V5h4v5M66 12V6" stroke="var(--tracking-model-main)" stroke-width="2" stroke-linecap="round" />
    <path d="M17 29V22h16v7m3 0v-7h16v7" stroke="var(--tracking-model-shade)" stroke-width="1.4" opacity=".55" />
    <path d="m25 48 44-4" stroke="var(--tracking-model-highlight)" stroke-width="1.8" opacity=".85" stroke-linecap="round" />
    <path d="M16 56q5-2 10 0t10 0t10 0t10 0t10 0t10 0" fill="none"
      stroke="var(--tracking-model-light)" stroke-width="1.8" stroke-linecap="round" opacity=".75" />
  </svg>

  <svg v-else-if="glyph === '✈'" class="tracking-transport-model tracking-transport-model--plane"
    viewBox="0 0 100 62" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="tracking-plane-body-3d" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" style="stop-color:var(--tracking-model-highlight)" />
        <stop offset="48%" style="stop-color:var(--tracking-model-main)" />
        <stop offset="100%" style="stop-color:var(--tracking-model-shade)" />
      </linearGradient>
      <linearGradient id="tracking-plane-wing-3d" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" style="stop-color:var(--tracking-model-light)" />
        <stop offset="100%" style="stop-color:var(--tracking-model-main)" />
      </linearGradient>
    </defs>
    <path d="M14 30 8 20 21 22 29 29Z" fill="var(--tracking-model-shade)" />
    <path d="m14 34-7 9 15-2 9-7Z" fill="var(--tracking-model-light)" />
    <path d="M38 27 51 6 65 5 60 28Z" fill="url(#tracking-plane-wing-3d)" />
    <path d="m39 34 14 22 15 1-8-23Z" fill="var(--tracking-model-shade)" />
    <path d="m39 34 15 18 10 2-8-21Z" fill="var(--tracking-model-light)" opacity=".7" />
    <path d="M8 28 75 25q15 0 19 5 3 6-18 7L9 35Z" fill="url(#tracking-plane-body-3d)" />
    <path d="M13 29 76 27q11 0 15 3" fill="none" stroke="var(--tracking-model-highlight)"
      stroke-width="2.2" opacity=".8" stroke-linecap="round" />
    <path d="m42 28 15-20 12-1-10 21Z" fill="var(--tracking-model-highlight)" opacity=".8" />
    <path d="M71 30h6m-13 0h4m-11 0h4" stroke="var(--tracking-model-window)" stroke-width="2.8"
      stroke-linecap="round" />
    <path d="m20 35 44 1" stroke="var(--tracking-model-highlight)" stroke-width="1" opacity=".75" />
  </svg>

  <svg v-else-if="glyph === 'truck'" class="tracking-transport-model tracking-transport-model--truck"
    viewBox="0 0 100 62" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="tracking-truck-box-3d" x1="0" y1="0" x2=".8" y2="1">
        <stop offset="0%" style="stop-color:var(--tracking-model-light)" />
        <stop offset="100%" style="stop-color:var(--tracking-model-main)" />
      </linearGradient>
      <linearGradient id="tracking-truck-cab-3d" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" style="stop-color:var(--tracking-model-highlight)" />
        <stop offset="100%" style="stop-color:var(--tracking-model-main)" />
      </linearGradient>
    </defs>
    <ellipse cx="49" cy="53" rx="43" ry="3" fill="var(--tracking-model-shade)" opacity=".18" />
    <path d="M8 17 16 11h51l-6 6Z" fill="var(--tracking-model-highlight)" />
    <path d="M8 17h53v28H8Z" fill="url(#tracking-truck-box-3d)" />
    <path d="m61 17 6-6v34h-6Z" fill="var(--tracking-model-shade)" opacity=".6" />
    <path d="M13 21h41v16H13Z" fill="none" stroke="var(--tracking-model-highlight)" stroke-width="1.2" opacity=".45" />
    <path d="M61 31 69 22h16l10 12v12H61Z" fill="url(#tracking-truck-cab-3d)" />
    <path d="m69 22 6-6h12l8 18-10-12Z" fill="var(--tracking-model-light)" />
    <path d="M72 25h11l6 9H66Z" fill="var(--tracking-model-window)" />
    <path d="M68 36h9" stroke="var(--tracking-model-highlight)" stroke-width="2" stroke-linecap="round" />
    <path d="M8 44h87v4H8Z" fill="var(--tracking-model-shade)" />
    <circle cx="25" cy="47" r="8" fill="var(--tracking-model-shade)" />
    <circle cx="25" cy="47" r="3.6" fill="var(--tracking-model-light)" />
    <circle cx="75" cy="47" r="8" fill="var(--tracking-model-shade)" />
    <circle cx="75" cy="47" r="3.6" fill="var(--tracking-model-light)" />
    <path d="M16 14h39" stroke="var(--tracking-model-highlight)" stroke-width="1.3" opacity=".65" />
  </svg>

  <IconSymbol v-else :glyph="glyph" :size="27" />
</template>

<style scoped>
.tracking-transport-model{
  display:block;
  width:58px;
  height:40px;
  overflow:visible;
  filter:drop-shadow(0 2px 2px rgba(0,0,0,.3));
}
.tracking-transport-model--plane{width:60px}
@media (max-width:580px){
  .tracking-transport-model{width:45px;height:32px}
  .tracking-transport-model--plane{width:47px}
}
</style>
