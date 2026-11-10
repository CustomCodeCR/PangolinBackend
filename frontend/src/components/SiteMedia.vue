<script setup lang="ts">
import { computed } from 'vue'
import { siteVisual } from '../siteCms'
const props = withDefaults(defineProps<{ slotKey: string; fallback: string; alt?: string; background?: boolean; defaultKind?: 'Imagen' | 'Video'; poster?: string; priority?: boolean }>(), { alt: '', background: false, defaultKind: 'Imagen', priority: false })
const visual = computed(() => siteVisual(props.slotKey, props.fallback, props.defaultKind))
const isVideo = computed(() => visual.value.kind.startsWith('Video'))
const reducedMotion = typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
</script>
<template>
  <video v-if="isVideo" :class="background ? 'cms-background-video' : 'cms-inline-video'" :src="visual.src"  :autoplay="!reducedMotion" muted loop playsinline preload="metadata" :poster="poster" :aria-label="alt || 'Video decorativo'" />
  <img v-else :src="visual.src" :alt="alt" :loading="priority ? 'eager' : 'lazy'" :fetchpriority="priority ? 'high' : 'auto'" />
</template>
<style scoped>
.cms-inline-video { display:block; width:100%; height:100%; object-fit:cover; }
.cms-background-video { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; pointer-events:none; z-index:0; }

</style>
