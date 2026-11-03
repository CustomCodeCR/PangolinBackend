<script setup lang="ts">
import guides from '../../../../seo/service-landings.json'
usePublicSeo({
  path: '/servicios', title: 'Servicios de transporte y aduanas | Grupo Castro Fallas',
  description: 'Agenciamiento aduanal, transporte marítimo FCL/LCL, terrestre FTL/LTL, carga aérea, bodegaje y coordinación de almacenamiento fiscal en Costa Rica.'
})
const links = Object.entries(guides).map(([href, data]) => ({ href, name: data.es.label, description: data.es.answer }))
</script>
<template>
  <PublicLayout>
    <main class="site-main">
      <p class="eyebrow">Nuestros servicios</p>
      <h1>Servicios logísticos y aduanales</h1>
      <p class="lead">Información útil para empresas importadoras y exportadoras. La disponibilidad depende de cada operación y los requerimientos de la mercancía.</p>
      <div class="cards"><article class="tile" v-for="item in links" :key="item.href"><h2><a :href="item.href">{{ item.name }}</a></h2><p>{{ item.description }}</p></article></div>
      <section class="content-block"><h2>Otros servicios de transporte</h2><p>Consultá por transporte marítimo FCL y LCL, aéreo, terrestre FTL y LTL y coordinación multimodal según las rutas aplicables.</p></section>
    </main>
  </PublicLayout>
</template>
