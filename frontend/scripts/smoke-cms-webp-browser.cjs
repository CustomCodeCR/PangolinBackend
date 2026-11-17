// Isolated Chrome regression for the real compiled Vue News UI.
// Run only in CI. Serves fictitious CMS JSON and existing repository images;
// never accesses production, a real admin session, PostgreSQL or MinIO.
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const { spawn, spawnSync } = require('node:child_process')

assert.equal(process.env.CI, 'true', 'Use only an isolated CI runner')
const mode = process.env.CMS_WEBP_BROWSER_FLAG
assert.ok(mode === 'true' || mode === 'false', 'Explicit build flag required')
const enabled = mode === 'true'
const dist = path.resolve(__dirname, '..', 'dist')
assert.ok(fs.existsSync(path.join(dist, 'index.html')), 'Build Vue before the browser test')
const jpeg = fs.readFileSync(path.resolve(__dirname, '..', 'public/images/cover-logistics.jpeg'))
const webp = fs.readFileSync(path.resolve(__dirname, '..', 'public/images/cover-logistics.webp'))
const cmsUrl = '/api/content/media/01234567-89ab-cdef-0123-456789abcdef/file'
const news = [{
  id: '11111111-2222-4333-8444-555555555555',
  title: 'Imagen CMS ficticia para prueba de navegador',
  category: 'LOGISTICA', description: 'Prueba segura y aislada.',
  body: 'Contenido ficticio del CMS.', author: 'Equipo de pruebas',
  image: cmsUrl, published: true, expiresAt: null,
  publishedAt: '2026-11-17T12:00:00Z'
}]
let derivativeErrorStatus = 0
let requestedMedia = []
const probe = String.raw`<script>
(() => {
  let tries = 0;
  const poll = setInterval(() => {
    const img = document.querySelector('.news-editorial-hero__slide img');
    if (img && img.complete && img.naturalWidth > 0) {
      const marker = document.createElement('output');
      marker.id = 'cms-webp-browser-probe';
      marker.textContent = JSON.stringify({
        src: img.getAttribute('src'),
        srcset: img.getAttribute('srcset'),
        sizes: img.getAttribute('sizes'),
        currentSrc: img.currentSrc,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        viewport: window.innerWidth
      });
      document.body.appendChild(marker);
      clearInterval(poll);
    }
    if (++tries > 100) clearInterval(poll);
  }, 60);
})();
</script>`
const types = {
  '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon'
}
const server = http.createServer((req, res) => {
  const u = new URL(req.url || '/', 'http://127.0.0.1')
  const send = (status, body, mime) => {
    res.writeHead(status, {
      'Content-Type': mime, 'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store'
    })
    res.end(body)
  }
  if (u.pathname === '/api/auth/me')
    return send(401, JSON.stringify({ error: 'Sin sesión' }), 'application/json')
  if (u.pathname === '/api/content/news')
    return send(200, JSON.stringify(news), 'application/json')
  if (u.pathname === '/api/content/site')
    return send(200, '[]', 'application/json')
  if (u.pathname === cmsUrl) {
    const width = u.searchParams.get('width')
    requestedMedia.push(width || 'original')
    if (width && derivativeErrorStatus)
      return send(derivativeErrorStatus, 'Unavailable derivative', 'text/plain')
    return send(200, width ? webp : jpeg, width ? 'image/webp' : 'image/jpeg')
  }
  if (u.pathname.startsWith('/api/'))
    return send(404, '{}', 'application/json')
  let pathname
  try { pathname = decodeURIComponent(u.pathname) }
  catch { return send(400, 'Invalid path', 'text/plain') }
  let target = path.resolve(dist, '.' + pathname)
  const rel = path.relative(dist, target)
  if (rel.startsWith('..') || path.isAbsolute(rel))
    return send(403, 'Forbidden', 'text/plain')
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory())
    target = path.join(dist, 'index.html')
  const ext = path.extname(target)
  let bytes = fs.readFileSync(target)
  if (ext === '.html') {
    const theme = u.searchParams.get('cmsTheme') === 'dark' ? 'dark' : 'light'
    const themeSetup = '<script>localStorage.setItem("castrofallas-theme",' +
      JSON.stringify(theme) + ');</script>'
    bytes = Buffer.from(bytes.toString('utf8')
      .replace('</head>', themeSetup + '</head>')
      .replace('</body>', probe + '</body>'))
  }
  send(200, bytes, types[ext] || 'text/html; charset=utf-8')
})
function chromePath() {
  for (const bin of [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)) {
    if (path.isAbsolute(bin) && fs.existsSync(bin)) return bin
    const r = spawnSync('which', [bin], { encoding: 'utf8' })
    if (r.status === 0) return r.stdout.trim()
  }
  throw Error('Chrome/Chromium is required for the responsive CMS smoke')
}
async function inspect(url, width) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-webp-browser-'))
  const argv = [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-background-networking', '--disable-extensions', '--no-first-run',
    '--virtual-time-budget=11000', '--window-size=' + width + ',900',
    '--user-data-dir=' + profile, '--dump-dom', url
  ]
  try {
    const html = await new Promise((resolve, reject) => {
      const child = spawn(chromePath(), argv, { stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = '', stderr = ''
      const timer = setTimeout(() => child.kill('SIGKILL'), 40000)
      child.stdout.on('data', chunk => { stdout += chunk.toString() })
      child.stderr.on('data', chunk => { if (stderr.length < 2000) stderr += chunk.toString() })
      child.on('error', err => { clearTimeout(timer); reject(err) })
      child.on('close', code => {
        clearTimeout(timer)
        if (code === 0) resolve(stdout)
        else reject(Error('Chrome failed: ' + stderr.slice(-800)))
      })
    })
    const match = html.match(/<output id="cms-webp-browser-probe">([^<]+)<\/output>/)
    assert.ok(match, 'A real Chrome image did not finish rendering')
    return JSON.parse(match[1].replace(/&amp;/g, '&'))
  } finally {
    fs.rmSync(profile, { recursive: true, force: true })
  }
}
async function takeScreenshot(url, width, filename) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-webp-shot-'))
  const args = [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-background-networking', '--disable-extensions', '--no-first-run',
    '--hide-scrollbars', '--virtual-time-budget=11000',
    '--window-size=' + width + ',900', '--user-data-dir=' + profile,
    '--screenshot=' + filename, url
  ]
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(chromePath(), args, { stdio: ['ignore', 'ignore', 'pipe'] })
      let stderr = ''
      const timer = setTimeout(() => child.kill('SIGKILL'), 40000)
      child.stderr.on('data', data => { if (stderr.length < 2400) stderr += data.toString() })
      child.on('error', error => { clearTimeout(timer); reject(error) })
      child.on('close', code => {
        clearTimeout(timer)
        code === 0 ? resolve() : reject(Error('Chrome screenshot failed: ' + stderr.slice(-800)))
      })
    })
    assert.ok(fs.existsSync(filename) && fs.statSync(filename).size > 1500,
      'Chrome did not create a valid PNG screenshot')
  } finally {
    fs.rmSync(profile, { recursive: true, force: true })
  }
}
async function main() {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  try {
    for (const scenario of [
      { label: 'mobile', width: 390, errorStatus: 0 },
      { label: 'desktop', width: 1280, errorStatus: 0 },
      ...(enabled ? [
        { label: 'fallback-404', width: 390, errorStatus: 404 },
        // Matches a backend with CmsMedia:ResponsiveWebpEnabled=false.
        { label: 'backend-off-fallback-400', width: 390, errorStatus: 400 }
      ] : [])
    ]) {
      derivativeErrorStatus = scenario.errorStatus
      requestedMedia = []
      const origin = 'http://127.0.0.1:' + server.address().port
      const result = await inspect(origin + '/noticias', scenario.width)
      assert.equal(result.src, cmsUrl, 'Original CMS src must remain unchanged')
      assert.ok(result.naturalWidth > 0 && result.naturalHeight > 0,
        'CMS image must visibly render in Chrome')
      if (!enabled) {
        assert.ok(!result.srcset && !result.sizes, 'Disabled build must not request variants')
        assert.equal(new URL(result.currentSrc).pathname, cmsUrl)
        assert.ok(!new URL(result.currentSrc).search,
          'Disabled build must load the original only')
        assert.ok(requestedMedia.includes('original') && requestedMedia.every(x => x === 'original'))
      } else {
        assert.ok(requestedMedia.some(x => x !== 'original'),
          'Enabled Chrome must initially request a responsive image')
        if (scenario.errorStatus) {
          assert.ok(!new URL(result.currentSrc).search,
            'Broken variant must fall back to the original currentSrc')
          assert.ok(!result.srcset && !result.sizes,
            'The fallback must remove srcset and sizes after an image error')
          assert.ok(requestedMedia.includes('original'),
            'Chrome must request the unchanged original after error')
          assert.ok(requestedMedia.filter(x => x !== 'original').length <= 4,
            'Broken derivatives must not trigger an infinite reload loop')
        } else {
          assert.ok(result.srcset && [360, 720, 1080, 1600].every(
            width => result.srcset.includes('?width=' + width + ' ' + width + 'w')),
            'Enabled build must render all four responsive variants')
          assert.equal(result.sizes, '100vw')
          assert.match(new URL(result.currentSrc).search, /^\?width=(360|720|1080|1600)$/,
            'Chrome should select a supported WebP derivative')
        }
      }
      console.log('PASS CMS Chrome ' + mode + ': ' + scenario.label +
        ', currentSrc=' + new URL(result.currentSrc).search)
    }
    // Screenshot artifacts are for human visual review only, not a
    // claim of complete CMS QA. No real content or credentials are used.
    assert.ok(process.env.RUNNER_TEMP, 'Screenshots must use ephemeral CI storage')
    derivativeErrorStatus = 0
    const screenshots = path.join(process.env.RUNNER_TEMP, 'cms-webp-chrome-screenshots', mode)
    fs.mkdirSync(screenshots, { recursive: true })
    const origin = 'http://127.0.0.1:' + server.address().port
    for (const viewport of [{ label: 'mobile', width: 390 }, { label: 'desktop', width: 1280 }]) {
      for (const theme of ['light', 'dark']) {
        const filename = path.join(screenshots, mode + '-' + viewport.label + '-' + theme + '.png')
        await takeScreenshot(origin + '/noticias?cmsTheme=' + theme, viewport.width, filename)
        console.log('PASS screenshot ' + path.basename(filename))
      }
    }
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(err => { console.error('FAIL CMS Chrome:', err); process.exitCode = 1 })
