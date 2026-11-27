<script setup lang="ts">
import seoRoutes from '../../../seo/routes.json'
import LegacyAbout from '@legacy/pages/About.vue'
usePublicSeo({
  path: '/nosotros', title: seoRoutes['/nosotros'].title,
  description: seoRoutes['/nosotros'].description
})
</script>
<template>
  <LegacyAbout />
</template>
