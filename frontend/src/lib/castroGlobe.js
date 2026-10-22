/**
 * Castro Globe, an independent Canvas 2D renderer.
 * Original implementation. Uses d3-geo (ISC), topojson-client (ISC),
 * and world-atlas (ISC, Natural Earth public-domain geographic data).
 * It does NOT import or include CanvasGlobe or 3d-world-map code.
 */
import { geoGraticule, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import worldAtlas from 'world-atlas/countries-110m.json'

const countries = feature(worldAtlas, worldAtlas.objects.countries)
const DEG = Math.PI / 180
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const wrap = n => ((n + 540) % 360) - 180
const lerp = (a, b, t) => a + (b - a) * t
const color = (value, fallback) => typeof value === 'string' && value ? value : fallback
const noMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

export class CastroGlobe {
  constructor(canvas, options = {}) {
    if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError('CastroGlobe requires a canvas')
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    if (!this.ctx) throw new Error('Canvas 2D is unavailable')
    this.options = { autoRotate: true, interactive: true, zoomable: true, rotateSpeed: 0.09,
      stars: true, graticule: true, shade: true, labels: 'markers', ...options }
    this.markers = [...(options.markers ?? [])]
    this.arcs = [...(options.arcs ?? [])]
    this.arcGeometries = this.buildArcGeometries(this.arcs)
    // Fidelity governor: higher DPR and effects on capable devices; lighter on modest hardware.
    this.qualityCeiling = this.detectQuality()
    this.quality = this.qualityCeiling
    this.ultraLow = false
    this.slowFrames = 0
    this.fastFrames = 0
    this.needsPaint = true
    this.onScreen = true
    this.pageVisible = !document.hidden
    this.lon = Number(options.center?.lon ?? 10)
    this.lat = Number(options.center?.lat ?? 20)
    this.zoom = Number(options.zoom ?? 1)
    this.target = null
    this.running = true
    this.drag = null
    this.activePointers = new Map()
    this.pinch = null
    this.markerHits = []
    this.frameId = 0
    this.lastFrame = 0
    this.lastPaint = -Infinity
    this.width = 0
    this.height = 0
    this.pixelRatio = 1
    this.projector = geoOrthographic().clipAngle(90).precision(1)
    this.path = geoPath(this.projector, this.ctx)
    // Before: meridians/parallels every 10 degrees. Dark theme now uses 15 degrees.
    this.graticule = geoGraticule().step([15, 15])()
    this.bound = {
      down: event => this.pointerDown(event),
      move: event => this.pointerMove(event),
      up: event => this.pointerUp(event),
      wheel: event => this.onWheel(event),
      click: event => this.onClick(event),
      key: event => this.onKey(event),
      visibility: () => {
        this.pageVisible = !document.hidden
        if (this.pageVisible) { this.lastFrame = 0; this.invalidate() }
        else this.pause()
      }
    }
    canvas.style.touchAction = 'none'
    canvas.addEventListener('pointerdown', this.bound.down)
    canvas.addEventListener('pointermove', this.bound.move)
    canvas.addEventListener('pointerup', this.bound.up)
    canvas.addEventListener('pointercancel', this.bound.up)
    canvas.addEventListener('wheel', this.bound.wheel, { passive: false })
    canvas.addEventListener('click', this.bound.click)
    canvas.addEventListener('keydown', this.bound.key)
    canvas.tabIndex = canvas.tabIndex >= 0 ? canvas.tabIndex : 0
    this.resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.resize()) : null
    this.resizeObserver?.observe(canvas)
    this.intersectionObserver = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
      const visible = entries.some(entry => entry.isIntersecting)
      if (visible === this.onScreen) return
      this.onScreen = visible
      if (visible) { this.lastFrame = 0; this.invalidate() }
      else this.pause()
    }, { rootMargin: '80px' }) : null
    this.intersectionObserver?.observe(canvas)
    document.addEventListener('visibilitychange', this.bound.visibility)
    this.resize()
  }

  // Precompute spherical route geometry once, rather than trig/interpolation every frame.
  buildArcGeometries(arcs) {
    return arcs.filter(arc => arc?.from && arc?.to).map(arc => {
      const interpolation = geoInterpolate([arc.from.lon, arc.from.lat], [arc.to.lon, arc.to.lat])
      const samples = Array.from({ length: 97 }, (_, i) => {
        const t = i / 96
        const [lon, lat] = interpolation(t)
        const latitude = lat * DEG
        const lift = .22 * Math.sin(Math.PI * t)
        return { lon, sinLat: Math.sin(latitude), cosLat: Math.cos(latitude),
          lift, scale: 1 + lift }
      })
      return { arc, samples }
    })
  }
  detectQuality() {
    const cores = Number(navigator.hardwareConcurrency || 4)
    const memory = Number(navigator.deviceMemory ?? 8)
    if (cores <= 2 || memory <= 2) return 0
    if (cores <= 4 || memory <= 4 || noMotion()) return 1
    return 2
  }
  get frameInterval() { return this.quality === 0 && this.ultraLow ? 83 : [50, 42, 33][this.quality] }
  invalidate() { this.needsPaint = true; this.schedule() }
  pause() {
    if (this.frameId) cancelAnimationFrame(this.frameId)
    this.frameId = 0
    this.lastFrame = 0
  }
  schedule() {
    if (!this.running || !this.pageVisible || !this.onScreen || this.frameId) return
    this.frameId = requestAnimationFrame(now => { this.frameId = 0; this.tick(now) })
  }
  setMarkers(markers = []) { this.markers = [...markers]; this.invalidate(); return this }
  setArcs(arcs = []) {
    this.arcs = [...arcs]
    this.arcGeometries = this.buildArcGeometries(this.arcs)
    this.invalidate()
    return this
  }
  setOptions(patch = {}) {
    Object.assign(this.options, patch)
    if (patch.markers) this.markers = [...patch.markers]
    if (patch.arcs) { this.arcs = [...patch.arcs]; this.arcGeometries = this.buildArcGeometries(this.arcs) }
    this.invalidate()
    return this
  }
  setTheme(theme) { this.options.theme = theme; this.invalidate(); return this }
  setZoom(zoom) {
    this.zoom = clamp(Number(zoom) || 1, 0.8, Math.min(20, this.options.maxZoom || 20))
    this.invalidate()
    return this
  }
  flyTo(lon, lat, opts = {}) {
    const to = { lon: wrap(Number(lon)), lat: clamp(Number(lat), -85, 85) }
    if (opts.instant || noMotion()) { this.lon = to.lon; this.lat = to.lat; this.target = null }
    else this.target = { ...to, started: performance.now(), fromLon: this.lon,
      fromLat: this.lat, deltaLon: wrap(to.lon - this.lon) }
    if (opts.zoom != null) this.setZoom(opts.zoom)
    this.invalidate()
    return this
  }
  project(lon, lat) {
    if (!this.width || !this.height) return null
    this.updateProjection()
    const visible = this.visible(Number(lon), Number(lat))
    const p = this.projector([Number(lon), Number(lat)])
    return p && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? { x: p[0], y: p[1], visible } : null
  }
  visible(lon, lat) {
    const la = lat * DEG, ca = this.lat * DEG, d = (lon - this.lon) * DEG
    return Math.sin(la) * Math.sin(ca) + Math.cos(la) * Math.cos(ca) * Math.cos(d) >= 0
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect.width || this.canvas.clientWidth || 400))
    const height = Math.max(1, Math.round(rect.height || this.canvas.clientHeight || 400))
    const ratio = Math.min([1, 1.5, 2][this.quality], Math.max(1, window.devicePixelRatio || 1))
    if (this.width !== width || this.height !== height || this.pixelRatio !== ratio) {
      this.width = width; this.height = height; this.pixelRatio = ratio
      this.canvas.width = Math.round(width * ratio)
      this.canvas.height = Math.round(height * ratio)
    }
    this.invalidate()
    return this
  }
  updateProjection() {
    this.radius = Math.min(this.width, this.height) * 0.44 * this.zoom
    this.projector.translate([this.width / 2, this.height / 2])
      .scale(this.radius).rotate([-this.lon, -this.lat, 0])
  }
  palette() {
    const t = this.options.theme || {}
    const ocean = Array.isArray(t.ocean) ? t.ocean : ['#0c0d19', '#070813']
    return { seaTop: ocean[0], seaBottom: ocean[1], land: color(t.land, '#b50928'),
      border: color(t.border, '#e05460'), grid: color(t.graticule, 'rgba(190,195,220,.22)'),
      arc: color(t.arc, '#b50928'), label: color(t.label, '#fafafa'),
      labelStroke: color(t.labelStroke, 'rgba(0,0,0,.8)'),
      stars: color(t.stars, 'rgba(222,232,255,.6)') }
  }
  paint() {
    if (!this.running || !this.width || !this.height) return
    const { ctx, width: w, height: h } = this
    const p = this.palette()
    this.updateProjection()
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0)
    ctx.clearRect(0, 0, w, h)
    if (!this.options.transparentBackground) {
      ctx.fillStyle = p.seaBottom; ctx.fillRect(0, 0, w, h)
    }
    if (this.options.stars) this.drawStars(p.stars)
    const cx = w / 2, cy = h / 2, r = this.radius
    ctx.save()
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
    const ocean = ctx.createRadialGradient(cx - r * .32, cy - r * .4, r * .05, cx, cy, r * 1.12)
    ocean.addColorStop(0, p.seaTop); ocean.addColorStop(1, p.seaBottom)
    ctx.fillStyle = ocean; ctx.fill()
    ctx.clip()
    const draw = this.path
    if (this.options.graticule && this.options.theme?.showGraticule !== false) {
      ctx.beginPath(); draw(this.graticule)
      ctx.strokeStyle = p.grid; ctx.lineWidth = .8; ctx.stroke()
    }
    ctx.beginPath(); draw(countries)
    ctx.fillStyle = p.land; ctx.fill()
    ctx.strokeStyle = p.border; ctx.lineWidth = .65; ctx.stroke()
    if (this.options.shade) {
      const shade = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
      const strength = clamp(Number(this.options.theme?.shadeStrength ?? .5), .05, .85)
      shade.addColorStop(0, 'rgba(255,255,255,.10)')
      shade.addColorStop(.45, 'rgba(0,0,0,0)')
      shade.addColorStop(1, `rgba(0,0,0,${strength})`)
      ctx.fillStyle = shade; ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    }
    ctx.restore()
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(192,203,226,.5)'; ctx.lineWidth = 1; ctx.stroke()
    this.drawArcs(p)
    this.drawMarkers(p)
  }
  drawStars(starColor) {
    const { ctx, width: w, height: h } = this
    ctx.fillStyle = starColor
    for (let i = 0; i < 32; i++) {
      const x = (Math.sin(i * 79.7 + 20) * 15231.3 % 1 + 1) % 1 * w
      const y = (Math.sin(i * 35.1 + 12) * 43173.1 % 1 + 1) % 1 * h
      const d = Math.hypot(x - w / 2, y - h / 2)
      if (d < this.radius * 1.1) continue
      ctx.beginPath(); ctx.arc(x, y, i % 4 === 0 ? 1.15 : .7, 0, Math.PI * 2); ctx.fill()
    }
  }
  // Routes follow great-circle trajectories, then rise above the sphere.
  // The orthographic depth test hides sections occluded by the globe.
  drawArcs(palette) {
    const now = performance.now()
    const { ctx, radius, width, height } = this
    const cameraLat = this.lat * DEG
    const sinCamera = Math.sin(cameraLat)
    const cosCamera = Math.cos(cameraLat)
    const stride = this.quality === 0 ? 2 : 1
    const centeredLon = this.lon
    const reducedMotion = noMotion()
    for (const { arc, samples: baseSamples } of this.arcGeometries) {
      const samples = []
      for (let i = 0; i < baseSamples.length; i += stride) {
        const point = baseSamples[i]
        const relativeLon = wrap(point.lon - centeredLon) * DEG
        const sinLon = Math.sin(relativeLon), cosLon = Math.cos(relativeLon)
        const dot = sinCamera * point.sinLat + cosCamera * point.cosLat * cosLon
        const x = width / 2 + radius * point.scale * point.cosLat * sinLon
        const y = height / 2 - radius * point.scale * (cosCamera * point.sinLat - sinCamera * point.cosLat * cosLon) - radius * point.lift * .38
        const outside = Math.hypot(x - width / 2, y - height / 2) > radius + .5
        samples.push({ x, y, visible: dot >= 0 || outside })
      }
      const stroke = (points, strokeColor, lineWidth, opacity = 1, glow = 0) => {
        ctx.save()
        ctx.beginPath()
        let drawing = false
        for (const point of points) {
          if (!point.visible) { drawing = false; continue }
          if (drawing) ctx.lineTo(point.x, point.y)
          else ctx.moveTo(point.x, point.y)
          drawing = true
        }
        ctx.strokeStyle = strokeColor
        ctx.lineWidth = lineWidth
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.globalAlpha = opacity
        if (glow) { ctx.shadowColor = strokeColor; ctx.shadowBlur = glow }
        ctx.stroke()
        ctx.restore()
      }
      const primary = color(arc.color, palette.arc)
      const lineWidth = Math.max(.6, Number(arc.width || 1.5))
      if (this.quality > 0) stroke(samples, primary, lineWidth + 2.6, .17, this.quality === 2 ? 3 : 0)
      stroke(samples, primary, lineWidth + .35, .94)
      if (this.quality === 2) stroke(samples, 'rgba(255,235,230,.65)', Math.max(.35, lineWidth * .33), .78)
      if (arc.animate === false || reducedMotion) continue
      const duration = Math.max(100, Number(arc.duration || 4000))
      const phase = (now % duration) / duration
      const end = Math.max(1, Math.floor(phase * (samples.length - 1)))
      const begin = Math.max(0, end - Math.max(6, Math.round(12 / stride)))
      stroke(samples.slice(begin, end + 1), color(arc.headColor, '#ffad78'), lineWidth + 1, 1, this.quality === 2 ? 6 : 0)
    }
  }
  drawMarkers(palette) {
    const { ctx } = this
    const drawnLabels = []
    this.markerHits = []
    for (const marker of this.markers) {
      if (!this.visible(marker.lon, marker.lat)) continue
      const point = this.projector([marker.lon, marker.lat])
      const depth = clamp((1 + Math.sin(this.lat * DEG) * Math.sin(marker.lat * DEG) +
        Math.cos(this.lat * DEG) * Math.cos(marker.lat * DEG) *
        Math.cos((marker.lon - this.lon) * DEG)) / 2, .3, 1)
      const scale = 1
      let radius = 8
      if (typeof this.options.renderMarker === 'function') {
        ctx.save()
        radius = Number(this.options.renderMarker(ctx, marker, { x: point[0], y: point[1], depth, scale, globe: this })) || 12
        ctx.restore()
      } else {
        ctx.beginPath(); ctx.arc(point[0], point[1], (marker.size || 4) * depth, 0, Math.PI * 2)
        ctx.fillStyle = color(marker.color, palette.arc); ctx.fill()
      }
      this.markerHits.push({ marker, x: point[0], y: point[1], radius: Math.max(15, radius) })
      if (this.options.labels !== false && marker.label) {
        const label = String(marker.label)
        ctx.font = '600 11px system-ui, sans-serif'
        const textWidth = ctx.measureText(label).width
        const x = point[0] + 12, y = point[1] - 7
        const collides = drawnLabels.some(rect => x < rect.x + rect.w && x + textWidth > rect.x &&
          y - 12 < rect.y + 4 && y + 4 > rect.y - 12)
        if (!collides) {
          ctx.save()
          ctx.font = '600 11px system-ui, sans-serif'
          ctx.textBaseline = 'middle'
          ctx.lineJoin = 'round'
          ctx.strokeStyle = palette.labelStroke
          ctx.lineWidth = 3.4
          ctx.strokeText(label, x, y)
          ctx.fillStyle = palette.label
          ctx.fillText(label, x, y)
          ctx.restore()
          drawnLabels.push({ x, y, w: textWidth })
        }
      }
    }
  }
  tick(now) {
    if (!this.running || !this.pageVisible || !this.onScreen) return
    const dt = this.lastFrame ? Math.min(100, now - this.lastFrame) : 33
    this.lastFrame = now
    let rotating = false
    const reducedMotion = noMotion()
    if (this.target) {
      const progress = clamp((now - this.target.started) / 650, 0, 1)
      const t = 1 - Math.pow(1 - progress, 3)
      this.lon = wrap(this.target.fromLon + this.target.deltaLon * t)
      this.lat = lerp(this.target.fromLat, this.target.lat, t)
      if (progress >= 1) this.target = null
      rotating = true
    } else if (!this.drag && this.options.autoRotate && !reducedMotion) {
      this.lon = wrap(this.lon + (this.options.rotateSpeed ?? .09) * dt / 33)
      rotating = true
    }
    const animatingArcs = !reducedMotion && this.arcs.some(arc => arc.animate !== false)
    if ((this.needsPaint || rotating || animatingArcs) && now - this.lastPaint >= this.frameInterval) {
      const started = performance.now()
      this.paint()
      const cost = performance.now() - started
      // Carry the frame deadline forward to maintain smooth average pacing at 60 Hz.
      this.lastPaint = this.lastPaint === -Infinity || now - this.lastPaint > 250
        ? now : this.lastPaint + this.frameInterval
      this.needsPaint = false
      // React to consistently slow frames, not a single one-off browser hiccup.
      const slow = cost > this.frameInterval * .72
      this.slowFrames = slow ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1)
      this.fastFrames = cost < this.frameInterval * .32 ? this.fastFrames + 1 : 0
      if (this.slowFrames >= 7) {
        if (this.quality > 0) {
          this.quality--
          this.resize()
        } else {
          this.ultraLow = true // Very slow devices: lower CPU pressure to ~12 FPS.
        }
        this.slowFrames = 0
        this.fastFrames = 0
      } else if (this.fastFrames >= 180) {
        if (this.ultraLow) this.ultraLow = false
        else if (this.quality < this.qualityCeiling) { this.quality++; this.resize() }
        this.slowFrames = 0
        this.fastFrames = 0
      }
    }
    if (this.needsPaint || rotating || this.target || animatingArcs) this.schedule()
  }
  canvasPoint(event) {
    const rect = this.canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  pointerDown(event) {
    if (!this.options.interactive) return
    this.target = null
    const p = this.canvasPoint(event)
    this.activePointers.set(event.pointerId, p)
    this.canvas.setPointerCapture?.(event.pointerId)
    if (this.activePointers.size === 2) {
      const [a, b] = [...this.activePointers.values()]
      this.pinch = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: this.zoom }
      this.drag = null
      this.ignoreClick = true
    } else if (this.activePointers.size === 1) {
      this.drag = { x: p.x, y: p.y, lon: this.lon, lat: this.lat, moved: false, pointer: event.pointerId }
    }
  }
  pointerMove(event) {
    if (!this.activePointers.has(event.pointerId)) return
    const p = this.canvasPoint(event)
    this.activePointers.set(event.pointerId, p)
    if (this.pinch && this.activePointers.size >= 2) {
      const [a, b] = [...this.activePointers.values()]
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
      if (this.options.zoomable) this.setZoom(this.pinch.zoom * distance / this.pinch.distance)
      return
    }
    if (!this.drag || event.pointerId !== this.drag.pointer) return
    const dx = p.x - this.drag.x, dy = p.y - this.drag.y
    if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true
    const factor = 90 / Math.max(120, this.radius)
    this.lon = wrap(this.drag.lon - dx * factor)
    this.lat = clamp(this.drag.lat + dy * factor, -85, 85)
    this.invalidate()
  }
  pointerUp(event) {
    if (!this.activePointers.has(event.pointerId)) return
    this.activePointers.delete(event.pointerId)
    if (this.pinch) this.ignoreClick = true
    else if (this.drag?.pointer === event.pointerId) this.ignoreClick = this.drag.moved
    this.pinch = null
    this.drag = null
  }
  onWheel(event) {
    if (!this.options.interactive || !this.options.zoomable) return
    event.preventDefault()
    this.setZoom(this.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12))
  }
  onClick(event) {
    if (this.ignoreClick) { this.ignoreClick = false; return }
    const { x, y } = this.canvasPoint(event)
    const hit = [...this.markerHits].reverse().find(item => Math.hypot(item.x - x, item.y - y) <= item.radius)
    if (hit) this.options.onClick?.(hit.marker, { x: hit.x, y: hit.y })
  }
  onKey(event) {
    if (!this.options.interactive) return
    let used = true
    if (event.key === 'ArrowLeft') this.lon = wrap(this.lon - 8)
    else if (event.key === 'ArrowRight') this.lon = wrap(this.lon + 8)
    else if (event.key === 'ArrowUp') this.lat = clamp(this.lat + 8, -85, 85)
    else if (event.key === 'ArrowDown') this.lat = clamp(this.lat - 8, -85, 85)
    else if (event.key === '+') this.setZoom(this.zoom * 1.2)
    else if (event.key === '-') this.setZoom(this.zoom / 1.2)
    else used = false
    if (used) { event.preventDefault(); this.target = null; this.invalidate() }
  }
  destroy() {
    this.running = false
    this.pause()
    this.resizeObserver?.disconnect()
    this.intersectionObserver?.disconnect()
    document.removeEventListener('visibilitychange', this.bound.visibility)
    this.canvas.removeEventListener('pointerdown', this.bound.down)
    this.canvas.removeEventListener('pointermove', this.bound.move)
    this.canvas.removeEventListener('pointerup', this.bound.up)
    this.canvas.removeEventListener('pointercancel', this.bound.up)
    this.canvas.removeEventListener('wheel', this.bound.wheel)
    this.canvas.removeEventListener('click', this.bound.click)
    this.canvas.removeEventListener('keydown', this.bound.key)
    this.markerHits = []
  }
}

export const createGlobe = (canvas, options) => new CastroGlobe(canvas, options)
