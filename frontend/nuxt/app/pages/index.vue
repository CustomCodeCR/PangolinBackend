<script setup lang="ts">
import LegacyHome from '@legacy/Home.vue'
import type { PublishedSiteSlot } from '@legacy/siteCms'
import guides from '../../../seo/service-landings.json'
// La fuente de los identificadores JSON-LD debe coincidir con los canonicals.
const seoBase = String(useRuntimeConfig().public.siteUrl).replace(/\/$/, '')
const { canonical, organizationId } = usePublicSeo({
  path: '/', title: 'Castro Fallas | Agencia aduanal y logística en Costa Rica',
  description: 'Grupo Castro Fallas: coordinación logística, agenciamiento aduanal, carga marítima, aérea y terrestre en Costa Rica. Servicios FCL, LCL, FTL y LTL.',
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

// Request-local snapshot, only public Home text fields, never the browser store.
// No user-supplied upstream, cookies, authorization, retries or build-time fetch.
const config = useRuntimeConfig()
const { data: initialCmsText } = await useAsyncData<Record<string, PublishedSiteSlot>>('home-public-cms-text', async () => {
  if (import.meta.client || import.meta.prerender) return {}
  try {
    const base = String(config.cmsApiBase).replace(/\/$/, '')
    const response = await $fetch<unknown>(base + '/api/content/site', { timeout: 750, retry: 0 })
    if (!Array.isArray(response)) return {}
    const entries = response.filter((item): item is PublishedSiteSlot =>
      item !== null && typeof item === 'object' && typeof item.key === 'string' &&
      /^home\.[a-zA-Z0-9_.-]+$/.test(item.key) &&
      (typeof item.textEs === 'string' || typeof item.textEn === 'string'))
      .map(item => [item.key, {
        key: item.key,
        textEs: typeof item.textEs === 'string' ? item.textEs : null,
        textEn: typeof item.textEn === 'string' ? item.textEn : null
      }] as const)
    const snapshot = Object.fromEntries(entries)
    return JSON.stringify(snapshot).length <= 256_000 ? snapshot : {}
  } catch { return {} }
}, { default: () => ({}) })

const serviceCards = Object.entries(guides).map(([url, entry]) => ({ url, title: entry.es.label, text: entry.es.answer }))
</script>
<template>
  <LegacyHome :initial-cms-text="initialCmsText ?? {}" />
</template>
