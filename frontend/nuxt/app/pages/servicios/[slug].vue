<script setup lang="ts">
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
  <PublicLayout>
    <main class="site-main">
      <article class="article">
        <p class="eyebrow">Soluciones logísticas</p>
        <h1>{{ c.title }}</h1>
        <p class="lead">{{ c.intro }}</p>
        <a class="button" href="mailto:comercial@castrofallas.com?subject=Consulta%20de%20servicio">Solicitar información</a>
        <section><h2>¿Qué ofrece Grupo Castro Fallas?</h2><p>{{ c.answer }}</p></section>
        <section><h2>{{ c.heading }}</h2><p>{{ c.body }}</p><ul><li v-for="point in c.points" :key="point">{{ point }}</li></ul></section>
        <section><h2>{{ c.quoteHeading }}</h2><p>{{ c.quoteIntro }}</p><ul><li v-for="item in c.quoteItems" :key="item">{{ item }}</li></ul></section>
        <section><h2>Alcance y disponibilidad</h2><p>{{ c.scopeNote }}</p></section>
        <section><h2>Preguntas frecuentes</h2><div v-for="faq in c.faq" :key="faq.q" class="faq"><h3>{{ faq.q }}</h3><p>{{ faq.a }}</p></div></section>
      </article>
    </main>
  </PublicLayout>
</template>
