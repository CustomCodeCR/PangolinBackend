import fs from 'node:fs'
import path from 'node:path'
const root = path.resolve(import.meta.dirname, '../..')
const output = path.resolve(import.meta.dirname, '../public')
const images = path.join(root, 'public/images')
if (!fs.existsSync(images)) throw new Error('No se encontró frontend/public/images')
fs.mkdirSync(output, { recursive: true })
fs.cpSync(images, path.join(output, 'images'), { recursive: true, force: true })
fs.copyFileSync(path.join(root, 'public/favicon.png'), path.join(output, 'favicon.png'))
// No copiar robots.txt ni sitemap.xml del frontend legacy: los genera Nitro dinámicamente.
console.log('Recursos públicos preparados para Nuxt sin duplicar sitemap ni robots')
