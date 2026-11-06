/**
 * Natural Earth photographic surface for the Tracking / Rastreo globe only.
 *
 * Source texture: Solar System Scope's earth daymap, distributed as CC BY 4.0.
 * Attribution: Solar System Scope (https://www.solarsystemscope.com/textures/).
 * Wikimedia Commons:
 * https://commons.wikimedia.org/wiki/File:Solarsystemscope_texture_2k_earth_daymap.jpg
 * License: https://creativecommons.org/licenses/by/4.0/
 *
 * The original texture is bundled in public/images/earth-satellite-daymap.jpg.
 * Canvas 2D is used deliberately: it works on Safari / Firefox / older Macs
 * without a WebGL context, GPU shader availability or cross-origin requests.
 * This module draws only the sphere; original markers, paths, controls and
 * typography are still drawn by CastroGlobe on top of the resulting canvas.
 */

const TEXTURE_URL = '/images/earth-satellite-daymap.jpg'
const PI = Math.PI
const HALF_PI = PI / 2
const TWO_PI = PI * 2
const RAD = PI / 180
// Higher definition on capable devices; older Macs render a smaller surface.
const SURFACE_PIXELS_BY_QUALITY = [400, 500, 620]
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const smoothstep = (min, max, value) => {
  const t = clamp((value - min) / (max - min), 0, 1)
  return t * t * (3 - 2 * t)
}

export function createSatelliteSurface(onReady) {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: true })
  const sourceCanvas = document.createElement('canvas')
  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true })
  if (!ctx || !sourceCtx) return null

  let disposed = false
  let pixels = null
  // Textural relief is computed once at image load, never inside animation.
  // This is a visual bump approximation, not geographic elevation data.
  let reliefX = null
  let reliefY = null
  let textureWidth = 0
  let textureHeight = 0
  let output = null
  let sphereGrid = null

  const image = new Image()
  image.decoding = 'async'
  image.onload = () => {
    if (disposed) return
    try {
      // 2K resolution retains mountain chains and detailed coastlines while
      // bounding the CPU and memory needed to sample the atlas.
      textureWidth = Math.min(2048, image.naturalWidth || image.width)
      textureHeight = Math.max(1, Math.round(textureWidth *
        (image.naturalHeight || image.height) / (image.naturalWidth || image.width)))
      if (!textureWidth || !Number.isFinite(textureHeight)) return
      sourceCanvas.width = textureWidth
      sourceCanvas.height = textureHeight
      sourceCtx.drawImage(image, 0, 0, textureWidth, textureHeight)
      pixels = sourceCtx.getImageData(0, 0, textureWidth, textureHeight).data

      // Estimate terrain direction from local contrasts in the satellite image.
      // Cache two small signed arrays so rotation never resamples neighbors
      // repeatedly. Ocean pixels are always excluded from land bump effects.
      const count = textureWidth * textureHeight
      reliefX = new Int8Array(count)
      reliefY = new Int8Array(count)
      const luminance = new Uint8Array(count)
      const landMask = new Uint8Array(count)
      for (let i = 0; i < count; i++) {
        const j = i * 4
        const rr = pixels[j], gg = pixels[j + 1], bb = pixels[j + 2]
        luminance[i] = (rr * 0.2126 + gg * 0.7152 + bb * 0.0722) | 0
        const blueBias = bb - Math.max(rr, gg)
        landMask[i] = blueBias < 18 ? 1 : 0
      }
      for (let y = 1; y < textureHeight - 1; y++) {
        const row = y * textureWidth
        for (let x = 0; x < textureWidth; x++) {
          const index = row + x
          if (!landMask[index]) continue
          const west = row + (x + textureWidth - 2) % textureWidth
          const east = row + (x + 2) % textureWidth
          const north = (y - 1) * textureWidth + x
          const south = (y + 1) * textureWidth + x
          // Reject artificial coast cliffs; small tonal differences on land
          // are treated as slopes, not as physical height measurements.
          if (!landMask[west] || !landMask[east] || !landMask[north] || !landMask[south]) continue
          reliefX[index] = clamp(Math.round((luminance[east] - luminance[west]) * .8), -95, 95)
          reliefY[index] = clamp(Math.round((luminance[south] - luminance[north]) * .8), -95, 95)
        }
      }
      onReady?.()
    } catch {
      // Preserve the old flat map if the bundled resource is unavailable.
      pixels = null
    }
  }
  image.onerror = () => { pixels = null }
  image.src = TEXTURE_URL

  return {
    canvas,
    render(width, height, pixelRatio, radius, longitude, latitude, quality = 2) {
      if (!pixels || disposed || width <= 0 || height <= 0 || radius <= 0) return false

      // Drawing a capped off-screen surface prevents high-DPI devices from
      // spending too long in CPU-based texture sampling during auto-rotation.
      const qualityLevel = clamp(Math.floor(quality), 0, 2)
      const maxPixels = SURFACE_PIXELS_BY_QUALITY[qualityLevel]
      const scale = Math.min(pixelRatio, 1, maxPixels / Math.max(width, height))
      const outWidth = Math.max(1, Math.round(width * scale))
      const outHeight = Math.max(1, Math.round(height * scale))
      if (canvas.width !== outWidth || canvas.height !== outHeight || !output) {
        canvas.width = outWidth
        canvas.height = outHeight
        output = ctx.createImageData(outWidth, outHeight)
        sphereGrid = null
      }

      const data = output.data
      data.fill(0)
      const cx = outWidth / 2
      const cy = outHeight / 2
      const r = radius * scale
      const invR = 1 / r
      const lon = longitude * RAD
      const lat = latitude * RAD
      // Precompute projection shape and illumination once per size/zoom.
      // Dragging the globe can then reuse the same pixels rather than running
      // sqrt, shading and edge calculations across the entire disc each frame.
      if (!sphereGrid || Math.abs(sphereGrid.radius - r) > .01) {
        const area = outWidth * outHeight
        const east = new Float32Array(area)
        const north = new Float32Array(area)
        const depth = new Float32Array(area)
        const light = new Float32Array(area)
        const border = new Float32Array(area)
        const rowStart = new Int32Array(outHeight)
        const rowEnd = new Int32Array(outHeight)
        for (let y = 0; y < outHeight; y++) {
          const n = (cy - y - .5) * invR
          const n2 = n * n
          const left = Math.max(0, Math.floor(cx - r))
          const right = Math.min(outWidth, Math.ceil(cx + r))
          rowStart[y] = right
          rowEnd[y] = right
          for (let x = left; x < right; x++) {
            const e = (x + .5 - cx) * invR
            const d2 = e * e + n2
            if (d2 > 1) continue
            if (rowStart[y] === right) rowStart[y] = x
            rowEnd[y] = x + 1
            const z = Math.sqrt(1 - d2)
            const index = y * outWidth + x
            east[index] = e
            north[index] = n
            depth[index] = z
            // A wide studio-style light from the upper left creates an
            // unmistakable spherical silhouette without making half of Earth
            // pitch black. Unlike a flat color filter this follows the normal.
            const sun = Math.max(0, -.48 * e + .40 * n + .78 * z)
            const diffuse = .56 + .44 * Math.min(1, sun)
            const limb = .78 + .22 * Math.pow(z, .45)
            light[index] = diffuse * limb
            border[index] = Math.pow(1 - z, 7)
          }
        }
        sphereGrid = { radius: r, east, north, depth, light, border, rowStart, rowEnd }
      }

      const sinLon = Math.sin(lon)
      const cosLon = Math.cos(lon)
      const sinLat = Math.sin(lat)
      const cosLat = Math.cos(lat)

      // Inverse of d3.geoOrthographic with the SAME center and radius.
      // Sphere x is east and sphere y is north in screen coordinates.
      const fwdX = cosLat * cosLon
      const fwdY = cosLat * sinLon
      const fwdZ = sinLat
      const eastX = -sinLon
      const eastY = cosLon
      const northX = -sinLat * cosLon
      const northY = -sinLat * sinLon
      const northZ = cosLat

      for (let y = 0; y < outHeight; y++) {
        const rowOffset = y * outWidth * 4
        for (let x = sphereGrid.rowStart[y]; x < sphereGrid.rowEnd[y]; x++) {
          const gridIndex = y * outWidth + x
          const screenEast = sphereGrid.east[gridIndex]
          const screenNorth = sphereGrid.north[gridIndex]
          const depth = sphereGrid.depth[gridIndex]
          if (screenEast * screenEast + screenNorth * screenNorth > 1) continue

          const earthX = eastX * screenEast + northX * screenNorth + fwdX * depth
          const earthY = eastY * screenEast + northY * screenNorth + fwdY * depth
          const earthZ = northZ * screenNorth + fwdZ * depth
          const mapLon = Math.atan2(earthY, earthX)
          const mapLat = Math.asin(clamp(earthZ, -1, 1))

          // Equirectangular image: x goes west -> east; y goes north -> south.
          const u = clamp((mapLon / TWO_PI + 0.5), 0, 0.999999)
          const v = clamp((HALF_PI - mapLat) / PI, 0, 0.999999)
          const textureX = u * textureWidth - .5
          const textureY = v * textureHeight - .5
          const tx = Math.floor(textureX)
          const ty = clamp(Math.floor(textureY), 0, textureHeight - 1)
          const tx0 = (tx + textureWidth) % textureWidth
          const tx1 = (tx0 + 1) % textureWidth
          const ty1 = Math.min(textureHeight - 1, ty + 1)
          const fx = textureX - tx
          const fy = clamp(textureY - ty, 0, 1)
          const input = (ty * textureWidth + tx0) * 4
          let red, green, blue
          if (qualityLevel === 0) {
            red = pixels[input]
            green = pixels[input + 1]
            blue = pixels[input + 2]
          } else {
            // Bilinear satellite sampling prevents the blocky coastlines and
            // crawling texels that made the original rotation look stiff.
            const i10 = (ty * textureWidth + tx1) * 4
            const i01 = (ty1 * textureWidth + tx0) * 4
            const i11 = (ty1 * textureWidth + tx1) * 4
            const w00 = (1 - fx) * (1 - fy)
            const w10 = fx * (1 - fy)
            const w01 = (1 - fx) * fy
            const w11 = fx * fy
            red = pixels[input] * w00 + pixels[i10] * w10 + pixels[i01] * w01 + pixels[i11] * w11
            green = pixels[input + 1] * w00 + pixels[i10 + 1] * w10
              + pixels[i01 + 1] * w01 + pixels[i11 + 1] * w11
            blue = pixels[input + 2] * w00 + pixels[i10 + 2] * w10
              + pixels[i01 + 2] * w01 + pixels[i11 + 2] * w11
          }

          // The original satellite daymap already has natural variation.
          // Use its blue dominance to isolate the sea, retaining the shoreline
          // and preventing any ocean shading from tinting continents.
          const waterBias = blue - Math.max(red, green)
          const water = smoothstep(10, 45, waterBias)
          let oceanGlint = 0
          let oceanFresnel = 0
          if (water > 0) {
            const sourceLuminance = (red * .2126 + green * .7152 + blue * .0722)
            const shallow = smoothstep(74, 151, sourceLuminance)
            // Broad, planet-scale ocean currents add slight color variation.
            // These are locked to the geography (not the screen), so they
            // naturally rotate with Earth without creating fake animated waves.
            const currentField = Math.sin(mapLon * 2.4 + mapLat * 1.1)
              * Math.cos(mapLat * 2.8)
            const deepR = 7 + currentField * 2
            const deepG = 62 + currentField * 7
            const deepB = 129 + currentField * 11
            const targetR = deepR + (30 - deepR) * shallow
            const targetG = deepG + (118 - deepG) * shallow
            const targetB = deepB + (178 - deepB) * shallow
            // Modest color grading preserves the photographic bathymetry and
            // turquoise shelf water rather than repainting a flat blue sphere.
            const tint = water * .28
            red += (targetR - red) * tint
            green += (targetG - green) * tint
            blue += (targetB - blue) * tint

            // Gentle deep-water attenuation gives offshore water more depth.
            const deepening = 1 - (1 - shallow) * .07 * water
            red *= deepening
            green *= deepening
            blue *= deepening

            // Narrow, physically oriented sunlight reflection. Distinct broad
            // and tight lobes emulate rough sea surfaces without plastic gloss.
            const facingSun = Math.max(0,
              -.30 * screenEast + .42 * screenNorth + .86 * depth)
            const broadGlint = Math.pow(facingSun, 34)
            const fineGlint = Math.pow(facingSun, 78)
            oceanGlint = water * (broadGlint * 11 + fineGlint * 9)
            oceanFresnel = water * Math.pow(1 - depth, 2.6) * 5
          }

          // Ocean relief is negligible at orbital scale. Land alone gets
          // subtle directional shading derived from the source photograph,
          // which makes mountains and valleys read as raised features.
          let terrainShade = 0
          if (water < .75 && reliefX && reliefY) {
            const land = 1 - water
            const gradientX = reliefX[ty * textureWidth + tx0] / 95
            const gradientY = reliefY[ty * textureWidth + tx0] / 95
            const relativeLon = mapLon - lon
            const tangentToLight = -.65 * Math.cos(relativeLon) - .35 * Math.sin(relativeLon)
            terrainShade = clamp((-gradientX * tangentToLight + gradientY * .46) * .19, -.14, .14) * land
          }
          const brightness = clamp(sphereGrid.light[gridIndex] + terrainShade, .36, 1.1)
          const rim = sphereGrid.border[gridIndex]

          const dest = rowOffset + x * 4
          data[dest] = clamp(red * brightness + rim * 4 + oceanGlint * .55 + oceanFresnel * .12, 0, 255)
          data[dest + 1] = clamp(green * brightness + rim * 12 + oceanGlint * .79 + oceanFresnel * .30, 0, 255)
          data[dest + 2] = clamp(blue * brightness + rim * 20 + oceanGlint + oceanFresnel * .56, 0, 255)
          data[dest + 3] = 255
        }
      }
      ctx.putImageData(output, 0, 0)
      return true
    },
    destroy() {
      disposed = true
      pixels = null
      reliefX = null
      reliefY = null
      output = null
      sphereGrid = null
      image.onload = null
      image.onerror = null
      image.src = ''
      canvas.width = 0
      canvas.height = 0
      sourceCanvas.width = 0
      sourceCanvas.height = 0
    }
  }
}
