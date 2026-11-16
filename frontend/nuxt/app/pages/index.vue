<script setup lang="ts">
import LegacyHome from '@legacy/Home.vue'
import guides from '../../../seo/service-landings.json'
const { canonical, organizationId } = usePublicSeo({
  path: '/', title: 'Castro Fallas | Agencia aduanal y logística en Costa Rica',
  description: 'Grupo Castro Fallas: coordinación logística, agenciamiento aduanal, carga marítima, aérea y terrestre en Costa Rica. Servicios FCL, LCL, FTL y LTL.',
  schema: [{
    '@type': 'Service', '@id': 'https://www.logisticacastrofallas.com/#transporte-logistico',
    name: 'Servicios de logística y transporte internacional',
    provider: { '@id': 'https://www.logisticacastrofallas.com/#organizacion' },
    areaServed: [{ '@type': 'Country', name: 'Costa Rica' }, { '@type': 'Country', name: 'Panamá' }],
    url: 'https://www.logisticacastrofallas.com/servicios'
  }]
})
// The opening hero is rendered as a CSS background. Discover its fallback
// from the initial SSR head rather than waiting for hydration/CSS evaluation.
// Preload only on Home to avoid fetching this asset on other routes.
useHead({
  link: [{ rel: 'preload', as: 'image', type: 'image/webp', href: '/images/hero.webp', fetchpriority: 'high' }]
})

const serviceCards = Object.entries(guides).map(([url, entry]) => ({ url, title: entry.es.label, text: entry.es.answer }))
</script>
<template>
  <LegacyHome />
</template>
