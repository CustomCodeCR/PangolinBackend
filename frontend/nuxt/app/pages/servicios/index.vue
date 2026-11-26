<script setup lang="ts">
import seoRoutes from '../../../../seo/routes.json'
import LegacyServices from '@legacy/pages/Services.vue'
import guides from '../../../../seo/service-landings.json'
usePublicSeo({
  path: '/servicios', title: seoRoutes['/servicios'].title,
  description: seoRoutes['/servicios'].description
})
const links = Object.entries(guides).map(([href, data]) => ({ href, name: data.es.label, description: data.es.answer }))
</script>
<template>
  <LegacyServices />
</template>
