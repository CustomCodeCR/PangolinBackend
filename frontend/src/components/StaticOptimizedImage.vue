<script setup lang="ts">
import { computed, ref } from 'vue'
import { cmsResponsiveSrcset } from '../cmsResponsiveImages'

// Static fallbacks use their existing AVIF/WebP picture; CMS derivatives are
// enabled only together with the backend feature flag in a controlled release.
// Default-off keeps all current images and previews unchanged.
const props = withDefaults(defineProps<{
  src: string
  alt?: string
  sizes?: string
  loading?: 'lazy' | 'eager'
  fetchpriority?: 'auto' | 'high' | 'low'
  decoding?: 'auto' | 'sync' | 'async'
}>(), {
  alt: '',
  sizes: '(max-width: 768px) 100vw, 800px',
  loading: 'lazy',
  fetchpriority: 'auto',
  decoding: 'async'
})

const cmsResponsiveEnabled = import.meta.env.VITE_CMS_RESPONSIVE_WEBP_ENABLED === 'true'
const failedResponsiveSrc = ref<string | null>(null)
const cmsSrcset = computed(() =>
  failedResponsiveSrc.value === props.src
    ? undefined
    : cmsResponsiveSrcset(props.src, cmsResponsiveEnabled)
)
const onResponsiveError = () => {
  // If a deployment serves an unsupported derivative, retry the proven
  // original CMS URL. The guard prevents a permanent reload/error loop.
  if (cmsSrcset.value) failedResponsiveSrc.value = props.src
}

const staticVariant = computed(() => {
  switch (props.src) {
    case '/images/about-operations-enhanced.jpg': return '/images/about-operations-enhanced'
    case '/images/cover-logistics.jpeg': return '/images/cover-logistics'
    default: return null
  }
})
</script>

<template>
  <!-- Preserve the img root and scoped parent layout/animations for CMS URLs.
       A legacy object with no derivative falls back in the backend without
       replacing the original URL or changing its real Content-Type. -->
  <img
    v-if="!staticVariant"
    :src="src"
    :srcset="cmsSrcset"
    :sizes="cmsSrcset ? sizes : undefined"
    :alt="alt"
    :loading="loading"
    :fetchpriority="fetchpriority"
    :decoding="decoding"
    @error="onResponsiveError"
  />
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
