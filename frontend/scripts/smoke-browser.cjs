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

    // Six mobile tabs start closed, preserve vertical labels, and hide
    // only as many neighbors as needed to keep the selected card readable.
    const homeUrl = new URL('/', url).href
    for (const width of [320, 390, 430, 768, 800, 1024, 1280]) {
      await send('Emulation.setDeviceMetricsOverride', {
        width, height: 950, deviceScaleFactor: 1, mobile: false
      })
      const homeNavigation = await send('Page.navigate', { url: homeUrl })
      assert.ok(!homeNavigation.errorText, 'Chrome no pudo abrir Home: ' + homeNavigation.errorText)
      let loaded = false
      for (let attempt = 0; attempt < 100; attempt++) {
        loaded = await evaluate("document.querySelectorAll('#servicios .service-accordion__item').length === 6")
        if (loaded) break
        await new Promise(resolve => setTimeout(resolve, 120))
      }
      assert.ok(loaded, 'Faltan los seis servicios del Home a ' + width + 'px')
      await new Promise(resolve => setTimeout(resolve, 150))
      const initial = await evaluate("(() => { const root=document.querySelector('#servicios .service-accordion'); const items=[...root.querySelectorAll('.service-accordion__item')]; const visible=items.filter(x=>getComputedStyle(x).display!=='none'); const r=root.getBoundingClientRect(); return { direction:getComputedStyle(root).flexDirection, total:items.length, visible:visible.length, opened:items.filter(x=>x.classList.contains('is-open')).length, writingMode:getComputedStyle(items[0].querySelector('.service-accordion__name')).writingMode, widths:visible.map(x=>Math.round(x.getBoundingClientRect().width)), documentWidth:document.documentElement.scrollWidth, viewport:window.innerWidth, containerWidth:root.clientWidth, centeredDelta:Math.abs((visible[0].getBoundingClientRect().left+visible[visible.length-1].getBoundingClientRect().right)/2-(r.left+r.right)/2), collapsedClass:root.classList.contains('is-collapsed') }; })()")
      assert.equal(initial.total, 6, 'Se deben conservar los seis servicios')
      assert.equal(initial.visible, 6, 'Al inicio deben verse todas las pestañas')
      if (width <= 800) {
        assert.equal(initial.direction, 'row', 'El móvil conserva las pestañas verticales en fila: ' + JSON.stringify(initial))
        assert.equal(initial.writingMode, 'vertical-rl', 'Los nombres deben quedar verticales')
        assert.equal(initial.opened, 0, 'Los servicios móviles deben iniciar todos cerrados')
        assert.ok(initial.collapsedClass && initial.centeredDelta <= 2,
          'Las seis pestañas cerradas deben estar centradas, no pegadas a la izquierda: ' + JSON.stringify(initial))
        assert.ok(initial.widths.every(w => w >= 35 && w <= 44),
          'Conservar el ancho original de 40px de las pestañas: ' + JSON.stringify(initial))
        assert.ok(initial.widths.every(w => w >= 35 && w <= Math.ceil(initial.containerWidth / 6) + 3), 'Las pestañas cerradas deben distribuirse uniformemente: ' + JSON.stringify(initial))
        assert.ok(initial.documentWidth <= initial.viewport + 2, 'El acordeón no debe desbordar la pantalla: ' + JSON.stringify(initial))
        // Select the last tab, to catch accidental hiding of a selected service.
        await evaluate("document.querySelectorAll('#servicios .service-accordion__trigger')[5].click(); true")
        // Wait for the original .45s expansion before checking final geometry.
        await new Promise(resolve => setTimeout(resolve, 550))
        const expanded = await evaluate("(() => { const root=document.querySelector('#servicios .service-accordion'); const items=[...root.querySelectorAll('.service-accordion__item')]; const visible=items.filter(x=>getComputedStyle(x).display!=='none'); const selected=items.find(x=>x.classList.contains('is-open')); const panel=selected?.querySelector('.service-accordion__panel'); const copy=panel?.querySelector('.service-accordion__copy'); return { visible:visible.length, hidden:items.length-visible.length, opened:items.filter(x=>x.classList.contains('is-open')).length, lastSelected:selected===items[5], selectedWidth:selected?.clientWidth, panelWidth:panel?.clientWidth, copyWidth:copy?.clientWidth, copyScrollWidth:copy?.scrollWidth, panelVisible:!!panel, hasAction:!!copy?.querySelector('button.btn'), transition:getComputedStyle(selected).transitionDuration, reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches, containerWidth:root.clientWidth, visibleOther:visible.some(x=>x!==selected), visibleKeys:visible.map(x=>x.querySelector('.service-accordion__trigger')?.textContent?.trim()), originalKeys:items.slice(0,4).map(x=>x.querySelector('.service-accordion__trigger')?.textContent?.trim()) }; })()")
        assert.ok(expanded.lastSelected && expanded.opened===1 && expanded.panelVisible && expanded.hasAction, 'Debe abrirse el servicio seleccionado: ' + JSON.stringify(expanded))
        const expectedVisible = initial.containerWidth < 260 ? 3 : 4
        assert.equal(expanded.visible, expectedVisible,
          'Abrir no debe ocultar más pestañas de las necesarias: ' + JSON.stringify(expanded))
        assert.equal(expanded.hidden, 6 - expectedVisible, 'Solo deben desaparecer las dos pestañas adicionales cuando caben cuatro')
        assert.ok(expanded.visibleOther, 'Deben quedar pestañas vecinas visibles')
        assert.ok(expanded.selectedWidth >= initial.containerWidth - (expectedVisible - 1) * 54 - 5,
          'Conservar la proporción original del acordeón: ' + JSON.stringify(expanded))
        if (!expanded.reducedMotion) {
          assert.ok(expanded.transition !== '0s', 'Debe conservar la animación de apertura: ' + JSON.stringify(expanded))
        }
        assert.ok(expanded.copyScrollWidth <= expanded.copyWidth + 2, 'El texto no debe desbordar: ' + JSON.stringify(expanded))
        if (width <= 430) assert.ok(expanded.hidden >= 1, 'En celular pequeño deben ocultarse algunas pestañas: ' + JSON.stringify(expanded))
        // Tapping the same red tab closes it, just like a standard accordion.
        await evaluate("document.querySelectorAll('#servicios .service-accordion__trigger')[5].click(); true")
        const reset = await evaluate("(() => { const items=[...document.querySelectorAll('#servicios .service-accordion__item')];return { visible:items.filter(x=>getComputedStyle(x).display!=='none').length,opened:items.filter(x=>x.classList.contains('is-open')).length }; })()")
        assert.equal(reset.visible, 6, 'Cerrar debe devolver todas las pestañas: ' + JSON.stringify(reset))
        assert.equal(reset.opened, 0, 'Cerrar no debe dejar un servicio abierto')
        if (width === 390) {
          // Mouse and trackpad must open on hover at compact widths, without a click.
          // Touch does not use pointerenter; its click behavior remains unchanged.
          await evaluate("document.querySelectorAll('#servicios .service-accordion__trigger')[1].dispatchEvent(new PointerEvent('pointerenter', {pointerType:'mouse',clientX:100,clientY:200})); true")
          const hovered = await evaluate("(() => { const items=[...document.querySelectorAll('#servicios .service-accordion__item')];return { opened:items[1].classList.contains('is-open'), visible:items.filter(x=>getComputedStyle(x).display!=='none').length }; })()")
          assert.ok(hovered.opened && hovered.visible === 4, 'El mouse debe abrir Marítimo al pasar por encima: ' + JSON.stringify(hovered))
          await evaluate("document.querySelectorAll('#servicios .service-accordion__trigger')[2].dispatchEvent(new PointerEvent('pointerenter', {pointerType:'mouse',clientX:100,clientY:200})); true")
          assert.equal(await evaluate("document.querySelectorAll('#servicios .service-accordion__item')[1].classList.contains('is-open')"), true,
            'No debe saltar al siguiente servicio por un cambio de columnas bajo el mouse')
          await evaluate("document.querySelectorAll('#servicios .service-accordion__trigger')[2].dispatchEvent(new PointerEvent('pointerenter', {pointerType:'mouse',clientX:145,clientY:200})); true")
          assert.equal(await evaluate("document.querySelectorAll('#servicios .service-accordion__item')[2].classList.contains('is-open')"), true,
            'Mover realmente el mouse hacia Terrestre debe abrirlo')
          await evaluate("document.querySelectorAll('#servicios .service-accordion__trigger')[2].click(); true")
          assert.equal(await evaluate("document.querySelectorAll('#servicios .service-accordion__item.is-open').length"), 0,
            'Tras hover debe poderse cerrar tocando la misma pestaña')
          // Simulated touch pointerenter must not open a tab until actual tap.
          await evaluate("document.querySelectorAll('#servicios .service-accordion__trigger')[0].dispatchEvent(new PointerEvent('pointerenter', {pointerType:'touch'})); true")
          assert.equal(await evaluate("document.querySelectorAll('#servicios .service-accordion__item.is-open').length"), 0,
            'Un toque no debe abrir el servicio antes del click')
        }
        await evaluate("document.querySelectorAll('#servicios .service-accordion__trigger')[2].click(); true")
        const original = await evaluate("(() => { const items=[...document.querySelectorAll('#servicios .service-accordion__item')]; return { selected:items[2].classList.contains('is-open'), shown:items.flatMap((item,i)=>getComputedStyle(item).display!=='none'?[i]:[]) }; })()")
        assert.equal(original.selected, true, 'Se debe poder abrir otro servicio después de cerrar')
        if (expectedVisible === 4) {
          assert.deepEqual(original.shown, [1,2,3,4],
            'Al iniciar desde Terrestre debe mostrarse Fiscal, sin saltar a Panamá')
          // Start with all six, and open neighboring services in order.
          // Newly added right-hand services must emerge BEFORE we close any card.
          await evaluate("document.querySelectorAll('#servicios .service-accordion__trigger')[2].click(); true")
          await evaluate("document.querySelectorAll('#servicios .service-accordion__trigger')[0].click(); true")
          const shownIndices = () => evaluate("(() => { const items=[...document.querySelectorAll('#servicios .service-accordion__item')]; return { opened:items.findIndex(item=>item.classList.contains('is-open')), visible:items.flatMap((item,i)=>getComputedStyle(item).display!=='none'?[i]:[]) }; })()")
          const air = await shownIndices()
          assert.deepEqual(air, {opened:0,visible:[0,1,2,3]}, 'Aéreo debe iniciar con los cuatro servicios originales')
          await evaluate("document.querySelectorAll('#servicios .service-accordion__trigger')[1].click(); true")
          const maritime = await shownIndices()
          assert.deepEqual(maritime, {opened:1,visible:[1,2,3,4]},
            'Al abrir Marítimo, Fiscal debe aparecer y Aéreo ocultarse')
          await evaluate("document.querySelectorAll('#servicios .service-accordion__trigger')[2].click(); true")
          const land = await shownIndices()
          assert.deepEqual(land, {opened:2,visible:[2,3,4,5]},
            'Al abrir Terrestre debe aparecer Panamá y ocultarse Marítimo')
          await evaluate("document.querySelectorAll('#servicios .service-accordion__trigger')[3].click(); true")
          assert.deepEqual(await shownIndices(), {opened:3,visible:[2,3,4,5]},
            'Multimodal debe poder abrirse sin cerrar ni ocultar Fiscal/Panamá')
          await evaluate("document.querySelectorAll('#servicios .service-accordion__trigger')[4].click(); true")
          assert.deepEqual(await shownIndices(), {opened:4,visible:[2,3,4,5]},
            'Fiscal debe poder abrirse directamente al avanzar')
          await evaluate("document.querySelectorAll('#servicios .service-accordion__trigger')[5].click(); true")
          assert.deepEqual(await shownIndices(), {opened:5,visible:[2,3,4,5]},
            'Panamá debe poder abrirse directamente al avanzar')
          await evaluate("document.querySelectorAll('#servicios .service-accordion__trigger')[4].click(); true")
          assert.deepEqual(await shownIndices(), {opened:4,visible:[1,2,3,4]},
            'Al regresar de Panamá a Fiscal debe reaparecer una pestaña por la izquierda')
          await evaluate("document.querySelectorAll('#servicios .service-accordion__trigger')[3].click(); true")
          assert.deepEqual(await shownIndices(), {opened:3,visible:[0,1,2,3]},
            'Al regresar de Fiscal a Multimodal debe reaparecer Aéreo, sin saltos')
          await evaluate("document.querySelectorAll('#servicios .service-accordion__trigger')[2].click(); true")
          assert.deepEqual(await shownIndices(), {opened:2,visible:[0,1,2,3]},
            'Continuar retrocediendo conserva la ventana izquierda')
          await evaluate("document.querySelectorAll('#servicios .service-accordion__trigger')[1].click(); true")
          assert.deepEqual(await shownIndices(), {opened:1,visible:[0,1,2,3]},
            'Al volver hacia Marítimo debe permanecer visible Aéreo a la izquierda')
          await evaluate("document.querySelectorAll('#servicios .service-accordion__trigger')[0].click(); true")
          assert.deepEqual(await shownIndices(), {opened:0,visible:[0,1,2,3]},
            'Regresar hasta Aéreo nunca debe saltar a otra tarjeta')
          await evaluate("document.querySelectorAll('#servicios .service-accordion__trigger')[0].click(); true")
          assert.equal(await evaluate("document.querySelectorAll('#servicios .service-accordion__item:not([hidden])').length"), 6,
            'Al cerrar deben regresar las seis pestañas sin controles de navegación')
          assert.ok(await evaluate("!document.querySelector('.service-accordion__navigation')"),
            'No debe agregarse navegación artificial al acordeón')
        }
      } else {
        assert.equal(initial.direction, 'row', 'Escritorio conserva el acordeón horizontal')
        assert.equal(initial.opened, 1, 'Escritorio conserva su servicio inicial expandido')
      }
    }
    console.log('PASS Chrome: seis pestañas verticales, expansión adaptable y restauración al cerrar')

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
    // Verify pointer dragging with Chrome input events, without accidentally opening the card.
    await evaluate("document.querySelector('.services-directory__carousel').scrollIntoView({block:'center',behavior:'instant'}); true")
    await new Promise(resolve => setTimeout(resolve, 170))
    const dragPoint = await evaluate("(() => {const r=document.querySelector('.services-directory__carousel').getBoundingClientRect();return {x:Math.floor(innerWidth/2),y:Math.floor(Math.max(30,Math.min(innerHeight-30,(r.top+r.bottom)/2)))};})()")
    const readOffset = () => evaluate("(() => {const t=document.querySelector('.services-directory__panel:not([style*=none]) .services-directory__track').style.transform;const m=t.match(/translate3d\\(-([\\d.]+)px/);return m?Number(m[1]):null;})()")
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:dragPoint.x,y:dragPoint.y,button:'none'})
    await new Promise(resolve => setTimeout(resolve, 80))
    const beforeDrag = await readOffset()
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:dragPoint.x,y:dragPoint.y,button:'left',clickCount:1})
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:dragPoint.x-120,y:dragPoint.y,button:'left',buttons:1})
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:dragPoint.x-120,y:dragPoint.y,button:'left',clickCount:1})
    await new Promise(resolve => setTimeout(resolve, 90))
    const afterDrag = await readOffset()
    assert.ok(beforeDrag !== null && afterDrag !== null && Math.abs(afterDrag-beforeDrag)>60,
      'Arrastrar debe mover el carrusel con el mouse: ' + JSON.stringify({beforeDrag,afterDrag}))
    assert.ok(await evaluate("location.pathname === '/servicios'"),'Arrastrar no debe abrir el enlace')
    // No pointerleave: cursor remains over the carousel after dropping.
    await new Promise(resolve => setTimeout(resolve, 270))
    const stillPaused = await readOffset()
    assert.ok(stillPaused !== null && Math.abs(stillPaused-afterDrag) < 2,
      'El carrusel debe ofrecer una pausa breve al soltar la tarjeta')
    await new Promise(resolve => setTimeout(resolve, 1680))
    const resumeBefore = await readOffset()
    await new Promise(resolve => setTimeout(resolve, 300))
    const resumeAfter = await readOffset()
    assert.ok(resumeBefore !== null && resumeAfter !== null && Math.abs(resumeAfter-resumeBefore) > 4,
      'Debe reanudar automáticamente aun si el mouse sigue sobre el carrusel y no se toca afuera')
    const focused = await evaluate("(() => {const a=document.querySelector('.services-directory__panel:not([style*=none]) .services-directory__run:not(.is-clone) .services-directory__card');a?.focus();return Boolean(a);})()")
    assert.ok(focused,'Debe existir una tarjeta accesible')
    await new Promise(resolve => setTimeout(resolve, 130))
    const clip = await evaluate("document.querySelector('.services-directory__panel:not([style*=none]) .services-directory__run:not(.is-clone) .services-directory__card video.services-directory__preview')?.getAttribute('src')")
    assert.ok(clip && clip.startsWith('/videos/service-'),
      'Al enfocar la tarjeta debe montarse el video del servicio')
    console.log('PASS Chrome: arrastre sin navegación y video de vista previa al enfocar')


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
    // Our Structure: four organizational areas, environment kept OUT of the
    // menu for a future independent section; content anchored top-left.
    const structureUrl = new URL('/nosotros', url).href
    for (const width of [1440, 1000, 760, 480, 375]) {
      await send('Emulation.setDeviceMetricsOverride', {
        width, height: 1000, deviceScaleFactor: 1, mobile: false
      })
      const nav = await send('Page.navigate', { url: structureUrl })
      assert.ok(!nav.errorText, 'Chrome no pudo abrir Nosotros: ' + nav.errorText)
      let structureReady = false
      for (let attempt = 0; attempt < 100; attempt++) {
        structureReady = await evaluate("document.querySelectorAll('#nuestra-estructura .about-refresh__structure-choice').length === 4")
        if (structureReady) break
        await new Promise(resolve => setTimeout(resolve, 120))
      }
      assert.ok(structureReady, 'Deben existir cuatro opciones de Nuestra estructura a ' + width)
      const headingLayout = await evaluate("(() => { const root=document.querySelector('#nuestra-estructura');const heading=root.querySelector('.about-refresh__structure-heading');const title=heading.querySelector('h2');const kicker=heading.querySelector('.about-refresh__eyebrow');const valuesKicker=document.querySelector('#nuestros-valores .about-refresh__eyebrow');const showcase=root.querySelector('.about-refresh__structure-showcase');const ks=getComputedStyle(kicker),vs=getComputedStyle(valuesKicker);return { childCount:heading.children.length, kickerCount:heading.querySelectorAll('.about-refresh__eyebrow').length, kickerText:kicker.textContent?.trim(), headingAlign:getComputedStyle(heading).textAlign, titleAlign:getComputedStyle(title).textAlign, titleLeft:title.getBoundingClientRect().left, kickerLeft:kicker.getBoundingClientRect().left, showcaseLeft:showcase.getBoundingClientRect().left, kickerTop:kicker.getBoundingClientRect().top, titleTop:title.getBoundingClientRect().top, showcaseTop:showcase.getBoundingClientRect().top, kickerColor:ks.color, valuesColor:vs.color, kickerFontSize:ks.fontSize, valuesFontSize:vs.fontSize, kickerLetterSpacing:ks.letterSpacing, valuesLetterSpacing:vs.letterSpacing }; })()")
      assert.equal(headingLayout.childCount, 2, 'El bloque debe tener solo antetítulo y título, sin descripción')
      assert.equal(headingLayout.kickerCount, 1, 'Debe mostrarse un antetítulo rojo arriba de Nuestra estructura')
      assert.ok(headingLayout.kickerText && !/SOBRE NOSOTROS|ABOUT US/i.test(headingLayout.kickerText),
        'No debe volver a mostrarse el rótulo anterior: '+JSON.stringify(headingLayout))
      assert.equal(headingLayout.headingAlign, 'left', 'Nuestra estructura debe alinearse a la izquierda')
      assert.equal(headingLayout.titleAlign, 'left', 'El título debe mantener el estilo de las otras secciones')
      assert.equal(headingLayout.kickerColor, headingLayout.valuesColor,
        'El antetítulo debe usar exactamente el rojo de Nuestros valores')
      assert.equal(headingLayout.kickerFontSize, headingLayout.valuesFontSize,
        'El antetítulo debe usar el tamaño pequeño de Nuestros valores')
      assert.equal(headingLayout.kickerLetterSpacing, headingLayout.valuesLetterSpacing,
        'El antetítulo debe tener el mismo espaciado de letras que los otros títulos')
      assert.ok(Math.abs(headingLayout.titleLeft-headingLayout.showcaseLeft)<=3 &&
        Math.abs(headingLayout.kickerLeft-headingLayout.showcaseLeft)<=3 &&
        headingLayout.kickerTop < headingLayout.titleTop && headingLayout.titleTop < headingLayout.showcaseTop,
        'Antetítulo y título deben empezar a la izquierda y sobre el panel: '+JSON.stringify(headingLayout))
      const initial = await evaluate("(() => { const root=document.querySelector('#nuestra-estructura'); const showcase=root.querySelector('.about-refresh__structure-showcase'); const menu=root.querySelector('.about-refresh__structure-menu'); const feature=root.querySelector('.about-refresh__structure-feature'); const choices=[...menu.querySelectorAll('button')];const pressed=choices.flatMap((b,i)=>b.getAttribute('aria-pressed')==='true'?[i]:[]); const fr=feature.getBoundingClientRect(),cr=feature.querySelector('.about-refresh__structure-feature-content').getBoundingClientRect();return { choiceCount:choices.length, panelCount:root.querySelectorAll('.about-refresh__structure-feature').length, pressed, controls:choices.map(b=>b.getAttribute('aria-controls')), panelId:feature.id, hasMedia:!!feature.querySelector('img,video'), hasText:!!feature.querySelector('h3')&&!!feature.querySelector('p'), hasVisibleCopy:feature.querySelector('.about-refresh__structure-description')?.textContent?.trim().length>20, display:getComputedStyle(showcase).display, menuOrder:getComputedStyle(menu).order, featureOrder:getComputedStyle(feature).order, contentTop:Math.round(cr.top-fr.top),contentLeft:Math.round(cr.left-fr.left), overflow:showcase.scrollWidth-showcase.clientWidth, documentOverflow:document.documentElement.scrollWidth-window.innerWidth, navText:menu.textContent }; })()")
      assert.equal(initial.choiceCount, 4, 'Enfoque ambiental debe estar fuera de la estructura')
      assert.ok(!/Enfoque ambiental|Environmental approach/i.test(initial.navText),
        'El enfoque ambiental no debe aparecer en el menú de Nuestra estructura')
      assert.equal(initial.panelCount, 1, 'Solo debe verse un panel fotográfico')
      assert.deepEqual(initial.pressed, [0], 'Mesa de ayuda debe estar seleccionada al cargar')
      assert.ok(initial.controls.every(id => id === 'about-structure-feature') && initial.panelId === 'about-structure-feature',
        'Los botones deben controlar un panel accesible: ' + JSON.stringify(initial))
      assert.ok(initial.hasMedia && initial.hasText && initial.hasVisibleCopy,
        'El panel debe contener fotografía, título y descripción: ' + JSON.stringify(initial))
      assert.ok(initial.contentTop >= 0 && initial.contentTop <= 75 && initial.contentLeft >= 0 && initial.contentLeft <= 75,
        'La información debe comenzar arriba a la izquierda: ' + JSON.stringify(initial))
      assert.ok(initial.overflow <= 3 && initial.documentOverflow <= 3,
        'Nuestra estructura no debe provocar scroll horizontal: ' + JSON.stringify(initial))
      if (width <= 760) {
        assert.equal(initial.display, 'flex', 'En celular el panel debe apilarse')
        assert.equal(initial.menuOrder, '0', 'El menú debe estar sobre la fotografía en móvil')
        assert.equal(initial.featureOrder, '1', 'La fotografía debe quedar bajo las opciones en móvil')
      } else {
        assert.equal(initial.display, 'grid', 'En escritorio debe mantenerse el panel de dos columnas')
      }
      const palette = await evaluate("(() => {const root=document.documentElement;const wasDark=root.classList.contains('theme-dark');const menu=document.querySelector('#nuestra-estructura .about-refresh__structure-menu');const unselected=menu.querySelectorAll('button')[1];const showcase=document.querySelector('#nuestra-estructura .about-refresh__structure-showcase');root.classList.remove('theme-dark');const light={background:getComputedStyle(unselected).backgroundColor,color:getComputedStyle(unselected).color,surface:getComputedStyle(showcase).backgroundImage};root.classList.add('theme-dark');const dark={background:getComputedStyle(unselected).backgroundColor,color:getComputedStyle(unselected).color,surface:getComputedStyle(showcase).backgroundImage};root.classList.toggle('theme-dark',wasDark);return {light,dark};})()")
      assert.equal(palette.light.background, 'rgb(255, 255, 255)', 'El modo claro debe usar tarjetas blancas')
      assert.equal(palette.light.color, 'rgb(34, 42, 55)', 'El modo claro debe usar texto oscuro')
      assert.equal(palette.dark.color, 'rgb(255, 255, 255)', 'El modo oscuro debe conservar texto blanco')
      assert.notEqual(palette.dark.surface, palette.light.surface, 'Cada tema debe tener su propio fondo')
      // Active red option must have WHITE label, icon and arrow even in light mode.
      const activePalette = await evaluate("(() => {const root=document.documentElement;const previous=root.classList.contains('theme-dark');root.classList.remove('theme-dark');const button=document.querySelector('#nuestra-estructura .about-refresh__structure-choice.is-selected');const result={label:getComputedStyle(button.querySelector('.about-refresh__structure-choice-name')).color,arrow:getComputedStyle(button.querySelector('.about-refresh__structure-choice-arrow')).color,icon:getComputedStyle(button.querySelector('.about-refresh__structure-choice-icon')).color,button:getComputedStyle(button).color};root.classList.toggle('theme-dark',previous);return result;})()")
      for (const [part,color] of Object.entries(activePalette)) {
        assert.equal(color,'rgb(255, 255, 255)','El elemento '+part+' de la opción activa debe ser blanco: '+JSON.stringify(activePalette))
      }
      await evaluate("document.querySelectorAll('#nuestra-estructura .about-refresh__structure-choice')[2].click(); true")
      await new Promise(resolve => setTimeout(resolve, 550))
      const departments = await evaluate("(() => { const root=document.querySelector('#nuestra-estructura'); const grid=root.querySelector('.about-refresh__structure-departments');const feature=root.querySelector('.about-refresh__structure-feature');const fr=feature.getBoundingClientRect(), cr=feature.querySelector('.about-refresh__structure-feature-content').getBoundingClientRect(); return { selected:root.querySelectorAll('.about-refresh__structure-choice[aria-pressed=true]').length===1&&root.querySelectorAll('.about-refresh__structure-choice')[2].getAttribute('aria-pressed')==='true',items:root.querySelectorAll('.about-refresh__structure-department').length,icons:root.querySelectorAll('.about-refresh__structure-department svg').length,gridDisplay:grid&&getComputedStyle(grid).display,columns:grid&&getComputedStyle(grid).gridTemplateColumns.split(' ').length,panel:root.querySelectorAll('.about-refresh__structure-feature').length,heading:feature.querySelector('h3')?.textContent?.trim(),hasMedia:!!feature.querySelector('.about-refresh__structure-photo img,.about-refresh__structure-photo video'),contentTop:Math.round(cr.top-fr.top) }; })()")
      assert.ok(departments.selected && departments.panel === 1 && departments.items === 5 && departments.icons === 5 && departments.heading && departments.hasMedia,
        'Deben mostrarse los cinco departamentos con sus iconos: ' + JSON.stringify(departments))
      const departmentsIconPalette = await evaluate("(() => {const html=document.documentElement;const wasDark=html.classList.contains('theme-dark');const icons=[...document.querySelectorAll('#nuestra-estructura .about-refresh__structure-department svg')];const inspect=()=>icons.map(svg=>({color:getComputedStyle(svg).color,stroke:getComputedStyle(svg).stroke}));html.classList.remove('theme-dark');const light=inspect();html.classList.add('theme-dark');const dark=inspect();html.classList.toggle('theme-dark',wasDark);return {light,dark}})()")
      assert.equal(departmentsIconPalette.light.length,5,'Deben mostrarse cinco SVG de Departamentos')
      assert.ok(departmentsIconPalette.light.every(svg=>svg.color==='rgb(252, 52, 92)'),
        'Los íconos deben ser rojos en modo claro: '+JSON.stringify(departmentsIconPalette))
      assert.ok(departmentsIconPalette.dark.every(svg=>svg.color==='rgb(252, 52, 92)' && svg.stroke==='rgb(252, 52, 92)'),
        'Los cinco SVG deben pintar sus trazos en #FC345C en modo oscuro: '+JSON.stringify(departmentsIconPalette))
      assert.equal(departments.gridDisplay,'grid','Los departamentos deben usar su nueva distribución por columnas')
      assert.equal(departments.columns,width<=1100?2:6,'Tres columnas en escritorio amplio y dos en pantallas estrechas: '+JSON.stringify(departments))
      assert.ok(departments.contentTop<=75,'El panel de Departamentos debe mantener el contenido arriba')
      const geometry=await evaluate("(() => {const grid=document.querySelector('#nuestra-estructura .about-refresh__structure-departments');const cards=[...grid.querySelectorAll('.about-refresh__structure-department')];const bounds=cards.map(x=>x.getBoundingClientRect());const container=grid.getBoundingClientRect();return { widths:bounds.map(b=>b.width),tops:bounds.map(b=>b.top),centerDelta:Math.abs((bounds[4].left+bounds[4].right)/2-(container.left+container.right)/2),lastSpan:getComputedStyle(cards[4]).gridColumnStart,pairCenterDelta:Math.abs((bounds[3].left+bounds[4].right)/2-(container.left+container.right)/2),verticalSeparators:cards.some(c=>getComputedStyle(c).borderRightWidth==='1px'&&getComputedStyle(c).borderRightStyle==='solid'&&getComputedStyle(c).borderRightColor==='rgba(255, 255, 255, 0.35)') };})()")
      assert.ok(Math.max(...geometry.widths)-Math.min(...geometry.widths)<=2,
        'Los cinco departamentos deben mantener el mismo ancho: '+JSON.stringify(geometry))
      if (width > 1100) {
        assert.ok(Math.abs(geometry.tops[0]-geometry.tops[1])<=2 && Math.abs(geometry.tops[1]-geometry.tops[2])<=2,
          'Los primeros tres departamentos deben compartir una fila: '+JSON.stringify(geometry))
        assert.ok(Math.abs(geometry.tops[3]-geometry.tops[4])<=2 && geometry.tops[3]>geometry.tops[0],
          'Los últimos dos departamentos deben compartir la fila inferior: '+JSON.stringify(geometry))
        assert.ok(geometry.pairCenterDelta<=2,
          'Los dos departamentos de abajo deben quedar centrados como grupo: '+JSON.stringify(geometry))
        assert.equal(geometry.lastSpan,'4','La quinta tarjeta debe comenzar en la cuarta columna: '+JSON.stringify(geometry))
      } else {
        assert.ok(Math.abs(geometry.tops[0]-geometry.tops[1])<=2 && Math.abs(geometry.tops[2]-geometry.tops[3])<=2,
          'Los departamentos deben adaptarse a dos columnas en celular: '+JSON.stringify(geometry))
        assert.ok(geometry.tops[2]>geometry.tops[0] && geometry.tops[4]>geometry.tops[2] && geometry.centerDelta<=2,
          'El quinto departamento debe quedar centrado debajo de los otros: '+JSON.stringify(geometry))
        assert.equal(geometry.lastSpan,'1','La quinta tarjeta móvil debe centrarse en la última fila')
      }
      assert.equal(geometry.verticalSeparators,false,'No deben quedar divisores verticales anteriores')

      // Future CMS descriptions can be significantly longer than today's names.
      // Simulate an extended section in-memory without publishing invented copy.
      const overflowTest=await evaluate("(() => { const feature=document.querySelector('#nuestra-estructura .about-refresh__structure-feature');const cards=[...feature.querySelectorAll('.about-refresh__structure-department')];const summary=feature.querySelector('.about-refresh__structure-description');const longText='Detalle adicional para verificar que el contenido largo se adapte correctamente dentro de cada tarjeta, sin cortar palabras ni reducir su legibilidad. ';summary.textContent += ' '+longText.repeat(5);cards.forEach((card,i)=>{const para=document.createElement('p');para.className='about-refresh__structure-department-detail';para.textContent=longText.repeat(i===0?4:2);card.appendChild(para)});const bounds=cards.map(x=>x.getBoundingClientRect());const grid=feature.querySelector('.about-refresh__structure-departments');const fb=feature.getBoundingClientRect();return {panelHeight:feature.clientHeight,panelScrollHeight:feature.scrollHeight,addedDescriptions:cards.filter(c=>c.querySelector('.about-refresh__structure-department-detail')).length,overflowingCards:cards.filter(c=>c.scrollWidth>c.clientWidth+2||c.scrollHeight>c.clientHeight+2).length,widthDifference:Math.max(...bounds.map(b=>b.width))-Math.min(...bounds.map(b=>b.width)),rowHeightDifference:Math.abs(bounds[0].height-bounds[1].height),gridOverflow:grid.scrollWidth-grid.clientWidth,documentOverflow:document.documentElement.scrollWidth-window.innerWidth,featureOverflow:feature.scrollWidth-feature.clientWidth,featureWidth:fb.width};})()")
      assert.equal(overflowTest.addedDescriptions,5,'Las cinco tarjetas deben aceptar descripciones adicionales')
      assert.ok(overflowTest.panelScrollHeight<=overflowTest.panelHeight+2,
        'Al agregar información, el panel debe aumentar su altura sin cortar el contenido: '+JSON.stringify(overflowTest))
      assert.ok(overflowTest.overflowingCards===0&&overflowTest.gridOverflow<=2&&overflowTest.featureOverflow<=2&&overflowTest.documentOverflow<=3,
        'Los textos largos no deben generar recortes ni desbordamiento horizontal: '+JSON.stringify(overflowTest))
      assert.ok(overflowTest.widthDifference<=2&&overflowTest.rowHeightDifference<=2,
        'Las tarjetas deben conservar anchos iguales y filas alineadas al crecer: '+JSON.stringify(overflowTest))

      await evaluate("document.querySelectorAll('#nuestra-estructura .about-refresh__structure-choice')[3].click(); true")
      await new Promise(resolve => setTimeout(resolve, 550))
      const university = await evaluate("(() => { const root=document.querySelector('#nuestra-estructura');return { selected:root.querySelectorAll('.about-refresh__structure-choice')[3].getAttribute('aria-pressed')==='true',body:root.querySelector('.about-refresh__structure-description')?.textContent?.trim(),deptCount:root.querySelectorAll('.about-refresh__structure-department').length }; })()")
      assert.ok(university.selected && university.body?.length>35 && university.deptCount===0,
        'Universidad corporativa debe ser la cuarta opción, con texto independiente: ' + JSON.stringify(university))
    }
    console.log('PASS Chrome: Nuestra estructura 4 opciones, texto arriba, departamentos 3+2 centrados, claro/oscuro y responsive')

    // Environmental approach lives in its own section, not in the old
    // structure menu. Verify the approved photo/text/three-focus composition
    // in both themes across desktop, tablet and mobile widths.
    for (const width of [1440, 1024, 820, 768, 480, 375]) {
      await send('Emulation.setDeviceMetricsOverride', {
        width, height: 1000, deviceScaleFactor: 1, mobile: false
      })
      const environmentNav = await send('Page.navigate', { url: structureUrl })
      assert.ok(!environmentNav.errorText, 'Chrome no pudo cargar Nosotros para enfoque ambiental')
      let environmentReady = false
      for (let attempt = 0; attempt < 100; attempt++) {
        environmentReady = await evaluate("!!document.querySelector('#enfoque-ambiental .about-refresh__environment-card') && !!document.querySelector('#nuestra-estructura')")
        if (environmentReady) break
        await new Promise(resolve => setTimeout(resolve, 120))
      }
      assert.ok(environmentReady, 'Debe mostrarse Enfoque ambiental en su propia sección a '+width+'px')
      // Trigger lazy image loading before checking its natural dimensions.
      await evaluate("(() => {document.querySelector('#enfoque-ambiental').scrollIntoView({block:'center'}); const img=document.querySelector('#enfoque-ambiental .about-refresh__environment-media img');if(img)img.loading='eager';return true})()")
      let loadedEnvironmentImage=false
      for(let attempt=0; attempt<40; attempt++) {
        loadedEnvironmentImage=await evaluate("(() => { const img=document.querySelector('#enfoque-ambiental .about-refresh__environment-media img');return !!img && img.complete && img.naturalWidth>0 })()")
        if(loadedEnvironmentImage) break
        await new Promise(resolve=>setTimeout(resolve,120))
      }
      assert.ok(loadedEnvironmentImage, 'La fotografía original de las instalaciones debe cargar correctamente a '+width+'px')
      const environment = await evaluate("(() => { const root=document.querySelector('#enfoque-ambiental');const structure=document.querySelector('#nuestra-estructura');const capabilities=document.querySelector('.about-refresh__services');const card=root.querySelector('.about-refresh__environment-card');const media=root.querySelector('.about-refresh__environment-media');const body=root.querySelector('.about-refresh__environment-content');const pillars=[...root.querySelectorAll('.about-refresh__environment-pillar')];const image=media.querySelector('img,video');const title=root.querySelector('h2');const kicker=root.querySelector('.about-refresh__eyebrow');const copy=root.querySelector('.about-refresh__environment-description');return { sectionOrder:structure.compareDocumentPosition(root)&Node.DOCUMENT_POSITION_FOLLOWING?true:false, beforeCapabilities:root.compareDocumentPosition(capabilities)&Node.DOCUMENT_POSITION_FOLLOWING?true:false, title:title?.textContent?.trim(), kicker:kicker?.textContent?.trim(), description:copy?.textContent?.trim(), media:!!image,mediaIsCMS:!!image?.getAttribute('src'), pillars:pillars.length,pillarIcons:pillars.filter(p=>p.querySelector('svg')).length,pillarText:pillars.every(p=>p.textContent?.trim().length>6), gridColumns:getComputedStyle(card).gridTemplateColumns.split(' ').length, pillarsColumns:getComputedStyle(root.querySelector('.about-refresh__environment-pillars')).gridTemplateColumns.split(' ').length, mediaHeight:media.getBoundingClientRect().height, mediaWidth:media.getBoundingClientRect().width, imageNote:media.querySelector('.about-refresh__environment-media-note')?.textContent?.trim(), previousSectionGap:Math.round(root.getBoundingClientRect().top-structure.getBoundingClientRect().bottom), nextSectionGap:Math.round(capabilities.getBoundingClientRect().top-root.getBoundingClientRect().bottom), overflow:card.scrollWidth-card.clientWidth, bodyOverflow:body.scrollWidth-body.clientWidth, documentOverflow:document.documentElement.scrollWidth-window.innerWidth };})()")
      assert.ok(environment.sectionOrder && environment.beforeCapabilities,
        'Enfoque ambiental debe quedar entre estructura y capacidades: '+JSON.stringify(environment))
      assert.ok(environment.title?.length>10 && environment.kicker?.length>8 && environment.description?.length>35,
        'Debe tener antetítulo, título y descripción, con contenido del CMS: '+JSON.stringify(environment))
      assert.ok(environment.media && environment.mediaIsCMS && environment.mediaHeight>=165 && environment.mediaWidth>0,
        'Debe mostrarse la imagen aprobada con tamaño adaptativo: '+JSON.stringify(environment))
      assert.ok(!environment.imageNote, 'Ya no debe mostrarse la etiqueta de imagen ilustrativa')
      const environmentPhoto=await evaluate("(() => {const img=document.querySelector('#enfoque-ambiental .about-refresh__environment-media img');return {url:img?.currentSrc||img?.src||'',width:img?.naturalWidth,height:img?.naturalHeight}})()")
      assert.ok(environmentPhoto.width >= 900 && environmentPhoto.height >= 500,
        'Debe utilizarse la fotografía original de mayor resolución: '+JSON.stringify(environmentPhoto))
      assert.ok(!/environmental-concept/.test(environmentPhoto.url),
        'No debe mostrarse la ilustración de baja resolución')
      assert.ok(environment.previousSectionGap<=1 && environment.nextSectionGap<=1,
        'Las secciones deben ser consecutivas sin márgenes vacíos adicionales: '+JSON.stringify(environment))
      assert.equal(environment.pillars,3,'Deben aparecer los tres ejes ambientales')
      assert.equal(environment.pillarIcons,3,'Los tres ejes deben conservar sus íconos')
      assert.ok(environment.pillarText,'Los ejes deben tener textos descriptivos visibles')
      assert.equal(environment.gridColumns,width<=820?1:2,
        'La sección debe usar dos columnas en escritorio y una en móvil: '+JSON.stringify(environment))
      assert.equal(environment.pillarsColumns,width<=540?1:3,
        'Los ejes deben apilarse verticalmente en celulares pequeños: '+JSON.stringify(environment))
      assert.ok(environment.overflow<=3 && environment.bodyOverflow<=3 && environment.documentOverflow<=3,
        'La sección no debe producir desbordamiento horizontal: '+JSON.stringify(environment))
      const environmentPalette=await evaluate("(() => {const doc=document.documentElement;const wasDark=doc.classList.contains('theme-dark');const card=document.querySelector('#enfoque-ambiental .about-refresh__environment-card');const structure=document.querySelector('#nuestra-estructura .about-refresh__structure-showcase');const heading=document.querySelector('#enfoque-ambiental h2');const kicker=document.querySelector('#enfoque-ambiental .about-refresh__eyebrow');const pillars=document.querySelector('#enfoque-ambiental .about-refresh__environment-pillar');doc.classList.remove('theme-dark');const light={bg:getComputedStyle(card).backgroundImage,title:getComputedStyle(heading).color,kicker:getComputedStyle(kicker).color,pillar:getComputedStyle(pillars).color};doc.classList.add('theme-dark');const dark={bg:getComputedStyle(card).backgroundImage,structureBg:getComputedStyle(structure).backgroundImage,title:getComputedStyle(heading).color,kicker:getComputedStyle(kicker).color,pillar:getComputedStyle(pillars).color};doc.classList.toggle('theme-dark',wasDark);return {light,dark};})()")
      assert.notEqual(environmentPalette.light.bg,environmentPalette.dark.bg,
        'La sección debe adaptar el fondo al modo claro y oscuro: '+JSON.stringify(environmentPalette))
      assert.equal(environmentPalette.dark.bg,environmentPalette.dark.structureBg,
        'En modo oscuro el recuadro ambiental debe usar el mismo degradado de Nuestra estructura')
      assert.equal(environmentPalette.dark.title,'rgb(255, 255, 255)',
        'El título oscuro debe conservar texto blanco legible: '+JSON.stringify(environmentPalette))
      assert.equal(environmentPalette.dark.kicker,'rgb(255, 60, 97)',
        'El antetítulo ambiental debe usar el acento rojo compartido del modo oscuro: '+JSON.stringify(environmentPalette))
      assert.equal(environmentPalette.light.title,'rgb(32, 36, 45)',
        'El título claro debe usar la paleta de texto oscuro: '+JSON.stringify(environmentPalette))
      assert.notEqual(environmentPalette.light.pillar,environmentPalette.dark.pillar,
        'Las etiquetas de los ejes deben conservar el contraste según el modo')
      assert.ok(['Enfoque ambiental','Environmental approach'].includes(environment.title),
        'El título no debe comenzar por Nuestro / Our: '+JSON.stringify(environment.title))
      if (width === 1440 || width === 375) {
        // Verify SVG strokes directly (not only their parent div colors).
        // Parent-only checks previously passed while the icons remained white.
        const iconPaint = await evaluate("(() => {const html=document.documentElement;const wasDark=html.classList.contains('theme-dark');html.classList.add('theme-dark');const inspect=selector=>[...document.querySelectorAll(selector)].map(svg=>({color:getComputedStyle(svg).color,stroke:getComputedStyle(svg).stroke}));const result={environmental:inspect('#enfoque-ambiental .about-refresh__environment-pillar svg'),capabilities:inspect('.about-refresh__capability-icon svg')};html.classList.toggle('theme-dark',wasDark);return result})()")
        assert.equal(iconPaint.environmental.length,3,'Deben existir tres íconos ambientales visibles')
        assert.equal(iconPaint.capabilities.length,5,'Deben existir cinco íconos de capacidades')
        for (const [group,icons] of Object.entries(iconPaint)) {
          assert.ok(icons.every(svg=>svg.color==='rgb(176, 9, 41)' && svg.stroke==='rgb(176, 9, 41)'),
            'Los SVG de '+group+' deben verse rojos, no blancos, a '+width+'px: '+JSON.stringify(icons))
        }
      }
      if (width === 1440) {
        const redPalette = await evaluate("(() => {const doc=document.documentElement;const old=doc.classList.contains('theme-dark');doc.classList.add('theme-dark');const css=s=>getComputedStyle(document.querySelector(s));const mission=css('.about-refresh__purpose-card');const values=css('.about-refresh__value');const badge=css('.about-refresh__purpose-symbol');const valueIcon=css('.about-refresh__value-icon');const capability=css('.about-refresh__capability-icon');const environmental=css('.about-refresh__environment-pillar svg');const eyebrows=[...document.querySelectorAll('.about-refresh__eyebrow')].map(e=>getComputedStyle(e).color);const result={mission:mission.backgroundColor,values:values.backgroundColor,badge:badge.backgroundColor,valueIcon:valueIcon.backgroundColor,badgeGlyph:badge.color,valueGlyph:valueIcon.color,valueGlyphSvg:getComputedStyle(document.querySelector('.about-refresh__value-icon svg')).color,capability:capability.color,environmental:environmental.color,eyebrows};doc.classList.toggle('theme-dark',old);return result;})()")
        assert.equal(redPalette.mission,redPalette.values,
          'Misión y Visión deben tener el mismo fondo oscuro que Valores: '+JSON.stringify(redPalette))
        assert.equal(redPalette.mission,'rgb(17, 27, 49)',
          'Los cuadros de Misión y Visión deben mantener el azul corporativo')
        assert.equal(redPalette.badge,'rgb(176, 9, 41)',
          'Misión y Visión mantienen los recuadros rojos corporativos')
        assert.equal(redPalette.badgeGlyph,'rgb(255, 255, 255)',
          'Los íconos de Misión y Visión deben seguir blancos sobre rojo')
        assert.equal(redPalette.valueIcon,'rgb(65, 34, 60)',
          'Los valores cerrados deben mantener sus recuadros morados originales')
        assert.equal(redPalette.valueGlyph,'rgb(255, 132, 154)',
          'Los valores cerrados conservan sus íconos rosados')
        assert.equal(redPalette.valueGlyphSvg,'rgb(255, 132, 154)',
          'Los SVG de valores cerrados deben verse rosados, no blancos')
        // Opening and closing should toggle ONLY the selected value to red.
        await evaluate("document.querySelector('#nuestros-valores .about-refresh__value-trigger').click(); true")
        await new Promise(resolve=>setTimeout(resolve,100))
        const openValuePalette = await evaluate("(() => {const doc=document.documentElement;const old=doc.classList.contains('theme-dark');doc.classList.add('theme-dark');const cards=[...document.querySelectorAll('#nuestros-valores .about-refresh__value')];const first=cards[0];const result={isOpen:first.classList.contains('is-open'),bg:getComputedStyle(first.querySelector('.about-refresh__value-icon')).backgroundColor,glyph:getComputedStyle(first.querySelector('.about-refresh__value-icon svg')).color,otherBg:getComputedStyle(cards[1].querySelector('.about-refresh__value-icon')).backgroundColor};doc.classList.toggle('theme-dark',old);return result})()")
        assert.ok(openValuePalette.isOpen,'La tarjeta seleccionada debe abrirse')
        assert.equal(openValuePalette.bg,'rgb(176, 9, 41)',
          'Solo el valor abierto debe mostrar el recuadro rojo: '+JSON.stringify(openValuePalette))
        assert.equal(openValuePalette.glyph,'rgb(255, 255, 255)',
          'El valor abierto debe mostrar el ícono blanco')
        assert.equal(openValuePalette.otherBg,'rgb(65, 34, 60)',
          'Las otras tarjetas cerradas deben seguir moradas')
        await evaluate("document.querySelector('#nuestros-valores .about-refresh__value-trigger').click(); true")
        await new Promise(resolve=>setTimeout(resolve,100))
        const closedAgain = await evaluate("(() => {const doc=document.documentElement;const old=doc.classList.contains('theme-dark');doc.classList.add('theme-dark');const first=document.querySelector('#nuestros-valores .about-refresh__value');const result={open:first.classList.contains('is-open'),bg:getComputedStyle(first.querySelector('.about-refresh__value-icon')).backgroundColor};doc.classList.toggle('theme-dark',old);return result})()")
        assert.equal(closedAgain.open,false,'La tarjeta debe volver a cerrarse')
        assert.equal(closedAgain.bg,'rgb(65, 34, 60)','El rojo desaparece al cerrar la tarjeta')
        assert.equal(redPalette.capability,'rgb(176, 9, 41)',
          'Los íconos de Capacidades deben tener el acento rojo')
        assert.equal(redPalette.environmental,'rgb(176, 9, 41)',
          'Los íconos de Enfoque ambiental deben tener el acento rojo')
        assert.ok(redPalette.eyebrows.every(color=>color==='rgb(255, 60, 97)'),
          'Los antetítulos de Sobre nosotros deben ser rojos: '+JSON.stringify(redPalette))
      }
    }
    console.log('PASS Chrome: Enfoque ambiental independiente, CMS, tres ejes, 2 temas y responsive')

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

    // Regression guard: the environmental photo must never intrude into
    // the content column at the intermediate widths reported by the team.
    // Use actual Chrome layout rectangles (not assumptions from CSS source).
    const environmentGeometry = [
      '(() => {',
      "const card=document.querySelector('#enfoque-ambiental .about-refresh__environment-card');",
      "const media=card?.querySelector('.about-refresh__environment-media');",
      "const copy=card?.querySelector('.about-refresh__environment-content');",
      "const heading=copy?.querySelector('h2');",
      "const pillars=copy?.querySelector('.about-refresh__environment-pillars');",
      "if(!card||!media||!copy||!heading||!pillars) return null;",
      "const rect=(el)=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};",
      "return {card:rect(card),media:rect(media),copy:rect(copy),heading:rect(heading),pillars:rect(pillars),cols:getComputedStyle(card).gridTemplateColumns};",
      '})()'
    ].join('\n')
    for (const viewport of [360, 390, 540, 768, 820, 821, 900, 1024, 1100, 1280, 1440, 1680]) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: viewport, height: 950, deviceScaleFactor: 1, mobile: false
      })
      const navigation = await send('Page.navigate', { url: new URL('/nosotros', url).href })
      assert.ok(!navigation.errorText, 'No se pudo abrir Nosotros: ' + navigation.errorText)
      let present = false
      for (let attempt = 0; attempt < 100; attempt++) {
        present = await evaluate("!!document.querySelector('#enfoque-ambiental .about-refresh__environment-content h2')")
        if (present) break
        await new Promise(resolve => setTimeout(resolve, 120))
      }
      assert.ok(present, 'No cargó Enfoque ambiental a ' + viewport + 'px')
      for (const dark of [false, true]) {
        await evaluate("document.documentElement.classList." + (dark ? 'add' : 'remove') + "('theme-dark'); true")
        // Additional CMS copy can make the text column taller than the image.
        // Test it without writing to the CMS or changing published content.
        for (const extended of (viewport >= 821 && viewport <= 1280 ? [false, true] : [false])) {
          await evaluate("(() => { const p=document.querySelector('#enfoque-ambiental .about-refresh__environment-description'); if (!p.dataset.originalText) p.dataset.originalText=p.textContent; p.textContent=p.dataset.originalText" + (extended ? " + ' Más información ambiental publicada desde el CMS.'.repeat(12)" : "") + "; return true })()")
          const layout = await evaluate(environmentGeometry)
          const label = viewport + 'px, ' + (dark ? 'oscuro' : 'claro') + (extended ? ', texto extendido' : '')
          assert.ok(layout, 'No se pudo medir Enfoque ambiental: ' + label)
          assert.ok(layout.media.width > 80 && layout.copy.width > 80,
            'Imagen o columna de texto sin tamaño útil: ' + label + ' ' + JSON.stringify(layout))
          assert.ok(layout.media.left >= layout.card.left - 2 &&
                    layout.media.right <= layout.card.right + 2 &&
                    layout.copy.left >= layout.card.left - 2 &&
                    layout.copy.right <= layout.card.right + 2,
            'Imagen o contenido fuera de su tarjeta: ' + label + ' ' + JSON.stringify(layout))
          if (viewport > 820) {
            assert.ok(layout.media.right + 6 <= layout.copy.left,
              'La imagen invade el texto en dos columnas: ' + label + ' ' + JSON.stringify(layout))
          } else {
            assert.ok(layout.media.bottom + 2 <= layout.copy.top,
              'La imagen invade el texto apilado: ' + label + ' ' + JSON.stringify(layout))
          }
          assert.ok(layout.heading.left >= layout.copy.left - 2 &&
                    layout.heading.right <= layout.copy.right + 2 &&
                    layout.pillars.left >= layout.copy.left - 2 &&
                    layout.pillars.right <= layout.copy.right + 2,
            'Título o íconos fuera de la columna de texto: ' + label + ' ' + JSON.stringify(layout))
        }
      }
    }
    console.log('PASS Chrome: Enfoque ambiental sin imagen sobre el texto a 360-1680px, ambos temas y CMS extendido')



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
