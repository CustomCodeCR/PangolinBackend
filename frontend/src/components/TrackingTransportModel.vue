<script setup lang="ts">
import IconSymbol from './IconSymbol.vue'

// Miniaturas vectoriales isométricas con volumen y reflejos.
// No requieren WebGL, descargas de modelos externos ni licencias adicionales.
defineProps<{ glyph: string }>()
</script>

<template>
  <!-- Layered isometric cargo vessel: illuminated deck, bevelled freeboard,
       shaded bow, raised bridge and contact shadow. Geometric depth is preserved
       in both themes; only the colour palette is theme-dependent. -->
  <svg v-if="glyph === 'ship'" class="tracking-transport-model tracking-transport-model--ship"
    viewBox="0 0 112 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="tracking-ship-hull-3d" x1="0" y1="0" x2=".24" y2="1">
        <stop offset="0%" style="stop-color:var(--tracking-model-highlight)" />
        <stop offset="20%" style="stop-color:var(--tracking-model-main)" />
        <stop offset="50%" style="stop-color:var(--tracking-model-light)" />
        <stop offset="100%" style="stop-color:var(--tracking-model-shade)" />
      </linearGradient>
      <linearGradient id="tracking-ship-side-3d" x1="0" y1="0" x2=".75" y2="1">
        <stop offset="0%" style="stop-color:var(--tracking-model-light)" />
        <stop offset="100%" style="stop-color:var(--tracking-model-shade)" />
      </linearGradient>
      <linearGradient id="tracking-ship-deck-3d" x1="0" y1="0" x2=".92" y2="1">
        <stop offset="0%" style="stop-color:var(--tracking-model-highlight)" />
        <stop offset="68%" style="stop-color:var(--tracking-model-main)" />
        <stop offset="100%" style="stop-color:var(--tracking-model-light)" />
      </linearGradient>
      <linearGradient id="tracking-ship-house-3d" x1="0" y1="0" x2=".8" y2="1">
        <stop offset="0%" style="stop-color:var(--tracking-model-highlight)" />
        <stop offset="42%" style="stop-color:var(--tracking-model-main)" />
        <stop offset="100%" style="stop-color:var(--tracking-model-shade)" />
      </linearGradient>
    </defs>

    <!-- Cast shadow at waterline gives separation from the globe. -->
    <ellipse cx="55" cy="63" rx="43" ry="5.2" fill="var(--tracking-model-shade)" opacity=".28" />
    <ellipse cx="56" cy="65" rx="34" ry="2" fill="var(--tracking-model-light)" opacity=".28" />

    <!-- Long, bevelled hull: lit upper rim, shaded broadside, deeper bow face. -->
    <path d="M8 37 101 34 88 57 29 62 17 54Z"
      fill="url(#tracking-ship-hull-3d)" stroke="var(--tracking-model-outline, transparent)"
      stroke-width="1.25" stroke-linejoin="round" />
    <path d="M17 44 30 58 86 54 94 43 88 57 29 62 17 54Z"
      fill="url(#tracking-ship-side-3d)" opacity=".85" />
    <path d="M101 34 88 57 78 53 90 37Z"
      fill="var(--tracking-model-shade)" opacity=".74" />
    <path d="M8 37 21 42 88 40 101 34 92 30 19 32Z"
      fill="url(#tracking-ship-deck-3d)" stroke="var(--tracking-model-outline, transparent)"
      stroke-width=".95" stroke-linejoin="round" />
    <path d="M12 37 22 39 85 37 96 34" stroke="var(--tracking-model-highlight)"
      stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".94" />
    <path d="M28 57 80 53" stroke="var(--tracking-model-highlight)"
      stroke-width="2" fill="none" stroke-linecap="round" opacity=".85" />
    <path d="M30 59 78 55" stroke="var(--tracking-model-shade)"
      stroke-width="1" fill="none" opacity=".42" />

    <!-- Raised deck units: visible top and side facets rather than flat rectangles. -->
    <path d="M21 30V23l7-4h17v11Z" fill="url(#tracking-ship-side-3d)"
      stroke="var(--tracking-model-outline, transparent)" stroke-width=".7" />
    <path d="M21 23 28 19h17l-7 4Z" fill="var(--tracking-model-highlight)" />
    <path d="M38 23 45 19v11l-7 3Z" fill="var(--tracking-model-shade)" opacity=".55" />
    <path d="M46 30V23l6-4h17v11Z" fill="url(#tracking-ship-side-3d)"
      stroke="var(--tracking-model-outline, transparent)" stroke-width=".7" />
    <path d="M46 23 52 19h17l-6 4Z" fill="var(--tracking-model-highlight)" />
    <path d="M63 23 69 19v11l-6 3Z" fill="var(--tracking-model-shade)" opacity=".52" />

    <!-- Wheelhouse: front, angled side, roof and glazed windows. -->
    <path d="M38 18 45 12h29l9 22-41 1Z"
      fill="url(#tracking-ship-house-3d)" stroke="var(--tracking-model-outline, transparent)"
      stroke-width="1" stroke-linejoin="round" />
    <path d="M69 18 75 14l8 20-13 1Z"
      fill="var(--tracking-model-shade)" opacity=".65" />
    <path d="M38 18 46 12h29l-6 6Z"
      fill="var(--tracking-model-highlight)" stroke="var(--tracking-model-outline, transparent)"
      stroke-width=".8" stroke-linejoin="round" />
    <path d="M44 21h11v7H44zm14 0h10l3 7H58Z"
      fill="var(--tracking-model-window)" stroke="var(--tracking-model-outline, transparent)"
      stroke-width=".6" />
    <path d="M45 22h9m5 0h8" stroke="var(--tracking-model-highlight)"
      stroke-width=".95" opacity=".65" />
    <path d="M46 12V6h4v6m25 3V8" stroke="var(--tracking-model-shade)"
      stroke-width="1.7" stroke-linecap="round" fill="none" />
    <path d="M44 5h9" stroke="var(--tracking-model-highlight)" stroke-width="1.4" />

    <!-- Fine rails and multiple water reflections provide scale and dimensionality. -->
    <path d="M19 32v-6m8 5v-4m46 4v-4m11 4v-4m8 6v-4"
      stroke="var(--tracking-model-outline, transparent)" stroke-width="1.1" fill="none" />
    <path d="M16 32 34 31m39 0 22-1" stroke="var(--tracking-model-highlight)"
      stroke-width="1.1" opacity=".88" stroke-linecap="round" />
    <path d="M20 65q6-2 12 0t12 0t12 0t12 0t12 0t12 0"
      stroke="var(--tracking-model-highlight)" stroke-width="1.8" opacity=".8"
      fill="none" stroke-linecap="round" />
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
    <path d="M8 17 16 11h51l-6 6Z" fill="var(--tracking-model-highlight)"
      stroke="var(--tracking-model-outline, transparent)" stroke-width=".85" stroke-linejoin="round" />
    <path d="M8 17h53v28H8Z" fill="url(#tracking-truck-box-3d)"
      stroke="var(--tracking-model-outline, transparent)" stroke-width="1.05" stroke-linejoin="round" />
    <path d="m61 17 6-6v34h-6Z" fill="var(--tracking-model-shade)" opacity=".6" />
    <path d="M13 21h41v16H13Z" fill="none" stroke="var(--tracking-model-highlight)" stroke-width="1.2" opacity=".45" />
    <path d="M61 31 69 22h16l10 12v12H61Z" fill="url(#tracking-truck-cab-3d)"
      stroke="var(--tracking-model-outline, transparent)" stroke-width="1.1" stroke-linejoin="round" />
    <path d="m69 22 6-6h12l8 18-10-12Z" fill="var(--tracking-model-light)"
      stroke="var(--tracking-model-outline, transparent)" stroke-width=".8" stroke-linejoin="round" />
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
  filter:drop-shadow(0 2px 2px var(--tracking-model-shadow, rgba(0,0,0,.3)));
}
.tracking-transport-model--ship{width:78px;height:51px}
/* Same truck in both themes: white 3-D body, grey shaded faces,
   grey outline, neutral-grey windows and identical drop shadow. */
.tracking-transport-model--truck{
  --tracking-model-main:#fff;
  --tracking-model-shade:#8b96a5;
  --tracking-model-light:#e7ecf1;
  --tracking-model-highlight:#fff;
  --tracking-model-window:#8c939d;
  --tracking-model-outline:#606b78;
  --tracking-model-shadow:rgba(36,46,60,.32);
}
.tracking-transport-model--plane{width:70px;height:40px}
@media (max-width:580px){
  .tracking-transport-model{width:45px;height:32px}
  .tracking-transport-model--ship{width:61px;height:39px}
  .tracking-transport-model--plane{width:54px;height:32px}
}
</style>
