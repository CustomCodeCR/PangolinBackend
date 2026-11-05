/**
 * Satellite-textured sphere underneath the existing CastroGlobe canvas layers.
 *
 * The photographic day map is sourced from Solar System Scope / Wikimedia Commons
 * (CC BY 4.0): https://commons.wikimedia.org/wiki/File:Solarsystemscope_texture_2k_earth_daymap.jpg
 * Attribution: Solar System Scope (solarsystemscope.com), CC BY 4.0,
 * https://creativecommons.org/licenses/by/4.0/ . No modifications to the source
 * image, bundled unchanged in public/images/earth-satellite-daymap.jpg.
 * The lighting below is applied only by the rendering shader.
 *
 * This helper never creates markers, arcs, controls or DOM layout. It shares
 * exactly the orthographic center/radius of the existing d3-geo renderer.
 * WebGL and texture loading are optional: if either fails, the original
 * geographic canvas drawing remains fully operational.
 */

const EARTH_MAP_URL =
  '/images/earth-satellite-daymap.jpg'

const VERTEX_SHADER = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D uEarth;
uniform vec2 uViewport;
uniform float uRadius;
uniform float uLongitude;
uniform float uLatitude;

const float PI = 3.14159265358979323846;
const float TAU = 6.28318530717958647692;

void main() {
  // gl_FragCoord has origin at the bottom left. Positive y means north.
  vec2 pos = (gl_FragCoord.xy - uViewport * 0.5) / uRadius;
  float distanceSquared = dot(pos, pos);
  if (distanceSquared > 1.0) discard;

  vec3 sphere = vec3(pos, sqrt(max(0.0, 1.0 - distanceSquared)));
  float yaw = uLongitude;
  float pitch = uLatitude;
  float sinLon = sin(yaw);
  float cosLon = cos(yaw);
  float sinLat = sin(pitch);
  float cosLat = cos(pitch);

  // Exact inverse of the globe's existing orthographic geographic projection.
  vec3 forward = vec3(cosLat * cosLon, cosLat * sinLon, sinLat);
  vec3 east = vec3(-sinLon, cosLon, 0.0);
  vec3 north = vec3(-sinLat * cosLon, -sinLat * sinLon, cosLat);
  vec3 surface = normalize(east * sphere.x + north * sphere.y + forward * sphere.z);

  float longitude = atan(surface.y, surface.x);
  float latitude = asin(clamp(surface.z, -1.0, 1.0));
  vec2 uv = vec2(longitude / TAU + 0.5, latitude / PI + 0.5);

  // The image contains actual geographic relief, coastlines, ice and oceans.
  vec3 daylight = texture2D(uEarth, uv).rgb;
  // Gentle physical shading, without the flat polygon or graticule effect.
  float diffuse = 0.88 + 0.12 * max(0.0, dot(sphere, normalize(vec3(-0.3, 0.65, 1.0))));
  float limb = 0.74 + 0.26 * pow(sphere.z, 0.46);
  vec3 color = pow(daylight, vec3(0.93)) * diffuse * limb;
  // Fine cool atmospheric rim inside the sphere, no external glow or shadow.
  float rim = pow(1.0 - sphere.z, 7.0);
  color += vec3(0.03, 0.10, 0.16) * rim;
  gl_FragColor = vec4(color, 1.0);
}
`

function compileShader(gl, type, source) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  gl.deleteShader(shader)
  return null
}

function buildProgram(gl) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex)
    if (fragment) gl.deleteShader(fragment)
    return null
  }
  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program
  gl.deleteProgram(program)
  return null
}

export function createSatelliteSurface(onReady) {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl', {
      alpha: true, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: true
    })
    if (!gl) return null

    const program = buildProgram(gl)
    const texture = gl.createTexture()
    const buffer = gl.createBuffer()
    if (!program || !texture || !buffer) return null

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1
    ]), gl.STATIC_DRAW)
    gl.useProgram(program)
    const attrib = gl.getAttribLocation(program, 'aPosition')
    if (attrib < 0) return null
    gl.enableVertexAttribArray(attrib)
    gl.vertexAttribPointer(attrib, 2, gl.FLOAT, false, 0, 0)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    const uniforms = {
      map: gl.getUniformLocation(program, 'uEarth'),
      viewport: gl.getUniformLocation(program, 'uViewport'),
      radius: gl.getUniformLocation(program, 'uRadius'),
      lon: gl.getUniformLocation(program, 'uLongitude'),
      lat: gl.getUniformLocation(program, 'uLatitude')
    }
    gl.uniform1i(uniforms.map, 0)
    let ready = false
    let disposed = false
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => {
      if (disposed) return
      try {
        gl.bindTexture(gl.TEXTURE_2D, texture)
        // North is at the top of the JPEG; WebGL v=1 must mean north.
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image)
        ready = true
        onReady?.()
      } catch {
        // Keep the already functioning original geographic renderer.
      }
    }
    image.onerror = () => {
      // Network/CORS problems must not break the globe or shipment tracking.
    }
    const onContextLost = event => {
      event.preventDefault()
      ready = false
      onReady?.()
    }
    canvas.addEventListener('webglcontextlost', onContextLost)
    image.src = EARTH_MAP_URL

    return {
      canvas,
      render(width, height, pixelRatio, radius, longitude, latitude) {
        if (!ready || disposed || !width || !height || radius <= 0) return false
        const widthPx = Math.max(1, Math.round(width * pixelRatio))
        const heightPx = Math.max(1, Math.round(height * pixelRatio))
        if (canvas.width !== widthPx || canvas.height !== heightPx) {
          canvas.width = widthPx
          canvas.height = heightPx
        }
        gl.viewport(0, 0, widthPx, heightPx)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.useProgram(program)
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        gl.enableVertexAttribArray(attrib)
        gl.vertexAttribPointer(attrib, 2, gl.FLOAT, false, 0, 0)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.uniform2f(uniforms.viewport, widthPx, heightPx)
        gl.uniform1f(uniforms.radius, radius * pixelRatio)
        gl.uniform1f(uniforms.lon, longitude * Math.PI / 180)
        gl.uniform1f(uniforms.lat, latitude * Math.PI / 180)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
        return true
      },
      destroy() {
        disposed = true
        ready = false
        image.onload = null
        image.onerror = null
        image.src = ''
        canvas.removeEventListener('webglcontextlost', onContextLost)
        gl.deleteTexture(texture)
        gl.deleteBuffer(buffer)
        gl.deleteProgram(program)
      }
    }
  } catch {
    return null
  }
}
