import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
const base = path.resolve(import.meta.dirname, '..')
const source = f => fs.readFileSync(path.resolve(base, f), 'utf8')
const companies = JSON.parse(fs.readFileSync(path.resolve(base, '../seo/companies.json'), 'utf8'))
const keywords = JSON.parse(fs.readFileSync(path.resolve(base, '../seo/keyword-map.json'), 'utf8'))
const guides = JSON.parse(fs.readFileSync(path.resolve(base, '../seo/service-landings.json'), 'utf8'))
const newServices = JSON.parse(fs.readFileSync(path.resolve(base, '../seo/service-pages.json'), 'utf8'))
const serviceFaqs = JSON.parse(fs.readFileSync(path.resolve(base, '../seo/service-faqs.json'), 'utf8'))
assert.equal(Object.keys(guides).length, 4, 'Se esperaban cuatro guías especializadas')
for (const [route, guide] of Object.entries(guides)) {
  assert.ok(route.startsWith('/servicios/'), 'Ruta de servicio inválida: ' + route)
  assert.ok(guide.es.title && guide.es.answer && guide.es.faq?.length >= 5, 'Contenido AEO incompleto: ' + route)
}
assert.equal(newServices.length, 6, 'La PR139 debe incluir seis páginas nuevas de servicios')
assert.equal(new Set(newServices.map(item => item.slug)).size, newServices.length, 'Slugs duplicados en servicios')
for (const item of newServices) {
  assert.ok(item.slug && item.title?.es && item.title?.en && item.lead?.es, 'Contenido bilingüe de servicio incompleto')
  assert.ok(serviceFaqs[item.slug]?.length >= 2, 'Faltan preguntas frecuentes en: ' + item.slug)
}
assert.match(source('app/pages/servicios/[slug].vue'), /LegacyServiceDetail/, 'Las seis páginas nuevas no tienen renderizado Nuxt')
assert.match(source('server/routes/sitemap.xml.ts'), /servicePages/, 'Las páginas nuevas faltan del sitemap de Nuxt')
assert.match(source('nuxt.config.ts'), /servicePages\.map/, 'Las páginas nuevas faltan del prerender')
assert.match(source('scripts/stage-public.mjs'), /BingSiteAuth.xml/, 'Falta publicar verificación Bing en Nuxt')
assert.match(source('scripts/stage-public.mjs'), /llms.txt/, 'Falta publicar llms.txt en Nuxt')
for (const [slug, company] of Object.entries(companies)) {
  assert.ok(company.name && company.description && company.faq?.length >= 2, 'Empresa incompleta: ' + slug)
  assert.ok(keywords['/empresas/' + slug]?.primary, 'Falta palabra clave: ' + slug)
}
assert.match(source('server/routes/sitemap.xml.ts'), /companies/, 'Falta directorio en sitemap')
assert.match(source('app/pages/empresas/[slug].vue'), /usePublicSeo/, 'Falta SEO empresarial SSR')
assert.match(source('../src/components/SiteFooter.vue'), /href="\/empresas"/, 'Falta enlazado interno')
const languageSwitcher = source('../src/components/LanguageSwitcher.vue')
const languageFlags = source('../src/components/LanguageFlag.vue')
assert.match(languageSwitcher, /import LanguageFlag/, 'Selector de idioma debe usar banderas SVG propias')
assert.doesNotMatch(languageSwitcher, /[\u{1F1E6}-\u{1F1FF}]/u, 'Evitar banderas emoji, Windows puede mostrar letras ES/GB')
assert.match(languageFlags, /viewBox="0 0 30 20"/, 'Banderas SVG deben tener dimensiones predecibles')
assert.match(languageFlags, /language === 'es'/, 'Falta bandera española')
assert.match(languageFlags, /#012169/, 'Falta bandera del Reino Unido')
assert.match(source('nuxt.config.ts'), /ssr:\s*true/, 'Nuxt debe mantener SSR')
for (const route of ['privacidad', 'terminos', 'cookies', 'licencias']) {
  assert.match(source('app/pages/' + route + '.vue'), /LegacyLegal/, 'Falta migración de página legal: ' + route)
}
assert.match(source('../src/pages/Legal.vue'), /props\.pathname/, 'Legal debe ser compatible con SSR')
assert.match(source('../src/pages/ServiceDetail.vue'), /props\.pathname/, 'Detalles de servicio deben ser compatibles con SSR')
assert.match(source('server/routes/robots.txt.ts'), /OAI-SearchBot/, 'Debe permitir SearchBot')
assert.match(source('server/routes/robots.txt.ts'), /GPTBot/, 'Política de entrenamiento no declarada')
assert.match(source('server/routes/sitemap.xml.ts'), /articlePath/, 'Las noticias deben aparecer en sitemap')
assert.match(source('app/pages/noticias/[slug].vue'), /statusCode: 404/, 'Noticia inexistente debe devolver HTTP 404')
assert.match(source('app/pages/servicios/[slug].vue'), /LegacyServiceLanding/, 'Páginas Nuxt deben reutilizar el diseño original')
assert.match(source('../src/pages/ServiceLanding.vue'), /details\.faq/, 'Las preguntas AEO deben mostrarse en el componente original')
assert.match(source('../src/pages/News.vue'), /sanitizeNewsHtml\(/, 'La noticia debe sanear su HTML')
console.log('Contrato estático SEO/GEO/AEO/AIO Nuxt: OK (no sustituye pruebas de build, SSR o navegador)')
