<script setup lang="ts">
import { computed } from 'vue'

// Only immutable bundled fallbacks are eligible. Uploaded CMS URLs (including
// /api/content/media/...) must keep their original permission-aware endpoint.
const props = withDefaults(defineProps<{
  src: string
  alt?: string
  loading?: 'lazy' | 'eager'
  fetchpriority?: 'auto' | 'high' | 'low'
  decoding?: 'auto' | 'sync' | 'async'
}>(), { alt: '', loading: 'lazy', fetchpriority: 'auto', decoding: 'async' })

const staticVariant = computed(() => {
  switch (props.src) {
    case '/images/about-operations-enhanced.jpg': return '/images/about-operations-enhanced'
    case '/images/cover-logistics.jpeg': return '/images/cover-logistics'
    default: return null
  }
})
</script>

<template>
  <picture class="static-image-sources">
    <source v-if="staticVariant" :srcset="staticVariant + '.avif'" type="image/avif" />
    <source v-if="staticVariant" :srcset="staticVariant + '.webp'" type="image/webp" />
    <img :src="src" :alt="alt" :loading="loading" :fetchpriority="fetchpriority" :decoding="decoding" />
  </picture>
</template>

<style scoped>
/* Preserve existing selectors, aspect ratio, absolute positioning and object-fit
   from the original img. The picture adds no visual box. */
.static-image-sources { display: contents; }
</style>
