import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
const base = path.resolve(import.meta.dirname, '..')
const source = f => fs.readFileSync(path.resolve(base, f), 'utf8')
const guides = JSON.parse(fs.readFileSync(path.resolve(base, '../seo/service-landings.json'), 'utf8'))
assert.equal(Object.keys(guides).length, 4, 'Se esperaban cuatro guías especializadas')
for (const [route, guide] of Object.entries(guides)) {
  assert.ok(route.startsWith('/servicios/'), 'Ruta de servicio inválida: ' + route)
  assert.ok(guide.es.title && guide.es.answer && guide.es.faq?.length >= 5, 'Contenido AEO incompleto: ' + route)
}
assert.match(source('nuxt.config.ts'), /ssr:\s*true/, 'Nuxt debe mantener SSR')
assert.match(source('server/routes/robots.txt.ts'), /OAI-SearchBot/, 'Debe permitir SearchBot')
assert.match(source('server/routes/robots.txt.ts'), /GPTBot/, 'Política de entrenamiento no declarada')
assert.match(source('server/routes/sitemap.xml.ts'), /articlePath/, 'Las noticias deben aparecer en sitemap')
assert.match(source('app/pages/noticias/[slug].vue'), /statusCode: 404/, 'Noticia inexistente debe devolver HTTP 404')
assert.match(source('app/pages/servicios/[slug].vue'), /LegacyServiceLanding/, 'Páginas Nuxt deben reutilizar el diseño original')
assert.match(source('../src/pages/ServiceLanding.vue'), /details\.faq/, 'Las preguntas AEO deben mostrarse en el componente original')
assert.match(source('../src/pages/News.vue'), /sanitizeNewsHtml\(/, 'La noticia debe sanear su HTML')
console.log('Contrato estático SEO/GEO/AEO/AIO Nuxt: OK (no sustituye pruebas de build, SSR o navegador)')
