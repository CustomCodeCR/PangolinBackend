<script setup lang="ts">
import LegacyLegal from '@legacy/pages/Legal.vue'
import seoRoutes from '../../../seo/routes.json'

const path = '/cookies'
usePublicSeo({
  path,
  title: seoRoutes[path as keyof typeof seoRoutes].title,
  description: seoRoutes[path as keyof typeof seoRoutes].description
})
</script>

<template>
  <LegacyLegal pathname="/cookies" />
</template>
