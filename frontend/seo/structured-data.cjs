/* JSON-LD coherente con los servicios y las secciones publicas del sitio.
 * No marcar noticias del CMS como NewsArticle: no se prerenderizan por articulo.
 */
'use strict'
const serviceGuides = require('./service-landings.json')
const origin = 'https://www.logisticacastrofallas.com'
const servicePages = require('./service-pages.json')
const serviceFaqs = require('./service-faqs.json')
const organizationId = origin + '/#organizacion'
const siteId = origin + '/#sitio-web'
const pageLabels = {
  '/noticias': 'Noticias',
  '/nosotros': 'Nosotros',
  '/servicios': 'Servicios',
  '/privacidad': 'Política de privacidad',
  '/terminos': 'Términos y condiciones',
  '/cookies': 'Política de cookies',
  '/licencias': 'Créditos y licencias'
}
const serviceDetails = Object.fromEntries(servicePages.map(page => {
  const countries = page.slug === 'transporte-panama-costa-rica' ? ['Panamá', 'Costa Rica'] : ['Costa Rica']
  return ['/servicios/' + page.slug, {
    name: page.title.es,
    type: page.serviceType.es,
    countries,
    faqs: serviceFaqs[page.slug] || []
  }]
}))

function makeStructuredData(route, seo, sourceGraph) {
  if (seo.indexable === false) return null
  const canonicalPath = route === '/home' ? '/' : route
  const canonical = origin + canonicalPath
  const organization = sourceGraph.find(item => item['@type'] === 'Organization')
  const landService = sourceGraph.find(item => item['@type'] === 'Service')
  const serviceGuide = serviceGuides[route]
  if (!organization || !landService || organization['@id'] !== organizationId) {
    throw new Error('Faltan los datos verificados de empresa y transporte en index.html')
  }
  // Fuente unica para nombre, direccion, email y telefono: index.html.
  const { '@context': unusedContext, ...organizationWithoutContext } = organization
  const graph = [
    organizationWithoutContext,
    {
      '@type': 'LocalBusiness',
      '@id': origin + '/#sede-curridabat',
      name: organization.name,
      url: origin + '/',
      telephone: organization.telephone,
      email: organization.email,
      address: organization.address,
      parentOrganization: { '@id': organizationId }
    },
    {
      '@type': 'WebSite',
      '@id': siteId,
      url: origin + '/',
      name: 'Grupo Castro Fallas',
      inLanguage: 'es-CR',
      publisher: { '@id': organizationId }
    }
  ]
  const page = {
    '@type': route === '/nosotros' ? 'AboutPage' : route === '/noticias' ? 'CollectionPage' : 'WebPage',
    '@id': canonical + '#pagina',
    url: canonical,
    name: seo.title,
    description: seo.description,
    inLanguage: 'es-CR',
    isPartOf: { '@id': siteId },
    about: { '@id': organizationId }
  }
  if (seo.socialImage) page.primaryImageOfPage = { '@type': 'ImageObject', url: origin + seo.socialImage }
  const serviceDetail = serviceDetails[route]
  if (serviceGuide || serviceDetail) page.mainEntity = { '@id': canonical + '#servicio' }
  if (canonicalPath !== '/') {
    const breadcrumbsId = canonical + '#migas'
    page.breadcrumb = { '@id': breadcrumbsId }
    const isServiceRoute = !!serviceGuide || !!serviceDetail
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': breadcrumbsId,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: origin + '/' },
        ...(isServiceRoute ? [{ '@type': 'ListItem', position: 2, name: 'Servicios', item: origin + '/servicios' }] : []),
        { '@type': 'ListItem', position: isServiceRoute ? 3 : 2, name: serviceGuide?.es.label || serviceDetail?.name || pageLabels[route] || seo.title, item: canonical }
      ]
    })
  }
  graph.push(page)
  if (canonicalPath === '/' || route === '/servicios') graph.push(landService)
  if (serviceGuide) {
    graph.push({
      '@type': 'Service',
      '@id': canonical + '#servicio',
      name: serviceGuide.es.title,
      serviceType: serviceGuide.es.label,
      description: serviceGuide.es.answer,
      provider: { '@id': organizationId },
      mainEntityOfPage: { '@id': canonical + '#pagina' },
      areaServed: { '@type': 'Country', name: 'Costa Rica' },
      availableChannel: {
        '@type': 'ServiceChannel',
        serviceUrl: canonical,
        servicePhone: { '@type': 'ContactPoint', telephone: organization.telephone, contactType: 'sales' }
      },
      url: canonical
    })
  }
  if (route === '/servicios') {
    const services = [
      ['aereo', 'Transporte aéreo de carga', 'Transporte aéreo internacional'],
      ['maritimo', 'Transporte marítimo de carga', 'Transporte marítimo internacional'],
      ['multimodal', 'Logística multimodal', 'Transporte multimodal de carga'],
      ['aduanas', 'Agenciamiento aduanero', 'Servicios de gestión aduanera'],
      ['almacenamiento', 'Almacenamiento de mercancías', 'Servicios de almacenamiento']
    ]
    for (const [id, name, serviceType] of services) graph.push({
      '@type': 'Service',
      '@id': origin + '/servicios#' + id,
      name,
      serviceType,
      provider: { '@id': organizationId },
      url: origin + '/servicios'
    })
    const existingServiceDetails = [
      ['agenciamiento-aduanal', 'Agenciamiento aduanal', 'Coordinación de gestiones y documentación aduanera según cada operación', 'Gestiones y documentación aduanera sujetas a revisión según la mercancía y el trámite.'],
      ['almacenamiento-fiscal', 'Almacenamiento fiscal', 'Servicios de almacenamiento fiscal', 'Disponibilidad y condiciones de almacenamiento fiscal se confirman según la carga y la operación.'],
      ['bodegaje-general', 'Bodegaje general', 'Servicios de bodegaje general', 'Disponibilidad y condiciones de bodegaje general se confirman según la carga y la operación.'],
      ['consolidadora-de-carga', 'Consolidadora de carga', 'Coordinación de carga consolidada LCL', 'Alternativas de consolidación sujetas a revisión de ruta, volumen y detalles del embarque.']
    ]
    for (const [id, name, serviceType, description] of existingServiceDetails) graph.push({
      '@type': 'Service',
      '@id': origin + '/servicios#' + id,
      name,
      serviceType,
      description,
      provider: { '@id': organizationId },
      areaServed: { '@type': 'Country', name: 'Costa Rica' },
      url: origin + '/servicios'
    })
    const faqs = serviceFaqs.servicios || []
    if (faqs.length) graph.push({
      '@type': 'FAQPage',
      '@id': origin + '/servicios#preguntas-frecuentes',
      url: origin + '/servicios',
      name: seo.title,
      inLanguage: 'es-CR',
      mainEntity: faqs.map(faq => ({
        '@type': 'Question',
        name: faq.question.es,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer.es }
      }))
    })
  }
  if (serviceDetail) graph.push({
    '@type': 'Service',
    '@id': canonical + '#servicio',
    name: serviceDetail.name,
    serviceType: serviceDetail.type,
    description: seo.description,
    provider: { '@id': organizationId },
    areaServed: serviceDetail.countries.map(name => ({ '@type': 'Country', name })),
    url: canonical
  })
  if (serviceDetail?.faqs.length) graph.push({
    '@type': 'FAQPage',
    '@id': canonical + '#preguntas-frecuentes',
    url: canonical,
    name: seo.title,
    inLanguage: 'es-CR',
    mainEntity: serviceDetail.faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question.es,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer.es }
    }))
  })
  return { '@context': 'https://schema.org', '@graph': graph }
}
module.exports = { makeStructuredData }
