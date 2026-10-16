<script setup lang="ts">
import { computed } from 'vue'
import { siteVisual } from '../siteCms'
const props = withDefaults(defineProps<{ slotKey: string; fallback: string; alt?: string; background?: boolean }>(), { alt: '', background: false })
const visual = computed(() => siteVisual(props.slotKey, props.fallback))
const isVideo = computed(() => visual.value.kind.startsWith('Video'))
</script>
<template>
  <video v-if="isVideo" :class="background ? 'cms-background-video' : 'cms-inline-video'" :src="visual.src" autoplay muted loop playsinline preload="metadata" :aria-label="alt || 'Video decorativo'" />
  <img v-else :src="visual.src" :alt="alt" loading="lazy" />
</template>
<style scoped>
.cms-inline-video { display:block; width:100%; height:100%; object-fit:cover; }
.cms-background-video { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; pointer-events:none; z-index:0; }
@media (prefers-reduced-motion:reduce) { .cms-inline-video,.cms-background-video { visibility:hidden; } }
</style>
