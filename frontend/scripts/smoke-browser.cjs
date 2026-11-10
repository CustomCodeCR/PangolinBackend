// Smoke test: Chrome headless loads async frontend routes after Vite production build.
// The UI gets a local fake /api/auth/me response; the separate Docker smoke verifies the real backend.
'use strict'
const assert = require('node:assert/strict')
const http = require('node:http')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const root = path.resolve(__dirname, '..')
const host = '127.0.0.1'
const previewPort = 4178
const apiPort = 5000
let activeRole = null
let sessionCalls = 0
function findChrome() {
  const options = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)
  for (const name of options) {
    const r = spawnSync('which', [name], { encoding: 'utf8' })
    if (r.status === 0) return r.stdout.trim()
  }
  throw Error('Se requiere Chrome/Chromium en el runner para validar rutas en navegador.')
}
function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, resolve)
  })
}
function closeServer(server) {
  return new Promise(resolve => server.close(resolve))
}
const api = http.createServer((req, res) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(body))
  }
  if (pathname === '/api/auth/me') {
    sessionCalls++
    return activeRole
      ? send(200, { correo: 'test@castrofallas.invalid', nombre: 'Browser Smoke', role: activeRole })
      : send(401, { error: 'No autenticado' })
  }
  if (pathname === '/api/content/news') return send(200, [])
  if (pathname === '/api/content/site') return send(200, {})
  if (pathname.startsWith('/api/admin/')) return send(200, [])
  send(404, { error: 'Endpoint no simulado' })
})
async function waitReady(url, limitMs = 12000) {
  const start = Date.now()
  while (Date.now() - start < limitMs) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1000) })
      if (r.ok) return
    } catch { /* server still starting */ }
    await new Promise(resolve => setTimeout(resolve, 180))
  }
  throw Error('Vite preview no inicia en ' + url)
}
function dumpDom(chrome, url, label) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-pr38-chrome-'))
  const args = [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--disable-dev-shm-usage', '--no-first-run',
    '--no-default-browser-check', '--disable-background-networking',
    '--disable-extensions', '--hide-scrollbars',
    '--virtual-time-budget=8000',
    '--user-data-dir=' + profile, '--dump-dom', url
  ]
  return new Promise((resolve, reject) => {
    const child = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timeout = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, 35000)
    child.stdout.on('data', data => { stdout += data.toString() })
    child.stderr.on('data', data => { if (stderr.length < 12000) stderr += data.toString() })
    child.on('error', error => {
      clearTimeout(timeout)
      fs.rmSync(profile, { recursive: true, force: true })
      reject(error)
    })
    child.on('close', code => {
      clearTimeout(timeout)
      fs.rmSync(profile, { recursive: true, force: true })
      if (code !== 0 || timedOut) return reject(Error(label + ': Chrome falló (exit ' + code + '): ' + stderr.slice(-1800)))
      resolve(stdout)
    })
  })
}

// Comprueba el color CALCULADO por Chrome, no la presencia de CSS en el código.
async function assertServicesTheme(chrome, url) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-services-theme-'))
  const browser = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check',
    '--remote-allow-origins=*', '--remote-debugging-port=0',
    '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  browser.stderr.on('data', chunk => { if (stderr.length < 2000) stderr += String(chunk) })
  let ws
  try {
    let port = 0
    for (let i = 0; i < 100; i++) {
      try {
        port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0])
        if (port > 0) break
      } catch { /* Chrome aún está iniciando */ }
      await new Promise(resolve => setTimeout(resolve, 120))
    }
    assert.ok(port > 0, 'Chrome DevTools no inició: ' + stderr.slice(-400))
    const target = await (await fetch('http://127.0.0.1:' + port + '/json/new?' + encodeURIComponent(url), { method: 'PUT' })).json()
    assert.ok(target.webSocketDebuggerUrl, 'No hay WebSocket de DevTools')
    ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', reject, { once: true })
    })
    const pending = new Map()
    let nextId = 0
    ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data))
      if (!message.id || !pending.has(message.id)) return
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      message.error ? reject(Error(message.error.message)) : resolve(message.result)
    })
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
    const evaluate = async expression => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true })
      if (r.exceptionDetails) throw Error('Falló inspección Chrome: ' + r.exceptionDetails.text)
      return r.result.value
    }
    await send('Runtime.enable')
    await send('Page.enable')
    const nav = await send('Page.navigate', { url })
    assert.ok(!nav.errorText, 'Chrome no pudo abrir Servicios: ' + nav.errorText)
    let ready = false
    for (let i = 0; i < 100; i++) {
      ready = await evaluate("document.querySelectorAll('.services-directory__card').length === 10")
      if (ready) break
      await new Promise(resolve => setTimeout(resolve, 120))
    }
    assert.ok(ready, 'No aparecieron las 10 tarjetas del directorio')
    const probe = async dark => {
      const action = dark ? 'add' : 'remove'
      return evaluate("(() => { document.documentElement.classList." + action + "('theme-dark'); const a = document.querySelector('.services-directory__card'); const card = getComputedStyle(a); const title = getComputedStyle(a.querySelector('.services-directory__card-title')); return { background: card.backgroundColor, image: card.backgroundImage, text: title.color, fill: title.webkitTextFillColor }; })()")
    }
    const light = await probe(false)
    assert.equal(light.background, 'rgb(255, 255, 255)', 'Tema claro: tarjeta no blanca')
    const dark = await probe(true)
    if (dark.background !== 'rgb(16, 27, 48)') {
      const details = await evaluate("(() => { const a = document.querySelector('.services-directory__card'); const css = []; for (const sheet of document.styleSheets) { try { for (const rule of sheet.cssRules) { if (rule.selectorText?.includes('services-directory__card')) css.push({ selector: rule.selectorText.slice(0, 140), background: rule.style.background, important: rule.style.getPropertyPriority('background') }); } } catch {} } return { root: document.documentElement.className, app: a?.closest('.app-site')?.className, matching: a?.matches('html.theme-dark .app-site.services-page .services-directory a.services-directory__card'), sheets: document.styleSheets.length, rules: css.slice(-18) }; })()")
      console.log('Diagnóstico contraste Servicios:', JSON.stringify({ dark, details }))
    }
    assert.equal(dark.background, 'rgb(16, 27, 48)', 'Tema oscuro: tarjeta blanquecina')
    assert.equal(dark.image, 'none', 'Tema oscuro: gradiente claro superpuesto')
    assert.equal(dark.text, 'rgb(244, 246, 250)', 'Tema oscuro: título invisible')
    assert.equal(dark.fill, 'rgb(244, 246, 250)', 'Tema oscuro: text-fill-color invisible')
    console.log('PASS Chrome: 10 tarjetas con contraste real claro/oscuro')
  } finally {
    try { ws?.close() } catch {}
    browser.kill('SIGKILL')
    fs.rmSync(profile, { recursive: true, force: true })
  }
}

async function main() {
  const chrome = findChrome()
  let preview
  try {
    await listen(api, apiPort)
    preview = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', host, '--port', String(previewPort), '--strictPort'], {
      cwd: root, stdio: ['ignore', 'pipe', 'pipe']
    })
    let serverError = ''
    preview.stderr.on('data', data => { serverError += data.toString() })
    await waitReady('http://' + host + ':' + previewPort + '/')
    const scenarios = [
      { url: '/', role: null, must: ['class="app-site home-page"', 'home-hero__content'] },
      { url: '/servicios', role: null, must: ['services-page', 'services-page__transport'] },
      { url: '/servicios/almacenamiento-fiscal', role: null, must: ['service-landing-page', 'Almacenamiento fiscal de mercancías en Costa Rica'] },
      { url: '/servicios/transporte-maritimo', role: null, must: ['service-landing-page', 'service-landing-hero__inner', 'service-landing-story__frame', 'service-landing-feature-grid', 'service-landing-faq__item'] },
      { url: '/servicios/transporte-panama-costa-rica', role: null, must: ['service-landing-page', 'service-landing-hero__inner', 'service-landing-story__frame', 'service-landing-feature-grid', 'service-landing-faq__item'] },
      { url: '/servicios/bodegaje-general', role: null, must: ['service-landing-page', 'Bodegaje general y almacenamiento'] },
      { url: '/servicios/agenciamiento-aduanal', role: null, must: ['service-landing-page', 'Agenciamiento aduanal para importaciones'] },
      { url: '/servicios/consolidadora-de-carga', role: null, must: ['service-landing-page', 'Consolidadora de carga y transporte'] },
      { url: '/nosotros', role: null, must: ['about-reference-page', 'about-refresh__intro-grid', 'about-refresh__purpose-card', 'about-refresh__value-trigger', 'about-refresh__capabilities', 'about-refresh__gallery'] },
      { url: '/noticias', role: null, must: ['news-page', 'news-editorial-hero'] },
      { url: '/bienvenidos', role: null, must: ['login-screen', 'login-auth-form'] },
      { url: '/cotizaciones', role: null, must: ['quote-access-status--blocked'] },
      { url: '/cotizaciones', role: 'cliente', must: ['quote-flow-page', 'quote-landing-grid', 'quote-quick-form'] },
      { url: '/administracion', role: 'administrador', must: ['administration-page', 'content-manager', 'manager-heading'] },
      { url: '/administracion', role: null, must: ['login-screen', 'login-auth-form'] }
    ]
    for (const scenario of scenarios) {
      activeRole = scenario.role
      const before = sessionCalls
      const html = await dumpDom(chrome, 'http://' + host + ':' + previewPort + scenario.url, scenario.url + ' [' + (activeRole || 'invitado') + ']')
      for (const marker of scenario.must) {
        assert.ok(html.includes(marker), 'No se encontró "' + marker + '" en ' + scenario.url + ' (' + (activeRole || 'invitado') + '); DOM: ' + html.slice(-800))
      }
      if (scenario.url === '/nosotros') {
        assert.equal((html.match(/class="about-refresh__value-trigger"/g) || []).length, 5, 'Debe haber cinco valores accesibles y desplegables')
        assert.ok(!html.includes('about-refresh__value-summary'), 'Los valores cerrados deben mostrar únicamente su título, sin resumen')
        assert.ok(!html.includes('class="about-refresh__value-panel is-open"'), 'Las tarjetas deben iniciar cerradas sin panel abierto')
        assert.equal((html.match(/about-refresh__value-panel/g) || []).length >= 5, true, 'Los cinco valores deben disponer de panel desplegable')
        assert.equal((html.match(/aria-expanded="false"/g) || []).length >= 5, true, 'Los valores deben iniciar contraídos')
        assert.equal((html.match(/class="about-refresh__purpose-card"/g) || []).length, 2, 'Deben mostrarse misión y visión')
        assert.ok(!html.includes('about-refresh__hero-subtitle'), 'No debe renderizarse el texto bajo +48 años')
        assert.ok(html.includes('href="/servicios" class="about-refresh__button about-refresh__button--primary"'), 'Conocer servicios debe ser enlace navegable a /servicios')
        assert.ok(html.includes('href="/cotizaciones" class="about-refresh__button about-refresh__button--secondary"'), 'Solicitar cotización debe ser enlace navegable a /cotizaciones')
        assert.ok(!html.includes('<routerlink'), 'Los botones no deben usar RouterLink en la SPA sin router registrado')
        assert.ok(!html.includes('Soluciones integrales para que su carga se mueva sin límites.'), 'La sección de capacidades no debe mostrar el texto lateral eliminado')
        assert.ok(!html.includes('Desde el transporte de carga hasta la coordinación de importaciones y exportaciones,'), 'El cierre de capacidades no debe mostrar el párrafo eliminado')
        for (const value of ['Compromiso', 'Ética', 'Trabajo en equipo', 'Experiencia', 'Calidad']) {
          assert.ok(html.includes(value), 'Falta el valor corporativo: ' + value)
        }
        const valuesStart = html.indexOf('id="nuestros-valores"')
        const galleryStart = html.indexOf('class="about-refresh__gallery"')
        const capabilitiesStart = html.indexOf('class="about-refresh__services section-spacing"')
        assert.ok(valuesStart >= 0 && galleryStart > valuesStart && galleryStart < capabilitiesStart, 'Las tres imágenes deben quedar debajo de Valores y antes de Capacidades')
        assert.ok(!html.includes('Pasá el cursor para ver cada valor o tocá la tarjeta en el celular'), 'No debe aparecer la indicación de hover o toque')
        for (const image of ['/images/services-warehouse.webp', '/images/truck.webp', '/images/warehouse-person.webp']) {
          assert.ok(html.includes(image), 'Falta la imagen de capacidades: ' + image)
        }
      }
      if (scenario.url === '/servicios' || scenario.url.startsWith('/servicios/')) {
        assert.ok(html.includes('class="nav-dropdown nav-dropdown--services"') || html.includes('nav-dropdown--services'), 'No está el desplegable de Servicios en el encabezado: ' + scenario.url)
        for (const slug of ['almacenamiento-fiscal', 'bodegaje-general', 'agenciamiento-aduanal', 'consolidadora-de-carga']) {
          assert.ok(html.includes('href="/servicios/' + slug + '"'), 'No aparece el enlace de ' + slug + ' en el menú de Servicios')
        }
        for (const slug of ['transporte-maritimo', 'transporte-terrestre', 'transporte-aereo', 'transporte-internacional', 'transporte-local', 'transporte-panama-costa-rica']) {
          assert.ok(html.includes('href="/servicios/' + slug + '"'), 'Falta el transporte en el submenú: ' + slug)
        }
        assert.ok(html.includes('services-megamenu__rail') && html.includes('services-megamenu__detail') && html.includes('services-megamenu__group-trigger'), 'Falta el megamenú de dos columnas debajo del nav')
        assert.ok(html.includes('aria-current="page"'), 'La ruta actual debe quedar resaltada en Servicios: ' + scenario.url)
        assert.ok(!html.includes('services-page__guides'), 'La página debe conservar su diseño anterior, sin tarjetas nuevas')
        assert.ok(!html.includes('service-landing-related'), 'Enlaces cruzados de servicios fuera del nav')
      }
      assert.ok(sessionCalls > before, 'No se comprobó la sesión para ' + scenario.url)
      console.log('PASS navegador: ' + scenario.url + ' [' + (activeRole || 'invitado') + ']')
    }
    await assertServicesTheme(chrome, 'http://' + host + ':' + previewPort + '/servicios')
    if (serverError.includes('Error')) console.log('Vite stderr: ' + serverError.slice(-500))
    console.log('OK: páginas públicas, login, control de acceso, cotizaciones y administración renderizadas en Chrome.')
  } finally {
    if (preview && preview.exitCode === null) preview.kill('SIGTERM')
    await closeServer(api)
  }
}
main().catch(error => { console.error('FAIL browser smoke:', error.message); process.exitCode = 1 })
