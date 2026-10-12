<script setup lang="ts">
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import WorldGlobe from '../components/WorldGlobe.vue'
</script>
<template>
<div class="app-site">
  <SiteHeader active="embarque" />
  <main class="tracking-page">
    <div class="container tracking-grid"><div class="tracking-copy"><a class="back-link" href="/home#embarque">← Volver al inicio</a><p class="section-tag">CARGA INTERNACIONAL</p><h1>Consulta tu <span>embarque.</span></h1><p>Visualizá de forma interactiva algunas de nuestras conexiones internacionales.</p><div class="demo-note"><span class="demo-note-icon">i</span><span><strong>Vista demostrativa</strong>Las rutas del globo son ilustrativas. Todavía no existe una conexión de seguimiento de embarques.</span></div><a class="btn btn-primary" href="/cotizaciones">Solicitar una cotización <span>↗</span></a></div><WorldGlobe /></div>
  </main>
  <SiteFooter />
</div>
</template>
