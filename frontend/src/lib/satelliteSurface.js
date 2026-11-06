/**
 * Natural Earth photographic surface for the Home / Carga Internacional globe only.
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
const MAX_SURFACE_PIXELS = 500
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export function createSatelliteSurface(onReady) {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: true })
  const sourceCanvas = document.createElement('canvas')
  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true })
  if (!ctx || !sourceCtx) return null

  let disposed = false
  let pixels = null
  let textureWidth = 0
  let textureHeight = 0
  let output = null

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
    render(width, height, pixelRatio, radius, longitude, latitude) {
      if (!pixels || disposed || width <= 0 || height <= 0 || radius <= 0) return false

      // Drawing a capped off-screen surface prevents high-DPI devices from
      // spending too long in CPU-based texture sampling during auto-rotation.
      const scale = Math.min(pixelRatio, 1, MAX_SURFACE_PIXELS / Math.max(width, height))
      const outWidth = Math.max(1, Math.round(width * scale))
      const outHeight = Math.max(1, Math.round(height * scale))
      if (canvas.width !== outWidth || canvas.height !== outHeight || !output) {
        canvas.width = outWidth
        canvas.height = outHeight
        output = ctx.createImageData(outWidth, outHeight)
      }

      const data = output.data
      data.fill(0)
      const cx = outWidth / 2
      const cy = outHeight / 2
      const r = radius * scale
      const invR = 1 / r
      const lon = longitude * RAD
      const lat = latitude * RAD
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

      const xMin = Math.max(0, Math.floor(cx - r))
      const xMax = Math.min(outWidth, Math.ceil(cx + r))
      const yMin = Math.max(0, Math.floor(cy - r))
      const yMax = Math.min(outHeight, Math.ceil(cy + r))
      for (let y = yMin; y < yMax; y++) {
        const screenNorth = (cy - y - 0.5) * invR
        const northSquared = screenNorth * screenNorth
        const rowOffset = y * outWidth * 4
        for (let x = xMin; x < xMax; x++) {
          const screenEast = (x + 0.5 - cx) * invR
          const d2 = screenEast * screenEast + northSquared
          if (d2 > 1) continue
          const depth = Math.sqrt(1 - d2)

          const earthX = eastX * screenEast + northX * screenNorth + fwdX * depth
          const earthY = eastY * screenEast + northY * screenNorth + fwdY * depth
          const earthZ = northZ * screenNorth + fwdZ * depth
          const mapLon = Math.atan2(earthY, earthX)
          const mapLat = Math.asin(clamp(earthZ, -1, 1))

          // Equirectangular image: x goes west -> east; y goes north -> south.
          const u = clamp((mapLon / TWO_PI + 0.5), 0, 0.999999)
          const v = clamp((HALF_PI - mapLat) / PI, 0, 0.999999)
          const tx = Math.floor(u * textureWidth)
          const ty = Math.floor(v * textureHeight)
          const input = (ty * textureWidth + tx) * 4
          let red = pixels[input]
          let green = pixels[input + 1]
          let blue = pixels[input + 2]

          // Azure ocean from the reference; mountain/country relief retains
          // original photographic detail rather than flat vector polygons.
          const waterBias = blue - Math.max(red, green)
          const water = clamp((waterBias - 14) / 38, 0, 1) * 0.72
          red += (12 - red) * water
          green += (110 - green) * water
          blue += (186 - blue) * water

          // Soft directional daylight and naturally darkened silhouette edge.
          const diffuse = 0.88 + 0.12 * Math.max(0,
            (-0.3 * screenEast + 0.65 * screenNorth + depth) / 1.23)
          const limb = 0.74 + 0.26 * Math.pow(depth, 0.46)
          const brightness = diffuse * limb
          const rim = Math.pow(1 - depth, 7)
          const dest = rowOffset + x * 4
          data[dest] = clamp(red * brightness + rim * 8, 0, 255)
          data[dest + 1] = clamp(green * brightness + rim * 25, 0, 255)
          data[dest + 2] = clamp(blue * brightness + rim * 41, 0, 255)
          data[dest + 3] = 255
        }
      }
      ctx.putImageData(output, 0, 0)
      return true
    },
    destroy() {
      disposed = true
      pixels = null
      output = null
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
