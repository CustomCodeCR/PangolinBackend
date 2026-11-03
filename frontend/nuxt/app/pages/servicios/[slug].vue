<script setup lang="ts">
import LegacyServiceLanding from '@legacy/pages/ServiceLanding.vue'
import serviceGuides from '../../../../seo/service-landings.json'
type Guide = (typeof serviceGuides)[keyof typeof serviceGuides]
const route = useRoute()
const path = '/servicios/' + String(route.params.slug || '')
const guide: Guide | undefined = (serviceGuides as Record<string, Guide>)[path]
if (!guide) throw createError({ statusCode: 404, statusMessage: 'Servicio no encontrado' })
const c = guide.es
const canonical = 'https://www.logisticacastrofallas.com' + path
usePublicSeo({
  path, title: c.title + ' | Grupo Castro Fallas',
  description: c.answer.slice(0, 155),
  image: '/images/cover-logistics.jpeg',
  schema: [{
    '@type': 'Service', '@id': canonical + '#servicio',
    name: c.title, description: c.answer, serviceType: c.label,
    provider: { '@id': 'https://www.logisticacastrofallas.com/#organizacion' },
    mainEntityOfPage: { '@id': canonical + '#pagina' },
    areaServed: { '@type': 'Country', name: 'Costa Rica' }, url: canonical
  }, {
    '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://www.logisticacastrofallas.com/' },
      { '@type': 'ListItem', position: 2, name: 'Servicios', item: 'https://www.logisticacastrofallas.com/servicios' },
      { '@type': 'ListItem', position: 3, name: c.label, item: canonical }
    ]
  }]
})
</script>
<template>
  <LegacyServiceLanding :pathname="path" />
</template>
