// Post-build smoke: Nuxt/Nitro must include every finished video used by
// the left-hand media panel of individual service pages.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const frontend = path.resolve(import.meta.dirname, '../..')
const nuxt = path.resolve(import.meta.dirname, '..')
const expectedVideos = [
  "service-air.mp4",
  "service-maritime.mp4",
  "service-road.mp4",
  "service-warehouse.mp4"
]

for (const name of expectedVideos) {
  const source = path.join(frontend, 'public/videos', name)
  const staged = path.join(nuxt, 'public/videos', name)
  const built = path.join(nuxt, '.output/public/videos', name)
  assert.ok(fs.existsSync(source), 'Falta MP4 original: ' + source)
  const bytes = fs.statSync(source).size
  assert.ok(bytes > 1024, 'El MP4 está vacío o truncado: ' + source)
  for (const file of [staged, built]) {
    assert.ok(fs.existsSync(file), 'Nuxt no publicó ' + file)
    assert.equal(fs.statSync(file).size, bytes, 'Tamaño inesperado del MP4: ' + file)
  }
}

const landing = fs.readFileSync(path.join(frontend, 'src/pages/ServiceLanding.vue'), 'utf8')
const panelStart = landing.indexOf('<figure class="service-landing-story__media">')
const panelEnd = landing.indexOf('</figure>', panelStart)
// El panel acepta video directo o SiteMedia: esta última opción permite
// reemplazar el MP4 por un recurso publicado desde el editor visual (CMS).
const videoElement = landing.indexOf('<video', panelStart)
const videoSource = landing.indexOf('<source :src="details.video" type="video/mp4"', videoElement)
const cmsVideo = landing.indexOf('<SiteMedia class="service-landing-story__video"', panelStart)
const originalVideo = panelStart >= 0 && videoElement > panelStart && videoSource > videoElement && panelEnd > videoSource
const editableVideo = panelStart >= 0 && cmsVideo > panelStart && panelEnd > cmsVideo &&
  landing.slice(cmsVideo, panelEnd).includes(':slot-key="serviceStoryKey"') &&
  landing.slice(cmsVideo, panelEnd).includes(':fallback="details.video"') &&
  landing.slice(cmsVideo, panelEnd).includes('default-kind="Video"')
assert.ok(originalVideo || editableVideo, 'Los MP4 o su componente CMS deben estar dentro del panel izquierdo de Servicios')
for (const [route, video] of [
  ['transporte-aereo', 'service-air.mp4'],
  ['transporte-terrestre', 'service-road.mp4'],
  ['almacenamiento-fiscal', 'service-warehouse.mp4']
]) {
  assert.ok(landing.includes("pathname.endsWith('/" + route + "')"), 'Falta el mapeo de ' + route)
  assert.ok(landing.includes("'/videos/" + video + "'"), 'Falta el video ' + video)
}
assert.ok(landing.includes("return '/videos/service-maritime.mp4'"), 'Falta video marítimo predeterminado')
console.log('Videos de servicios: 4 MP4 publicados en Nuxt y panel izquierdo configurado correctamente.')
