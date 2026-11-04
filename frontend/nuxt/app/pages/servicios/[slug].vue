<script setup lang="ts">
import LegacyServiceLanding from '@legacy/pages/ServiceLanding.vue'
import serviceGuides from '../../../../seo/service-landings.json'
import servicePages from '../../../../seo/service-pages.json'
import serviceFaqs from '../../../../seo/service-faqs.json'

type Guide = (typeof serviceGuides)[keyof typeof serviceGuides]
type Faq = { question: { es: string }; answer: { es: string } }

const route = useRoute()
const slug = String(route.params.slug || '')
const path = '/servicios/' + slug
const guide: Guide | undefined = (serviceGuides as Record<string, Guide>)[path]
const detail = servicePages.find(item => item.slug === slug)
if (!guide && !detail) throw createError({ statusCode: 404, statusMessage: 'Servicio no encontrado' })

const title = guide?.es.title ?? detail!.title.es
const description = guide?.es.answer ?? detail!.lead.es
const serviceType = guide?.es.label ?? detail!.serviceType.es
const image = detail?.image ?? '/images/cover-logistics.jpeg'
const base = String(useRuntimeConfig().public.siteUrl).replace(/\/$/, '')
const canonical = base + path
const faqs: Faq[] = detail
  ? ((serviceFaqs as Record<string, Faq[]>)[slug] ?? [])
  : (guide?.es.faq ?? []).map(item => ({ question: { es: item.q }, answer: { es: item.a } }))

usePublicSeo({
  path,
  title: title + ' | Grupo Castro Fallas',
  description: description.slice(0, 160),
  image,
  schema: [
    {
      '@type': 'Service', '@id': canonical + '#servicio',
      name: title, description, serviceType,
      provider: { '@id': base + '/#organizacion' },
      mainEntityOfPage: { '@id': canonical + '#pagina' },
      areaServed: slug === 'transporte-panama-costa-rica'
        ? [{ '@type': 'Country', name: 'Costa Rica' }, { '@type': 'Country', name: 'Panamá' }]
        : { '@type': 'Country', name: 'Costa Rica' },
      url: canonical
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: base + '/' },
        { '@type': 'ListItem', position: 2, name: 'Servicios', item: base + '/servicios' },
        { '@type': 'ListItem', position: 3, name: serviceType, item: canonical }
      ]
    },
    ...(faqs.length ? [{
      '@type': 'FAQPage',
      mainEntity: faqs.map(faq => ({
        '@type': 'Question', name: faq.question.es,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer.es }
      }))
    }] : [])
  ]
})
</script>

<template>
  <LegacyServiceLanding :pathname="path" />
</template>
