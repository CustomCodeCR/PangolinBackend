type SchemaNode = Record<string, unknown>
type SeoInput = {
  title: string
  description: string
  path: string
  image?: string
  schema?: SchemaNode[]
  type?: 'website' | 'article'
}
export function usePublicSeo(input: SeoInput) {
  const urlBase = String(useRuntimeConfig().public.siteUrl).replace(/\/$/, '')
  const canonical = urlBase + (input.path === '/' ? '/' : input.path)
  const image = urlBase + (input.image || '/images/hero.webp')
  useSeoMeta({
    title: input.title,
    description: input.description,
    robots: 'index,follow,max-image-preview:large',
    ogTitle: input.title,
    ogDescription: input.description,
    ogUrl: canonical,
    ogType: input.type || 'website',
    ogSiteName: 'Grupo Castro Fallas',
    ogLocale: 'es_CR',
    ogImage: image,
    twitterCard: 'summary_large_image',
    twitterTitle: input.title,
    twitterDescription: input.description,
    twitterImage: image
  })
  const organizationId = urlBase + '/#organizacion'
  const graph: SchemaNode[] = [
    {
      '@type': 'Organization', '@id': organizationId, name: 'Grupo Castro Fallas',
      alternateName: 'Castro Fallas Logística Internacional',
      url: urlBase + '/', logo: urlBase + '/images/logo.png',
      email: 'comercial@castrofallas.com', telephone: '+506 2272-6772',
      address: {
        '@type': 'PostalAddress', streetAddress: 'WX83+2PJ, María Auxiliadora',
        addressLocality: 'Curridabat', addressRegion: 'San José',
        postalCode: '11801', addressCountry: 'CR'
      }
    },
    {
      '@type': 'LocalBusiness', '@id': urlBase + '/#sede-curridabat',
      name: 'Grupo Castro Fallas', parentOrganization: { '@id': organizationId },
      url: urlBase + '/', telephone: '+506 2272-6772', email: 'comercial@castrofallas.com',
      address: { '@type': 'PostalAddress', addressLocality: 'Curridabat', addressRegion: 'San José', addressCountry: 'CR' }
    },
    {
      '@type': 'WebSite', '@id': urlBase + '/#sitio-web',
      name: 'Grupo Castro Fallas', url: urlBase + '/', inLanguage: 'es-CR',
      publisher: { '@id': organizationId }
    },
    {
      '@type': 'WebPage', '@id': canonical + '#pagina', url: canonical,
      name: input.title, description: input.description, inLanguage: 'es-CR',
      isPartOf: { '@id': urlBase + '/#sitio-web' }, about: { '@id': organizationId }
    },
    ...(input.schema || [])
  ]
  useHead({
    link: [{ rel: 'canonical', href: canonical }],
    script: [{ type: 'application/ld+json', innerHTML: JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c') }]
  })
  return { canonical, organizationId }
}
