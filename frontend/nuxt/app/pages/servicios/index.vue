<script setup lang="ts">
import LegacyServices from '@legacy/pages/Services.vue'
import guides from '../../../../seo/service-landings.json'
usePublicSeo({
  path: '/servicios', title: 'Servicios de transporte y aduanas | Grupo Castro Fallas',
  description: 'Agenciamiento aduanal, transporte marítimo FCL/LCL, terrestre FTL/LTL, carga aérea, bodegaje y coordinación de almacenamiento fiscal en Costa Rica.'
})
const links = Object.entries(guides).map(([href, data]) => ({ href, name: data.es.label, description: data.es.answer }))
</script>
<template>
  <LegacyServices />
</template>
