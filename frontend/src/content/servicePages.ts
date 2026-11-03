import pageData from '../../seo/service-pages.json'
import faqData from '../../seo/service-faqs.json'

type Localized = { es: string; en: string }
export type ServicePage = {
  slug: string
  serviceType: Localized
  title: Localized
  eyebrow: Localized
  lead: Localized
  location: Localized
  image: string
  imageAlt: Localized
  sections: { title: Localized; body: Localized }[]
  faqs: { question: Localized; answer: Localized }[]
  quoteLabel: Localized
}

export const servicePages = pageData.map(page => ({
  ...page,
  faqs: faqData[page.slug as keyof typeof faqData] ?? []
})) as ServicePage[]
