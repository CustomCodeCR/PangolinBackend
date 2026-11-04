<script setup lang="ts">
// En la SPA anterior ambos controles viven en Root.vue y se muestran en todas
// las paginas salvo el login. Nuxt carga las paginas sin ese Root, por eso
// montamos las MISMAS herramientas solo en la parte publica de Nuxt.
// ClientOnly impide conexiones/estados del chat en el servidor SSR.
import AssistantBot from '@legacy/components/AssistantBot.vue'
import ScrollProgressButton from '@legacy/components/ScrollProgressButton.vue'
</script>

<template>
  <NuxtPage />
  <ClientOnly>
    <ScrollProgressButton />
    <AssistantBot />
  </ClientOnly>
</template>
