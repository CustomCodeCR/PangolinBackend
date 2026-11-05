<script setup lang="ts">
import IconSymbol from './IconSymbol.vue'

// Miniaturas vectoriales isométricas con volumen y reflejos.
// No requieren WebGL, descargas de modelos externos ni licencias adicionales.
defineProps<{ glyph: string }>()
</script>

<template>
  <svg v-if="glyph === 'ship'" class="tracking-transport-model tracking-transport-model--ship"
    viewBox="0 0 112 66" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="tracking-ship-hull-crimson" x1="0" y1="0" x2=".3" y2="1">
        <stop offset="0%" style="stop-color:var(--tracking-vehicle-red-light, #ff657e)" />
        <stop offset="52%" style="stop-color:var(--tracking-vehicle-red-main, #c20b30)" />
        <stop offset="100%" style="stop-color:var(--tracking-vehicle-red-dark, #69071e)" />
      </linearGradient>
      <linearGradient id="tracking-ship-deck-crimson" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" style="stop-color:var(--tracking-vehicle-red-shine, #ffe5e9)" />
        <stop offset="100%" style="stop-color:var(--tracking-vehicle-red-light, #ff657e)" />
      </linearGradient>
    </defs>
    <!-- Portacontenedores rojo con silueta reconocible y relieve suave. -->
    <ellipse cx="55" cy="59" rx="39" ry="4" fill="#e71d48" opacity=".25" />
    <path d="M7 35 102 35 108 40 97 53 27 53 13 45Z" fill="url(#tracking-ship-hull-crimson)" />
    <path d="M11 35 101 35 96 39 19 39Z" fill="url(#tracking-ship-deck-crimson)" />
    <path d="M22 22h21v12H22Z" fill="var(--tracking-vehicle-red-main, #c20b30)" />
    <path d="M45 22h21v12H45Z" fill="var(--tracking-vehicle-red-light, #ff657e)" />
    <path d="M25 12h18v9H25Z" fill="var(--tracking-vehicle-red-light, #ff657e)" />
    <path d="M46 13h17v8H46Z" fill="var(--tracking-vehicle-red-main, #c20b30)" />
    <path d="M26 17h15m7 0h13M24 27h17m7 0h16" fill="none"
      stroke="var(--tracking-vehicle-red-shine, #ffe5e9)" stroke-width="1" opacity=".55" />
    <path d="M73 17h17l5 17H69Z" fill="url(#tracking-ship-deck-crimson)" />
    <path d="m73 17 5-5h12v5Z" fill="var(--tracking-vehicle-red-shine, #ffe5e9)" />
    <path d="M77 21h7v5h-7zm10 0h4v5h-4Z" fill="var(--tracking-vehicle-red-dark, #69071e)" />
    <path d="M79 12V5h3v7m8 5V9" fill="none"
      stroke="var(--tracking-vehicle-red-dark, #69071e)" stroke-width="2" stroke-linecap="round" />
    <path d="M26 47c16 3 51 3 68-1" fill="none"
      stroke="var(--tracking-vehicle-red-shine, #ffe5e9)" stroke-width="1.8" stroke-linecap="round" opacity=".72" />
    <path d="M18 57q6-2 12 0t12 0t12 0t12 0t12 0t12 0" fill="none"
      stroke="var(--tracking-vehicle-red-light, #ff657e)" stroke-width="1.5" stroke-linecap="round" opacity=".55" />
  </svg>

  <!-- Cargo jet facing right. Both main wingtips sit BEHIND their roots
       (smaller x), creating anatomically correct swept-back wings. -->
  <svg v-else-if="glyph === '✈'" class="tracking-transport-model tracking-transport-model--plane"
    viewBox="0 0 120 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="tracking-plane-body-3d" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" style="stop-color:var(--tracking-model-highlight)" />
        <stop offset="42%" style="stop-color:var(--tracking-model-light)" />
        <stop offset="70%" style="stop-color:var(--tracking-model-main)" />
        <stop offset="100%" style="stop-color:var(--tracking-model-shade)" />
      </linearGradient>
      <linearGradient id="tracking-plane-wing-3d" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" style="stop-color:var(--tracking-model-highlight)" />
        <stop offset="58%" style="stop-color:var(--tracking-model-light)" />
        <stop offset="100%" style="stop-color:var(--tracking-model-shade)" />
      </linearGradient>
      <linearGradient id="tracking-plane-engine-3d" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" style="stop-color:var(--tracking-model-highlight)" />
        <stop offset="100%" style="stop-color:var(--tracking-model-shade)" />
      </linearGradient>
    </defs>
    <!-- Rear tailplane and vertical stabilizer sit behind the fuselage. -->
    <path d="M13 32 6 24 27 26 39 33Z" fill="var(--tracking-model-light)" />
    <path d="M18 34 8 12 15 10 31 33Z" fill="url(#tracking-plane-wing-3d)" />
    <path d="M13 38 5 47 27 44 40 37Z" fill="var(--tracking-model-shade)" />
    <path d="M14 15 26 31" stroke="var(--tracking-model-highlight)" stroke-width="1.4"
      opacity=".8" stroke-linecap="round" />
    <!-- Far wing: rearward tip (x=31) and forward root (x=77). -->
    <path d="M55 31 31 6 43 4 77 29Z" fill="var(--tracking-model-shade)" />
    <path d="M57 30 36 7 43 6 72 30Z" fill="url(#tracking-plane-wing-3d)" />
    <path d="M40 8 71 29" stroke="var(--tracking-model-highlight)"
      stroke-width="1.9" opacity=".8" fill="none" stroke-linecap="round" />
    <!-- Long, tapered fuselage and sharply shaped nose. -->
    <path d="M11 33 C26 28 59 26 88 26 C101 26 111 29 117 33
      C111 38 101 41 88 41 L25 41 C14 40 9 38 11 33Z"
      fill="url(#tracking-plane-body-3d)" />
    <path d="M16 33 C42 30 81 29 102 30" stroke="var(--tracking-model-highlight)"
      stroke-width="1.9" opacity=".85" fill="none" stroke-linecap="round" />
    <path d="M25 38 Q64 41 96 38" stroke="var(--tracking-model-shade)"
      stroke-width="1.4" opacity=".45" fill="none" />
    <!-- Cockpit glazing and understated cabin windows. -->
    <path d="m95 28 8 1.2 7 3.1-14 .3Z" fill="var(--tracking-model-window)" />
    <path d="m99 29 4 1 3 1.4" fill="none" stroke="var(--tracking-model-highlight)"
      stroke-width="1" stroke-linecap="round" />
    <path d="M86 32h3m-10 0h3m-10 0h3m-10 0h3" stroke="var(--tracking-model-window)"
      stroke-width="2.1" stroke-linecap="round" />
    <!-- Near wing: tip x=32 is behind the leading root x=79. -->
    <path d="M55 36 32 57 46 60 79 39Z" fill="var(--tracking-model-shade)" />
    <path d="M57 37 38 56 45 57 74 39Z" fill="url(#tracking-plane-wing-3d)" />
    <path d="M73 39 42 55" stroke="var(--tracking-model-highlight)"
      stroke-width="1.7" opacity=".75" fill="none" stroke-linecap="round" />
    <!-- Two compact nacelles under the wing, away from the nose. -->
    <path d="M65 41q5-3 11 0l5 8q-6 3-12 0Z" fill="url(#tracking-plane-engine-3d)" />
    <path d="M70 42q5-2 7 1" stroke="var(--tracking-model-highlight)"
      stroke-width="1.6" fill="none" stroke-linecap="round" />
    <path d="M84 40q3-2 7 0l4 5q-4 2-7 0Z" fill="url(#tracking-plane-engine-3d)" />
    <path d="M34 36 91 35" stroke="var(--tracking-model-accent, #b50928)"
      stroke-width="1.1" opacity=".8" stroke-linecap="round" />
  </svg>

  <svg v-else-if="glyph === 'truck'" class="tracking-transport-model tracking-transport-model--truck"
    viewBox="0 0 108 66" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="tracking-truck-trailer-crimson" x1="0" y1="0" x2=".8" y2="1">
        <stop offset="0%" style="stop-color:var(--tracking-vehicle-red-light, #ff657e)" />
        <stop offset="100%" style="stop-color:var(--tracking-vehicle-red-main, #c20b30)" />
      </linearGradient>
      <linearGradient id="tracking-truck-cab-crimson" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" style="stop-color:var(--tracking-vehicle-red-shine, #ffe5e9)" />
        <stop offset="100%" style="stop-color:var(--tracking-vehicle-red-light, #ff657e)" />
      </linearGradient>
    </defs>
    <!-- Camión de carga rojo; conserva el giro según el sentido del recorrido. -->
    <ellipse cx="54" cy="57" rx="46" ry="4" fill="#e71d48" opacity=".22" />
    <path d="M7 19 15 13h54l-7 6Z" fill="var(--tracking-vehicle-red-shine, #ffe5e9)" />
    <path d="M7 19h55v29H7Z" fill="url(#tracking-truck-trailer-crimson)" />
    <path d="m62 19 7-6v35h-7Z" fill="var(--tracking-vehicle-red-dark, #69071e)" opacity=".7" />
    <path d="M12 25h45m-45 6h45m-45 6h45" stroke="var(--tracking-vehicle-red-shine, #ffe5e9)"
      stroke-width="1.2" opacity=".38" />
    <path d="M62 35 73 23h17l12 13v12H62Z" fill="url(#tracking-truck-cab-crimson)" />
    <path d="m73 23 6-7h13l10 20-12-13Z" fill="var(--tracking-vehicle-red-main, #c20b30)" />
    <path d="M76 26h12l8 10H68Z" fill="var(--tracking-vehicle-red-dark, #69071e)" />
    <path d="M72 29h15l4 5H69Z" fill="#ffeaf0" opacity=".9" />
    <path d="M7 46h95v5H7Z" fill="var(--tracking-vehicle-red-dark, #69071e)" />
    <circle cx="27" cy="50" r="8" fill="#37101d" />
    <circle cx="27" cy="50" r="3.5" fill="var(--tracking-vehicle-red-shine, #ffe5e9)" />
    <circle cx="81" cy="50" r="8" fill="#37101d" />
    <circle cx="81" cy="50" r="3.5" fill="var(--tracking-vehicle-red-shine, #ffe5e9)" />
    <path d="M17 42h39" stroke="var(--tracking-vehicle-red-shine, #ffe5e9)"
      stroke-width="1.6" stroke-linecap="round" opacity=".66" />
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
.tracking-transport-model--ship,.tracking-transport-model--truck{
  width:66px;height:44px;
  filter:drop-shadow(0 3px 5px rgba(159,5,40,.34));
}
.tracking-transport-model--plane{width:70px;height:40px}
@media (max-width:580px){
  .tracking-transport-model{width:45px;height:32px}
  .tracking-transport-model--ship,.tracking-transport-model--truck{width:50px;height:35px}
  .tracking-transport-model--plane{width:54px;height:32px}
}
</style>
