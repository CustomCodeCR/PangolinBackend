import { articlePath } from '../../app/utils/news'
import type { PublicNews } from '../../app/utils/news'
import serviceGuides from '../../../seo/service-landings.json'
function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
export default defineCachedEventHandler(async event => {
  const config = useRuntimeConfig(event)
  const base = String(config.public.siteUrl).replace(/\/$/, '')
  const urls = ['/', '/nosotros', '/servicios', '/noticias', ...Object.keys(serviceGuides)]
  try {
    const articles = await $fetch<PublicNews[]>(String(config.cmsApiBase).replace(/\/$/, '') + '/api/content/news', { timeout: 5000 })
    if (Array.isArray(articles)) {
      for (const item of articles) if (item && item.id && item.title && item.published !== false) urls.push(articlePath(item))
    }
  } catch {
    // La caída temporal del CMS no debe impedir el sitemap de páginas estables.
  }
  setHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
  const unique = [...new Set(urls)]
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    unique.map(path => '  <url><loc>' + escapeXml(base + path) + '</loc></url>').join('\n') +
    '\n</urlset>\n'
}, { maxAge: 600, swr: true, name: 'pangolin-sitemap' })
