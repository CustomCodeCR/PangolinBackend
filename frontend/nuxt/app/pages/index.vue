<script setup lang="ts">
import seoRoutes from '../../../seo/routes.json'
import LegacyHome from '@legacy/Home.vue'
import guides from '../../../seo/service-landings.json'
// La fuente de los identificadores JSON-LD debe coincidir con los canonicals.
const seoBase = String(useRuntimeConfig().public.siteUrl).replace(/\/$/, '')
const { canonical, organizationId } = usePublicSeo({
  path: '/', title: seoRoutes['/'].title,
  description: seoRoutes['/'].description,
  schema: [{
    '@type': 'Service', '@id': seoBase + '/#transporte-logistico',
    name: 'Servicios de logística y transporte internacional',
    provider: { '@id': seoBase + '/#organizacion' },
    areaServed: [{ '@type': 'Country', name: 'Costa Rica' }, { '@type': 'Country', name: 'Panamá' }],
    url: seoBase + '/servicios'
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
