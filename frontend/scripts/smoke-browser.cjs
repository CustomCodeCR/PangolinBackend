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
const serviceGuides = require('../seo/service-landings.json')
const host = '127.0.0.1'
const previewPort = 4178
const apiPort = 5000
let activeRole = null
let sessionCalls = 0
let publishedSiteSlots = []
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
  if (pathname === '/api/content/site') return send(200, publishedSiteSlots)
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

    // Regression: adding Fiscal and Panama must not squeeze six home cards
    // into a single thin horizontal row on phones or tablets.
    const homeUrl = new URL('/', url).href
    for (const width of [320, 390, 768, 1024, 1280]) {
      await send('Emulation.setDeviceMetricsOverride', {
        width, height: 900, deviceScaleFactor: 1, mobile: false
      })
      const homeNavigation = await send('Page.navigate', { url: homeUrl })
      assert.ok(!homeNavigation.errorText, 'Chrome no pudo abrir Home: ' + homeNavigation.errorText)
      let loaded = false
      for (let attempt = 0; attempt < 100; attempt++) {
        loaded = await evaluate("document.querySelectorAll('#servicios .service-accordion__item').length === 6")
        if (loaded) break
        await new Promise(resolve => setTimeout(resolve, 120))
      }
      assert.ok(loaded, 'Faltan servicios del acordeón en Home a ' + width + 'px')
      const layout = await evaluate("(() => { const root=document.querySelector('#servicios .service-accordion'); const items=[...root.querySelectorAll('.service-accordion__item')]; const r=root.getBoundingClientRect(); const title=items[0].querySelector('.service-accordion__name'); return { direction:getComputedStyle(root).flexDirection, count:items.length, rootWidth:r.width, viewport:window.innerWidth, cardWidths:items.map(x=>Math.round(x.getBoundingClientRect().width)), cardTops:items.map(x=>Math.round(x.getBoundingClientRect().top)), writingMode:getComputedStyle(title).writingMode }; })()")
      assert.equal(layout.count, 6, 'Home debe contener seis servicios')
      if (width <= 1024) {
        assert.equal(layout.direction, 'column', 'Las tarjetas deben apilarse en móvil/tableta: ' + JSON.stringify(layout))
        assert.ok(layout.cardWidths.every(w => w >= layout.rootWidth - 4),
          'Los títulos deben tener tarjetas de ancho completo: ' + JSON.stringify(layout))
        assert.ok(layout.cardTops.every((top, i) => i === 0 || top > layout.cardTops[i - 1]),
          'Las tarjetas deben formar filas independientes: ' + JSON.stringify(layout))
        assert.equal(layout.writingMode, 'horizontal-tb', 'Las etiquetas móviles deben leerse horizontalmente')
        await evaluate("document.querySelectorAll('#servicios .service-accordion__trigger')[5].click(); true")
        await new Promise(resolve => setTimeout(resolve, 160))
        const expanded = await evaluate("(() => { const item=document.querySelector('#servicios .service-accordion__item:last-child'); const panel=item.querySelector('.service-accordion__panel'); const copy=panel?.querySelector('.service-accordion__copy'); const c=item.getBoundingClientRect(); const p=panel?.getBoundingClientRect(); return { active:item.classList.contains('is-open'), panelPosition:panel&&getComputedStyle(panel).position, panelWidth:p?.width, cardWidth:c.width, copyWidth:copy?.clientWidth, copyScrollWidth:copy?.scrollWidth, hasAction:!!copy?.querySelector('button.btn') }; })()")
        assert.ok(expanded.active && expanded.hasAction && expanded.panelPosition === 'relative',
          'La última tarjeta debe abrir contenido y Ver más: ' + JSON.stringify(expanded))
        assert.ok(expanded.panelWidth >= expanded.cardWidth - 5 && expanded.copyScrollWidth <= expanded.copyWidth + 2,
          'El panel abierto no puede comprimir ni desbordar el contenido: ' + JSON.stringify(expanded))
      } else {
        assert.equal(layout.direction, 'row', 'Escritorio conserva el acordeón horizontal: ' + JSON.stringify(layout))
      }
    }
    console.log('PASS Chrome: seis servicios del Home adaptados a móvil/tableta')

    const nav = await send('Page.navigate', { url })
    assert.ok(!nav.errorText, 'Chrome no pudo abrir Servicios: ' + nav.errorText)
    let ready = false
    for (let i = 0; i < 100; i++) {
      ready = await evaluate("document.querySelectorAll('.services-directory__run:not(.is-clone) .services-directory__card').length === 8")
      if (ready) break
      await new Promise(resolve => setTimeout(resolve, 120))
    }
    assert.ok(ready, 'Faltan enlaces reales a las ocho páginas de servicio')
    const checkCarousel = () => evaluate("(() => { const p = [...document.querySelectorAll('.services-directory__panel')]; const visible = p.filter(x => getComputedStyle(x).display !== 'none'); const cards = visible[0]?.querySelectorAll('.services-directory__run:not(.is-clone) .services-directory__card') || []; const clones = visible[0]?.querySelectorAll('.services-directory__run.is-clone .services-directory__card') || []; const a = cards[0]; const title = a?.querySelector('.services-directory__card-title'); const arrow = a?.querySelector('.services-directory__card-arrow'); const svg = arrow?.querySelector('svg'); const circle = arrow?.getBoundingClientRect(); const icon = svg?.getBoundingClientRect(); const titleCss = title ? getComputedStyle(title) : null; return { visible:visible.length, panel:visible[0]?.id, cards:cards.length, clones:clones.length, allClonesHidden:[...clones].every(x=>x.tabIndex===-1 && x.closest('[aria-hidden=true]')), photos:[...cards].every(x=>x.querySelector('.services-directory__card-media img, .services-directory__card-media video')), action:a?.querySelector('.services-directory__card-cta')?.textContent?.trim(), name:title?.textContent?.trim(), animation:getComputedStyle(visible[0]?.querySelector('.services-directory__track')).animationName, titleColor:titleCss?.color, titleFill:titleCss?.webkitTextFillColor, dx:circle&&icon?Math.abs(circle.left+circle.width/2-icon.left-icon.width/2):null, dy:circle&&icon?Math.abs(circle.top+circle.height/2-icon.top-icon.height/2):null }; })()")
    let transport = await checkCarousel()
    assert.equal(transport.visible, 1, 'Solo debe verse el carrusel de la categoría seleccionada')
    assert.equal(transport.cards, 5, 'Deben aparecer los cinco transportes')
    assert.equal(transport.clones, 20, 'El loop de transporte debe tener cuatro secuencias auxiliares')
    assert.ok(transport.allClonesHidden, 'Las copias del loop no deben entrar al tabulador')
    assert.ok(transport.photos, 'Todas las tarjetas necesitan una imagen')
    assert.ok(transport.name && transport.action.includes('Ver más'), 'Deben verse el nombre y el botón Ver más')
    assert.equal(transport.animation, 'none', 'El loop usa desplazamiento calculado, no animación CSS')
    assert.ok(transport.dx <= 1 && transport.dy <= 1, 'Flecha de Ver más descentrada')
    await evaluate("document.getElementById('services-directory-tab-logistics').click()")
    await new Promise(resolve => setTimeout(resolve, 200))
    const logistics = await checkCarousel()
    assert.equal(logistics.visible, 1, 'El cambio de categoría no debe mostrar dos carruseles')
    assert.equal(logistics.cards, 3, 'Logística y aduanas debe mostrar tres servicios')
    assert.equal(logistics.clones, 12, 'El loop de logística necesita copias suficientes para la pantalla')
    assert.ok(logistics.photos && logistics.action.includes('Ver más'))
    await evaluate("document.getElementById('services-directory-tab-transport').click()")
    await new Promise(resolve => setTimeout(resolve, 120))
    for (const dark of [false, true]) {
      await evaluate("document.documentElement.classList." + (dark ? 'add' : 'remove') + "('theme-dark')")
      await new Promise(resolve => setTimeout(resolve, 150))
      const view = await checkCarousel()
      assert.equal(view.cards, 5, 'Debe seguir visible transporte al cambiar tema')
      assert.equal(view.titleColor, 'rgb(255, 255, 255)', 'El título debe contrastar con la imagen')
      assert.equal(view.titleFill, 'rgb(255, 255, 255)', 'El título debe conservarse blanco en ambos modos')
    }
    assert.equal(await evaluate("document.querySelectorAll('.services-directory__motion').length"), 0,
      'El carrusel no debe mostrar botón de pausa')
    const defaultCardShadow = await evaluate("getComputedStyle(document.querySelector('.services-directory__panel:not([style*=none]) .services-directory__card')).boxShadow")
    assert.equal(defaultCardShadow, 'none', 'Las sombras de tarjetas estaban creando una franja gris entre fotos')
    const transform = await evaluate("document.querySelector('.services-directory__panel:not([style*=none]) .services-directory__track').style.transform")
    assert.ok(transform.startsWith('translate3d(-'), 'La pista debe aplicar un desplazamiento real')
    await new Promise(resolve => setTimeout(resolve, 330))
    const darkButton = await evaluate("(() => {const b=document.querySelector('.services-directory__panel:not([style*=none]) .services-directory__card-cta'); const c=getComputedStyle(b); return {background:c.backgroundColor,text:c.color}})()")
    assert.equal(darkButton.background, 'rgb(11, 20, 40)', 'El botón oscuro debe usar el azul marino corporativo')
    assert.equal(darkButton.text, 'rgb(244, 246, 250)', 'Ver más debe ser legible en modo oscuro')
    console.log('PASS Chrome: carrusel continuo, cinco copias, Ver más oscuro y sin sombras')

    // Comprobar geometría real: carrusel de borde a borde en PC
    // y tarjetas más compactas en móvil, sin desbordamiento horizontal.
    for (const width of [1440, 390]) {
      await send('Emulation.setDeviceMetricsOverride', {
        width, height: 900, deviceScaleFactor: 1, mobile: false
      })
      await new Promise(resolve => setTimeout(resolve, 180))
      const geometry = await evaluate("(() => { const c = document.querySelector('.services-directory__carousel').getBoundingClientRect(); const a = document.querySelector('.services-directory__panel:not([style*=none]) .services-directory__card').getBoundingClientRect(); return { viewport:window.innerWidth, layoutWidth:document.documentElement.clientWidth, carouselWidth:c.width, center:(c.left+c.right)/2, cardWidth:a.width, cardHeight:a.height, documentWidth:document.documentElement.scrollWidth }; })()")
      assert.ok(Math.abs(geometry.carouselWidth - geometry.viewport) <= 2,
        'El carrusel debe ocupar todo el ancho de pantalla: ' + JSON.stringify(geometry))
      assert.ok(Math.abs(geometry.center - geometry.layoutWidth / 2) <= 3,
        'El carrusel debe estar centrado respecto a la pantalla: ' + JSON.stringify(geometry))
      assert.ok(geometry.documentWidth <= geometry.viewport + 2,
        'El carrusel no debe generar scroll horizontal: ' + JSON.stringify(geometry))
      if (width === 390) {
        assert.ok(geometry.cardWidth <= 235 && geometry.cardHeight <= 310,
          'Tarjetas demasiado grandes en móvil: ' + JSON.stringify(geometry))
      } else {
        assert.ok(geometry.cardWidth >= 280 && geometry.cardHeight >= 345,
          'Las tarjetas de PC deben conservar una imagen protagonista: ' + JSON.stringify(geometry))
      }
    }
    console.log('PASS Chrome: carrusel de ancho completo en PC y tarjetas compactas en móvil')

    // About: five cards should keep 3/2, 2/2/1 and single-column
    // layouts, with every incomplete final row centered in its container.
    const aboutUrl = new URL('/nosotros', url).href
    for (const scenario of [
      { width: 1100, rows: [3, 2] },
      { width: 800, rows: [2, 2, 1] },
      { width: 480, rows: [1, 1, 1, 1, 1] }
    ]) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: scenario.width, height: 950, deviceScaleFactor: 1, mobile: false
      })
      const aboutNavigation = await send('Page.navigate', { url: aboutUrl })
      assert.ok(!aboutNavigation.errorText, 'Chrome no pudo abrir Nosotros: ' + aboutNavigation.errorText)
      let aboutLoaded = false
      for (let attempt = 0; attempt < 100; attempt++) {
        aboutLoaded = await evaluate("document.querySelectorAll('.about-refresh__value').length === 5 && document.querySelectorAll('.about-refresh__capability').length === 5")
        if (aboutLoaded) break
        await new Promise(resolve => setTimeout(resolve, 120))
      }
      assert.ok(aboutLoaded, 'No cargaron los valores y capacidades en ' + scenario.width + 'px')
      for (const selector of ['.about-refresh__accordion', '.about-refresh__capabilities']) {
        const geometry = await evaluate(`(() => {
          const parent = document.querySelector(${JSON.stringify(selector)})
          const bounds = parent.getBoundingClientRect()
          const cards = [...parent.children].map(card => card.getBoundingClientRect())
          const rows = []
          for (const card of cards) {
            const row = rows.find(items => Math.abs(items[0].top - card.top) < 2)
            if (row) row.push(card)
            else rows.push([card])
          }
          const last = rows[rows.length - 1]
          const rowCenter = (last[0].left + last[last.length - 1].right) / 2
          return {
            count: cards.length, rows: rows.map(row => row.length),
            delta: Math.abs(rowCenter - (bounds.left + bounds.right) / 2),
            widths: cards.map(card => card.width)
          }
        })()`)
        assert.equal(geometry.count, 5, 'Faltan tarjetas en ' + selector)
        assert.deepEqual(geometry.rows, scenario.rows, 'Filas inesperadas en ' + selector + ' (' + scenario.width + 'px): ' + JSON.stringify(geometry))
        assert.ok(geometry.delta <= 2, 'Última fila descentrada en ' + selector + ' (' + scenario.width + 'px): ' + JSON.stringify(geometry))
        assert.ok(Math.max(...geometry.widths) - Math.min(...geometry.widths) <= 2,
          'Las tarjetas dejaron de tener el mismo ancho: ' + selector + ' (' + scenario.width + 'px)')
      }
    }
    console.log('PASS Chrome: últimas filas centradas en Valores y Capacidades (1100, 800 y 480px)')
    // Contacto en Home: mantener cinco tarjetas iguales y centrar las
    // filas incompletas sin ensanchar la última tarjeta en móvil.
    const contactUrl = new URL('/', url).href
    for (const scenario of [
      { width: 900, rows: [3, 2] },
      { width: 600, rows: [2, 2, 1] },
      { width: 375, rows: [1, 1, 1, 1, 1] }
    ]) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: scenario.width, height: 950, deviceScaleFactor: 1, mobile: false
      })
      const homeNavigation = await send('Page.navigate', { url: contactUrl })
      assert.ok(!homeNavigation.errorText, 'Chrome no pudo abrir Inicio: ' + homeNavigation.errorText)
      let contactReady = false
      for (let attempt = 0; attempt < 100; attempt++) {
        contactReady = await evaluate("document.querySelectorAll('.home-contact-grid > .home-contact-card').length === 5")
        if (contactReady) break
        await new Promise(resolve => setTimeout(resolve, 120))
      }
      assert.ok(contactReady, 'No cargaron las cinco tarjetas de Contacto a ' + scenario.width + 'px')
      const contactGeometry = await evaluate(`(() => {
        const parent = document.querySelector('.home-contact-grid')
        const bounds = parent.getBoundingClientRect()
        const cards = [...parent.children].map(card => card.getBoundingClientRect())
        const rows = []
        for (const card of cards) {
          const row = rows.find(items => Math.abs(items[0].top - card.top) < 2)
          if (row) row.push(card)
          else rows.push([card])
        }
        const last = rows[rows.length - 1]
        return {
          count: cards.length,
          rows: rows.map(row => row.length),
          delta: Math.abs((last[0].left + last[last.length - 1].right) / 2 - (bounds.left + bounds.right) / 2),
          widths: cards.map(card => card.width)
        }
      })()`)
      assert.equal(contactGeometry.count, 5, 'Faltan tarjetas de Contacto')
      assert.deepEqual(contactGeometry.rows, scenario.rows,
        'Filas incorrectas en Contacto (' + scenario.width + 'px): ' + JSON.stringify(contactGeometry))
      assert.ok(contactGeometry.delta <= 2,
        'Fila final de Contacto descentrada (' + scenario.width + 'px): ' + JSON.stringify(contactGeometry))
      assert.ok(Math.max(...contactGeometry.widths) - Math.min(...contactGeometry.widths) <= 2,
        'Las tarjetas de Contacto deben conservar anchos iguales (' + scenario.width + 'px)')
    }
    console.log('PASS Chrome: cinco tarjetas de Contacto centradas (900, 600 y 375px)')

    // In both accordions, a real toggle must expose state accessibly, animate,
    // dismiss on outside pointerdown and Escape, and keep only one item open.
    await send('Emulation.setDeviceMetricsOverride', {
      width: 900, height: 950, deviceScaleFactor: 1, mobile: false
    })
    for (const accordion of [
      { path: '/', item: '.faq-item', panel: '.faq-answer-panel' },
      { path: '/servicios/transporte-local', item: '.service-landing-faq__item', panel: '.service-landing-faq__panel' },
      { path: '/nosotros', item: '.about-refresh__value', panel: '.about-refresh__value-panel' }
    ]) {
      const navigation = await send('Page.navigate', { url: new URL(accordion.path, url).href })
      assert.ok(!navigation.errorText, 'Navegación fallida para FAQ: ' + accordion.path)
      const items = JSON.stringify(accordion.item)
      const panel = JSON.stringify(accordion.panel)
      let faqReady = false
      for (let attempt = 0; attempt < 100; attempt++) {
        faqReady = await evaluate("document.querySelectorAll(" + items + ").length >= 3")
        if (faqReady) break
        await new Promise(resolve => setTimeout(resolve, 120))
      }
      assert.ok(faqReady, 'No cargaron las preguntas frecuentes de ' + accordion.path)

      const itemState = `(() => {
        const cards = [...document.querySelectorAll(${items})]
        const trigger = cards[1].querySelector('button')
        const answer = cards[1].querySelector(${panel})
        return {
          opened: cards.filter(card => card.querySelector('button').getAttribute('aria-expanded') === 'true').length,
          expanded: trigger.getAttribute('aria-expanded'),
          controls: trigger.getAttribute('aria-controls') === answer.id,
          hidden: answer.getAttribute('aria-hidden'),
          inert: answer.inert,
          transitions: getComputedStyle(answer).transitionDuration
        }
      })()`
      await evaluate("document.querySelectorAll(" + items + ")[1].querySelector('button').click(); true")
      let state = null
      for (let attempt = 0; attempt < 30; attempt++) {
        state = await evaluate(itemState)
        if (state.expanded === 'true') break
        await new Promise(resolve => setTimeout(resolve, 30))
      }
      assert.equal(state.expanded, 'true', 'La FAQ no abrió: ' + accordion.path)
      assert.equal(state.opened, 1, 'Debe abrirse una sola respuesta: ' + accordion.path)
      assert.equal(state.controls, true, 'El botón no enlaza el panel con aria-controls')
      assert.equal(state.hidden, 'false', 'La respuesta abierta no debe quedar oculta')
      assert.equal(state.inert, false, 'La respuesta abierta no debe estar inerte')
      if (!await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches")) {
        assert.ok(state.transitions.split(',').some(value => parseFloat(value) > 0),
          'La FAQ debe animar la apertura y cierre: ' + accordion.path)
      }

      await evaluate("document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' })); true")
      state = await evaluate(itemState)
      assert.equal(state.expanded, 'false', 'La FAQ no se cerró al pulsar afuera: ' + accordion.path)
      assert.equal(state.hidden, 'true', 'Respuesta cerrada no oculta para lectores')
      assert.equal(state.inert, true, 'Respuesta cerrada debe quedar inerte')

      await evaluate("document.querySelectorAll(" + items + ")[1].querySelector('button').click(); true")
      await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true")
      state = await evaluate(itemState)
      assert.equal(state.expanded, 'false', 'Escape no cerró la FAQ: ' + accordion.path)
    }
    console.log('PASS Chrome: FAQ Inicio/Servicios y Valores con animación, click afuera, Escape y ARIA')

    // All large service heroes share the same image, overlay and fade selectors.
    // Check computed CSS in actual Chrome for all transport/storage routes,
    // both breakpoints and themes (not just a matching source-code literal).
    const serviceHeroRoutes = [
      '/servicios/almacenamiento-fiscal',
      '/servicios/agenciamiento-aduanal',
      '/servicios/consolidadora-de-carga',
      '/servicios/transporte-maritimo',
      '/servicios/transporte-terrestre',
      '/servicios/transporte-aereo',
      '/servicios/transporte-local',
      '/servicios/transporte-panama-costa-rica'
    ]
    for (const servicePath of serviceHeroRoutes) {
      const heroNavigation = await send('Page.navigate', { url: new URL(servicePath, url).href })
      assert.ok(!heroNavigation.errorText, 'Navegación fallida: ' + servicePath)
      let imageReady = false
      for (let attempt = 0; attempt < 100; attempt++) {
        imageReady = await evaluate("(() => { const img = document.querySelector('.service-landing-hero__media img'); return Boolean(img && img.complete && img.naturalWidth > 0 && document.querySelector('.service-landing-hero__blur')); })()")
        if (imageReady) break
        await new Promise(resolve => setTimeout(resolve, 120))
      }
      assert.ok(imageReady, 'Imagen del hero ausente o sin cargar: ' + servicePath)
      for (const viewport of [1280, 390]) {
        await send('Emulation.setDeviceMetricsOverride', {
          width: viewport, height: 950, deviceScaleFactor: 1, mobile: false
        })
        for (const dark of [false, true]) {
          await evaluate("document.documentElement.classList." + (dark ? 'add' : 'remove') + "('theme-dark'); true")
          const state = await evaluate("(() => { const hero = document.querySelector('.service-landing-hero'); const img = hero.querySelector('img'); const blur = hero.querySelector('.service-landing-hero__blur'); const media = hero.querySelector('.service-landing-hero__media'); const story = document.querySelector('.service-landing-story'); return { sourceReady: img.complete && img.naturalWidth > 0, imageFilter: getComputedStyle(img).filter, blur: getComputedStyle(blur).backdropFilter, safariBlur: getComputedStyle(blur).webkitBackdropFilter, contrastShade: getComputedStyle(blur).backgroundImage, photoShade: getComputedStyle(media, '::after').backgroundImage, titleColor: getComputedStyle(hero.querySelector('h1')).color, bottomBlur: getComputedStyle(hero, '::after').backdropFilter, storyBlur: getComputedStyle(story, '::before').backdropFilter }; })()")
          assert.equal(state.blur, 'none',
            'La fotografía grande no debe llevar desenfoque artificial: ' + servicePath + ' (' + viewport + 'px)')
          assert.equal(state.storyBlur, 'none',
            'La transición inferior no debe desenfocar la fotografía: ' + servicePath)
          if (!dark) {
            assert.equal(state.bottomBlur, 'none',
              'El fundido claro no debe desenfocar la fotografía: ' + servicePath)
          }
          assert.ok(!state.imageFilter.includes('blur('),
            'La propia imagen no debe tener filter:blur(): ' + servicePath)
          // Chromium does not expose the WebKit alias on every CI build.
          // Check its computed value only when the browser implements it;
          // the CSS also declares -webkit-backdrop-filter:none for Safari.
          if (typeof state.safariBlur === 'string') {
            assert.equal(state.safariBlur, 'none',
              'El alias WebKit no debe desenfocar el hero: ' + servicePath)
          }
          assert.equal(state.sourceReady, true, 'Imagen original no cargada: ' + servicePath)
          assert.equal(state.titleColor, 'rgb(255, 255, 255)',
            'Contraste de titular alterado: ' + servicePath)
          assert.ok(state.contrastShade.startsWith('linear-gradient(') &&
                    state.photoShade.startsWith('linear-gradient('),
            'Se deben conservar los degradados protectores del texto: ' + servicePath)
        }
      }
      console.log('PASS Chrome: fotografía más nítida y contraste intacto: ' + servicePath)
    }
    console.log('PASS Chrome: 8 heroes de Servicios, 390/1280px, ambos temas')



  } finally {
    try { ws?.close() } catch {}
    // Wait for Chromium to release its profile before removing it: killing
    // and immediately deleting the directory can race Chrome's final writes
    // and produce ENOTEMPTY even when every browser assertion passed.
    await new Promise(resolve => {
      if (browser.exitCode !== null) return resolve()
      browser.once('close', resolve)
      browser.kill('SIGKILL')
    })
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
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
      { url: '/servicios/almacenamiento-fiscal', role: null, must: ['service-landing-page', 'Almacén fiscal de mercancías en Costa Rica'] },
      { url: '/servicios/transporte-maritimo', role: null, must: ['service-landing-page', 'service-landing-hero__inner', 'service-landing-story__frame', 'service-landing-feature-grid', 'service-landing-faq__item'] },
      { url: '/servicios/transporte-terrestre', role: null, must: ['service-landing-page', 'service-landing-feature-grid'] },
      { url: '/servicios/transporte-aereo', role: null, must: ['service-landing-page', 'service-landing-feature-grid'] },
      { url: '/servicios/transporte-local', role: null, must: ['service-landing-page', 'service-landing-feature-grid'] },
      { url: '/servicios/transporte-panama-costa-rica', role: null, must: ['service-landing-page', 'service-landing-hero__inner', 'service-landing-story__frame', 'service-landing-feature-grid', 'service-landing-faq__item'] },
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
        // The hero default must be the existing lighter WebP asset. Inspect
        // Chrome-rendered DOM, not just the Vue component source code.
        const heroMarkup = html.match(/<section[^>]*class="inner-hero inner-hero--about[^"]*"[^>]*>/)?.[0]
        assert.ok(heroMarkup && heroMarkup.includes('/images/about-operations-enhanced.webp'),
          'Nosotros debe renderizar el WebP de fallback en el hero')
        assert.ok(!heroMarkup.includes('/images/about-operations-enhanced.jpg'),
          'El hero CSS no debe seguir apuntando al JPG pesado cuando no existe override CMS')
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
      if (scenario.url.startsWith('/servicios/')) {
        const cards = html.match(/class="service-landing-feature(?:\s[^"]*)?"/g) || []
        assert.equal(cards.length, 4, 'Cada servicio debe mostrar exactamente cuatro tarjetas de beneficios: ' + scenario.url)
        // Las fichas logísticas ya traen cuatro beneficios en su JSON.
        // Probar el contenido actual evita fallos falsos cuando cambia la redacción.
        const guideBenefit = serviceGuides[scenario.url]?.es.points[3]
        const newCopy = guideBenefit || {
          '/servicios/transporte-maritimo': 'Condiciones del embarque',
          '/servicios/transporte-terrestre': 'Opciones regionales',
          '/servicios/transporte-aereo': 'Disponibilidad y condiciones',
          '/servicios/transporte-local': 'Coordinación con Neriteka',
          '/servicios/transporte-panama-costa-rica': 'Cruce fronterizo'
        }[scenario.url]
        assert.ok(newCopy && html.includes(newCopy), 'Falta el beneficio específico del servicio: ' + scenario.url)
      }
      if (scenario.url === '/servicios' || scenario.url.startsWith('/servicios/')) {
        assert.ok(html.includes('class="nav-dropdown nav-dropdown--services"') || html.includes('nav-dropdown--services'), 'No está el desplegable de Servicios en el encabezado: ' + scenario.url)
        for (const slug of ['almacenamiento-fiscal', 'agenciamiento-aduanal', 'consolidadora-de-carga']) {
          assert.ok(html.includes('href="/servicios/' + slug + '"'), 'No aparece el enlace de ' + slug + ' en el menú de Servicios')
        }
        for (const slug of ['transporte-maritimo', 'transporte-terrestre', 'transporte-aereo', 'transporte-local', 'transporte-panama-costa-rica']) {
          assert.ok(html.includes('href="/servicios/' + slug + '"'), 'Falta el transporte en el submenú: ' + slug)
        }
        for (const retired of ['bodegaje-general', 'transporte-internacional']) {
          assert.ok(!html.includes('href="/servicios/' + retired + '"'), 'No debe conservar enlace al servicio eliminado: ' + retired)
        }
        assert.ok(html.includes('services-megamenu__rail') && html.includes('services-megamenu__detail') && html.includes('services-megamenu__group-trigger'), 'Falta el megamenú de dos columnas debajo del nav')
        assert.ok(html.includes('aria-current="page"'), 'La ruta actual debe quedar resaltada en Servicios: ' + scenario.url)
        assert.ok(!html.includes('services-page__guides'), 'La página debe conservar su diseño anterior, sin tarjetas nuevas')
        assert.ok(!html.includes('service-landing-related'), 'Enlaces cruzados de servicios fuera del nav')
      }
      assert.ok(sessionCalls > before, 'No se comprobó la sesión para ' + scenario.url)
      console.log('PASS navegador: ' + scenario.url + ' [' + (activeRole || 'invitado') + ']')
    }
    // The designer's published CMS image must keep priority over the WebP
    // fallback; an arbitrary valid published image remains unchanged.
    publishedSiteSlots = [
      { key: 'about.hero.media', mediaSrc: '/images/services-warehouse.webp', mediaKind: 'Imagen' }
    ]
    const customAbout = await dumpDom(chrome,
      'http://' + host + ':' + previewPort + '/nosotros', 'Nosotros con imagen CMS')
    const customHero = customAbout.match(/<section[^>]*class="inner-hero inner-hero--about[^"]*"[^>]*>/)?.[0]
    assert.ok(customHero && customHero.includes('/images/services-warehouse.webp'),
      'Nosotros debe priorizar la imagen publicada desde el CMS')
    assert.ok(!customHero.includes('/images/about-operations-enhanced.webp'),
      'El WebP fallback no debe sobrescribir la imagen escogida por la diseñadora')
    console.log('PASS Chrome: el hero WebP no cambia la imagen publicada desde CMS')
    publishedSiteSlots = []

    // Publicaciones del CMS deben reemplazar textos de tarjetas adicionales
    // sin romper las cuatro tarjetas ni afectar al resto del contenido.
    publishedSiteSlots = [
      { key: 'service.transporte-maritimo.point.2.title', textEs: 'Beneficio CMS de prueba 3', textEn: 'CMS benefit test 3' },
      { key: 'service.transporte-maritimo.point.3.body', textEs: 'Descripción CMS publicada en tarjeta 4', textEn: 'Published CMS body for card 4' }
    ]
    const publishedHtml = await dumpDom(chrome, 'http://' + host + ':' + previewPort + '/servicios/transporte-maritimo', 'servicio marítimo con CMS')
    assert.ok(publishedHtml.includes('Beneficio CMS de prueba 3'), 'El CMS no actualizó el título de la tercera tarjeta')
    assert.ok(publishedHtml.includes('Descripción CMS publicada en tarjeta 4'), 'El CMS no actualizó el texto de la cuarta tarjeta')
    assert.equal((publishedHtml.match(/class="service-landing-feature(?:\s[^"]*)?"/g) || []).length, 4,
      'La publicación CMS debe conservar las cuatro tarjetas')
    console.log('PASS Chrome: las tarjetas adicionales de transporte leen textos publicados del CMS')
    await assertServicesTheme(chrome, 'http://' + host + ':' + previewPort + '/servicios')
    if (serverError.includes('Error')) console.log('Vite stderr: ' + serverError.slice(-500))
    console.log('OK: páginas públicas, login, control de acceso, cotizaciones y administración renderizadas en Chrome.')
  } finally {
    if (preview && preview.exitCode === null) preview.kill('SIGTERM')
    await closeServer(api)
  }
}
main().catch(error => { console.error('FAIL browser smoke:', error.message); process.exitCode = 1 })
