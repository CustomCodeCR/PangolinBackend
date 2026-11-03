<script setup lang="ts">
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
const serviceCards = Object.entries(guides).map(([url, entry]) => ({ url, title: entry.es.label, text: entry.es.answer }))
</script>
<template>
  <PublicLayout>
    <main class="site-main">
      <p class="eyebrow">Logística internacional · Costa Rica</p>
      <h1>Agenciamiento aduanal y soluciones logísticas en Costa Rica</h1>
      <p class="lead">Grupo Castro Fallas coordina servicios de transporte marítimo, aéreo y terrestre, carga consolidada y gestiones aduaneras. Consultá con nuestro equipo por requisitos y disponibilidad según el tipo de mercancía.</p>
      <a class="button" href="/cotizaciones">Solicitar cotización</a>
      <section aria-labelledby="services-heading">
        <h2 id="services-heading">Soluciones logísticas</h2>
        <p>Conocé las modalidades de servicio y qué información se necesita para solicitar una cotización.</p>
        <div class="cards"><article v-for="item in serviceCards" :key="item.url" class="tile"><h2><a :href="item.url">{{ item.title }}</a></h2><p>{{ item.text }}</p></article></div>
      </section>
      <section class="content-block">
        <h2>Transporte internacional</h2>
        <p>La coordinación de operaciones marítimas FCL y LCL, aéreas y terrestres FTL y LTL depende del origen, destino, tipo de carga, documentación y disponibilidad. El equipo comercial puede orientar sobre alternativas según la operación.</p>
        <h2>¿Cómo solicitar información?</h2>
        <p>Indicá el lugar de origen y destino, tipo de mercancía, peso, volumen, fechas y condiciones comerciales. Para consultas escribí a <a href="mailto:comercial@castrofallas.com">comercial@castrofallas.com</a>.</p>
      </section>
    </main>
  </PublicLayout>
</template>
