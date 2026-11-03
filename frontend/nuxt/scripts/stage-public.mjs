import fs from 'node:fs'
import path from 'node:path'
const root = path.resolve(import.meta.dirname, '../..')
const output = path.resolve(import.meta.dirname, '../public')
const images = path.join(root, 'public/images')
if (!fs.existsSync(images)) throw new Error('No se encontró frontend/public/images')
fs.mkdirSync(output, { recursive: true })
// Los componentes de frontend/src importan dependencias desde /frontend.
// En el build Nuxt aislado se reutiliza el mismo node_modules, evitando
// resolver dos copias de Vue/Vue-I18n en SSR e hidratación.
const legacyModules = path.join(root, 'node_modules')
const nuxtModules = path.resolve(import.meta.dirname, '../node_modules')
if (!fs.existsSync(legacyModules)) fs.symlinkSync(nuxtModules, legacyModules, 'dir')
fs.cpSync(images, path.join(output, 'images'), { recursive: true, force: true })
// Las páginas legales incluyen referencias a avisos de terceros.
fs.cpSync(path.join(root, 'public/licenses'), path.join(output, 'licenses'), { recursive: true, force: true })
fs.copyFileSync(path.join(root, 'public/favicon.png'), path.join(output, 'favicon.png'))
// Archivos de descubrimiento/verificación públicos necesarios en el servidor Nuxt.
for (const asset of ['BingSiteAuth.xml', 'llms.txt']) {
  fs.copyFileSync(path.join(root, 'public', asset), path.join(output, asset))
}
// No copiar robots.txt ni sitemap.xml del frontend legacy: los genera Nitro dinámicamente.
console.log('Recursos públicos preparados para Nuxt sin duplicar sitemap ni robots')
