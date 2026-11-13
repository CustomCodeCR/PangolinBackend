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
  <!-- Preserve the original img root for CMS URLs and other unoptimized images.
       Their parent pages depend on scoped styles applied to that root. -->
  <img v-if="!staticVariant" :src="src" :alt="alt" :loading="loading" :fetchpriority="fetchpriority" :decoding="decoding" />
  <picture v-else class="static-image-sources">
    <source :srcset="staticVariant + '.avif'" type="image/avif" />
    <source :srcset="staticVariant + '.webp'" type="image/webp" />
    <img :src="src" :alt="alt" :loading="loading" :fetchpriority="fetchpriority" :decoding="decoding" />
  </picture>
</template>

<style scoped>
/* The picture only negotiates codecs. Existing pages target the nested img
   via :deep(img) because parent scoped CSS does not enter child components. */
.static-image-sources { display: contents; }
</style>
