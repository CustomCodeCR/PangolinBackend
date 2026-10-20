/* JSON-LD coherente con los servicios y las secciones publicas del sitio.
 * No marcar noticias del CMS como NewsArticle: no se prerenderizan por articulo.
 */
'use strict'
const origin = 'https://logisticacastrofallas.com'
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

function makeStructuredData(route, seo, sourceGraph) {
  if (seo.indexable === false) return null
  const canonicalPath = route === '/home' ? '/' : route
  const canonical = origin + canonicalPath
  const organization = sourceGraph.find(item => item['@type'] === 'Organization')
  const landService = sourceGraph.find(item => item['@type'] === 'Service')
  if (!organization || !landService || organization['@id'] !== organizationId) {
    throw new Error('Faltan los datos verificados de empresa y transporte en index.html')
  }
  // Fuente unica para nombre, direccion, email y telefono: index.html.
  const { '@context': unusedContext, ...organizationWithoutContext } = organization
  const graph = [
    organizationWithoutContext,
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
  if (canonicalPath !== '/') {
    const breadcrumbsId = canonical + '#migas'
    page.breadcrumb = { '@id': breadcrumbsId }
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': breadcrumbsId,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: origin + '/' },
        { '@type': 'ListItem', position: 2, name: pageLabels[route] || seo.title, item: canonical }
      ]
    })
  }
  graph.push(page)
  if (canonicalPath === '/' || route === '/servicios') graph.push(landService)
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
  }
  return { '@context': 'https://schema.org', '@graph': graph }
}
module.exports = { makeStructuredData }
