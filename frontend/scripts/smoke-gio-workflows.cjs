#!/usr/bin/env node
// Browser-level contract: GIO does not submit a quote before confirmation or expose
// unscoped Dynamics shipment data to a signed-in customer.
'use strict'
const assert = require('node:assert/strict')
const http = require('node:http')
const os = require('node:os')
const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const WebSocket = require('ws')

const frontend = path.resolve(__dirname, '..')
const host = '127.0.0.1'
let role = null
let quoteWrites = []
let trackingReads = 0
let itineraryReads = 0
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function chromeBinary() {
  for (const name of [process.env.CHROME_BIN, 'google-chrome', 'chromium', 'chromium-browser'].filter(Boolean)) {
    const result = spawnSync('which', [name], { encoding: 'utf8' })
    if (result.status === 0) return result.stdout.trim()
  }
  throw Error('Chrome or Chromium is required')
}
const api = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  const send = (status, data) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(data))
  }
  if (url.pathname === '/api/auth/me') return role
    ? send(200, {correo:'test@example.invalid',role,nombre:'Smoke Test'})
    : send(401,{error:'Unauthorized'})
  if (url.pathname === '/api/content/site') return send(200,{})
  if (url.pathname === '/api/content/news') return send(200,[])
  if (url.pathname === '/api/assistant/quote-locations' || url.pathname === '/api/quotes/official/locations') {
    const source = url.searchParams.get('routeRole')
    const item = source === 'origin'
      ? {id:'11111111-1111-1111-1111-111111111111',displayName:'Shanghái',code:'SHA'}
      : {id:'22222222-2222-2222-2222-222222222222',displayName:'Puerto Caldera',code:'CAL'}
    return send(200,{items:[item]})
  }
  if (url.pathname === '/api/quotes/official' && req.method === 'POST') {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    quoteWrites.push(JSON.parse(Buffer.concat(chunks).toString()))
    return send(201,{id:'33333333-3333-3333-3333-333333333333',status:'Received'})
  }
  if (url.pathname === '/api/assistant/itinerary-locations') {
    const isOrigin = url.searchParams.get('routeRole') === 'origin'
    const name = isOrigin ? 'Shanghái' : 'Puerto Caldera'
    return send(200,{items:[{id:name,displayName:name,code:null}]})
  }
  if (url.pathname === '/api/itinerarios') {
    itineraryReads++
    return send(200,{items:[{id:'44444444-4444-4444-4444-444444444444',
      pol:'Shanghái',pod:'Puerto Caldera',etd:'2026-11-20',eta:'2026-12-05',
      transport:'maritime',modality:'FCL',status:'planning'}],total:1,page:1,pageSize:5,totalPages:1})
  }
  if (url.pathname === '/api/tracking/dynamics/search') {
    trackingReads++
    return send(200,{records:[{title:'Private shipment',status:'In transit'}],truncated:false})
  }
  send(404,{error:'not mocked'})
})
function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error',reject)
    server.listen(0,host,()=>resolve(server.address().port))
  })
}
function close(server) { return new Promise(resolve => server.close(resolve)) }
async function waitFor(fn, timeout = 14000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    try { const result = await fn(); if (result) return result } catch { /* browser not ready yet */ }
    await sleep(140)
  }
  throw Error('Timed out waiting for GIO / Chrome')
}
function launch(bin,args,opts) {
  const child = spawn(bin,args,opts)
  child.on('error', err => { process.stderr.write(String(err) + '\n') })
  return child
}
async function main() {
  let vite, chrome, socket
  const profile = fs.mkdtempSync(path.join(os.tmpdir(),'gio-ops-cdp-'))
  const debugPort = 9318
  try {
    const apiPort = await listen(api)
    vite = launch(process.execPath,[path.join(frontend,'node_modules/vite/bin/vite.js'),
      '--host',host,'--port','5189','--strictPort'],{
      cwd:frontend,env:{...process.env,VITE_API_PROXY_TARGET:'http://'+host+':'+apiPort},stdio:'ignore'
    })
    await waitFor(async () => {
      const res = await fetch('http://'+host+':5189/')
      return res.ok
    },24000)
    chrome = launch(chromeBinary(),[
      '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--disable-background-networking','--disable-extensions',
      '--remote-allow-origins=*','--remote-debugging-port='+debugPort,
      '--user-data-dir='+profile,'about:blank'
    ],{stdio:'ignore'})
    const target = await waitFor(async () => {
      const res = await fetch('http://'+host+':'+debugPort+'/json/list')
      const items = await res.json()
      return items.find(item => item.type === 'page' && item.webSocketDebuggerUrl)
    },16000)
    socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve,reject) => { socket.once('open',resolve); socket.once('error',reject) })
    let next = 1
    const pending = new Map()
    socket.on('message', data => {
      const m = JSON.parse(data.toString())
      if (m.id && pending.has(m.id)) { const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result) }
    })
    const cdp = (method,params={}) => new Promise((resolve,reject)=>{
      const id = next++
      pending.set(id,{resolve,reject})
      socket.send(JSON.stringify({id,method,params}))
    })
    const evaluate = async expression => {
      const data = await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
      if (data.exceptionDetails) throw Error('Chrome JS error: '+data.exceptionDetails.text)
      return data.result?.value
    }
    const click = async selector => evaluate('(()=>{const b=document.querySelector('+JSON.stringify(selector)+');if(!b)return false;b.click();return true})()')
    const has = text => evaluate('document.body.innerText.includes('+JSON.stringify(text)+')')
    const choose = async text => {
      const ok = await waitFor(()=>evaluate('(()=>{const b=[...document.querySelectorAll(".gio-ops__choices button")].find(x=>x.textContent.trim().includes('+JSON.stringify(text)+'));if(!b)return false;b.click();return true})()'))
      assert.ok(ok,'Missing choice: '+text)
      await sleep(70)
    }
    const confirm = async () => {
      await waitFor(()=>evaluate('!!document.querySelector(".gio-ops__confirmation")'))
      assert.ok(await click('.gio-ops__confirm-actions .gio-ops__primary'),'Missing confirm control')
      await sleep(70)
    }
    const answer = async text => {
      const ok = await waitFor(()=>evaluate('(()=>{const field=document.querySelector(".gio-ops__form input");if(!field)return false;const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;setter.call(field,'+JSON.stringify(text)+');field.dispatchEvent(new Event("input",{bubbles:true}));field.closest("form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));return true})()'))
      assert.ok(ok,'Missing answer field for '+text)
      await confirm()
    }
    await cdp('Page.enable')
    await cdp('Runtime.enable')
    await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
    await cdp('Page.navigate',{url:'http://'+host+':5189/'})
    await waitFor(()=>evaluate('!!document.querySelector(".site-assistant__mascot")'))
    assert.ok(await click('.site-assistant__mascot'))
    await waitFor(()=>evaluate('document.querySelectorAll(".site-assistant__quick button").length===4'))
    const compactWidth = await evaluate('document.querySelector(".site-assistant__panel").getBoundingClientRect().width')
    assert.ok(await click('.site-assistant__resize button[aria-label="Agrandar ventana de GIO"]'))
    const expandedWidth = await evaluate('document.querySelector(".site-assistant__panel").getBoundingClientRect().width')
    assert.ok(expandedWidth > compactWidth, 'Window should expand on desktop')
    assert.ok(await click('.site-assistant__resize button[aria-label="Agrandar ventana de GIO"]'))
    const wideWidth = await evaluate('document.querySelector(".site-assistant__panel").getBoundingClientRect().width')
    assert.ok(wideWidth > expandedWidth, 'The third size should be larger than medium')
    assert.ok(await click('.site-assistant__resize button[aria-label="Encoger ventana de GIO"]'))
    assert.ok(await click('.site-assistant__resize button[aria-label="Encoger ventana de GIO"]'))
    const reducedWidth = await evaluate('document.querySelector(".site-assistant__panel").getBoundingClientRect().width')
    assert.equal(Math.round(reducedWidth),Math.round(compactWidth),'The initial window size is the minimum')
    assert.ok(await evaluate('document.querySelectorAll(".site-assistant__quick button")[0].click()||true'))
    await waitFor(()=>evaluate('document.querySelectorAll(".gio-ops__choices button").length >= 3'))
    await choose('Marítimo')
    await choose('FCL')
    await waitFor(()=>evaluate('!!document.querySelector(".gio-ops__location-list button")'))
    const placement = await evaluate('(()=>{const dock=document.querySelector(".gio-ops__location-dock").getBoundingClientRect();const input=document.querySelector(".gio-ops__form").getBoundingClientRect();const btn=document.querySelector(".gio-ops__location-list button").getBoundingClientRect();return {aboveInput:dock.bottom<=input.top+2,visible:btn.top>=dock.top && btn.bottom<=dock.bottom+2,codeVisible:!!document.querySelector(".gio-ops__location-list button small")}})()')
    assert.ok(placement.aboveInput && placement.visible,'Suggestions must remain visible above composer in the compact panel')
    assert.equal(placement.codeVisible,false,'Never display import codes such as VIDEO-SEA')
    await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
    // Layout and enter animation should settle before checking mobile geometry.
    await sleep(1100)
    const mobilePlacement = await evaluate('(()=>{const dock=document.querySelector(".gio-ops__location-dock").getBoundingClientRect();const input=document.querySelector(".gio-ops__form").getBoundingClientRect();const btn=document.querySelector(".gio-ops__location-list button").getBoundingClientRect();const size=window.innerWidth;return {size,dockTop:dock.top,dockBottom:dock.bottom,dockHeight:dock.height,inputTop:input.top,inputBottom:input.bottom,inputHeight:input.height,viewport:innerHeight,aboveInput:dock.bottom<=input.top+2,visible:btn.top>=dock.top && btn.bottom<=dock.bottom+2,keyboardSpace:input.bottom<=innerHeight+2}})()')
    assert.ok(mobilePlacement.size<=800 && mobilePlacement.aboveInput && mobilePlacement.visible && mobilePlacement.keyboardSpace,'Mobile suggestions and composer must remain visible: ' + JSON.stringify(mobilePlacement))
    await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
    await sleep(120)
    assert.ok(await evaluate('(()=>{const field=document.querySelector(".gio-ops__form input"); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;setter.call(field,"es pan");field.dispatchEvent(new Event("input",{bubbles:true}));field.closest("form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));return true})()'))
    await waitFor(()=>has('No puedo aceptar lugares sin verificar'))
    assert.equal(await evaluate('!!document.querySelector(".gio-ops__confirmation")'),false,'Unverified origins must never advance')
    assert.ok(await evaluate('(()=>{const field=document.querySelector(".gio-ops__form input");const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;setter.call(field,"");field.dispatchEvent(new Event("input",{bubbles:true}));return true})()'))
    await choose('Shanghái')
    await confirm()
    await waitFor(()=>evaluate('!!document.querySelector(".gio-ops__location-list button")'))
    await choose('Puerto Caldera')
    await confirm()
    await choose('FOB')
    await answer('2026-11-20')
    assert.ok(await evaluate('(()=>{const field=document.querySelector(".gio-ops__form input");const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;setter.call(field,"es pan");field.dispatchEvent(new Event("input",{bubbles:true}));field.closest("form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));return true})()'))
    await waitFor(()=>has('¿Está correcto?'))
    assert.ok(await click('.gio-ops__confirm-actions .gio-ops__secondary'),'Correction control missing')
    await answer('Electrodomésticos')
    await choose('No')
    await waitFor(()=>evaluate('!!document.querySelector(".gio-ops__choices button")'))
    assert.equal(await evaluate('!!document.querySelector(".gio-ops__form input")'),false,'Equipment size must use official choices')
    await choose('40 pies')
    await choose('Dry Van')
    await answer('1')
    await answer('8000')
    await answer('Test Client')
    await answer('test@example.invalid')
    await answer('+506 2272 6772')
    await waitFor(()=>has('Confirmar y enviar solicitud'))
    const editContact = await evaluate('(()=>{const row=[...document.querySelectorAll(".gio-ops__card dl>div")].find(x=>x.querySelector("dt")?.textContent==="Contacto");if(!row)return false;row.querySelector(".gio-ops__edit").click();return true})()')
    assert.ok(editContact,'User must be able to edit a specific field')
    await answer('Edited Client')
    await waitFor(()=>has('Confirmar y enviar solicitud'))
    assert.equal(quoteWrites.length,0,'Quote sent without user confirmation')
    await click('.gio-ops__primary')
    await waitFor(()=>has('33333333-3333-3333-3333-333333333333'))
    assert.equal(quoteWrites.length,1,'Guest quote must be created exactly once')
    const guestReceipt = await evaluate('(()=>{try{return JSON.parse(sessionStorage.getItem("gcf-gio-quote-receipt-v1")||"null")}catch{return null}})()')
    assert.equal(guestReceipt?.id,'33333333-3333-3333-3333-333333333333','Guest must retain the issued receipt')
    assert.equal(quoteWrites[0].shipmentType,'FCL')
    assert.equal(quoteWrites[0].equipment[0].size,'40 pies')
    assert.equal(quoteWrites[0].equipment[0].type,'Dry Van')
    assert.equal(quoteWrites[0].contactName,'Edited Client')
    assert.deepEqual(quoteWrites[0].equipment[0].unitWeightsKg,[8000])
    assert.equal(quoteWrites[0].originLocationId,'11111111-1111-1111-1111-111111111111')
    assert.equal(quoteWrites[0].destinationLocationId,'22222222-2222-2222-2222-222222222222')
    assert.ok(await evaluate(`!!document.querySelector('.gio-ops__card a[href="/cotizaciones?gioReceipt=1"]')`),'Guest must see the direct quote receipt link')
    // Reuse confirmed fields to request a distinct quote as an admin.
    role = 'administrador'
    const newQuote = await evaluate('(()=>{const b=[...document.querySelectorAll(".gio-ops__secondary")].find(x=>x.textContent.includes("Nueva consulta"));if(!b)return false;b.click();return true})()')
    assert.ok(newQuote,'Missing new query')
    await choose('Marítimo')
    await waitFor(()=>has('Confirmar y enviar solicitud'))
    await click('.gio-ops__primary')
    await waitFor(()=>evaluate(`!!document.querySelector('.gio-ops__card a[href*="cotizaciones-oficiales?quote="]')`))
    assert.equal(quoteWrites.length,2,'Admin second quote should be submitted once')
    role = null
    await click('.gio-ops__back')
    await waitFor(()=>evaluate('document.querySelectorAll(".site-assistant__quick button").length===4'))
    await evaluate('document.querySelectorAll(".site-assistant__quick button")[2].click()')
    await waitFor(()=>evaluate('!!document.querySelector(".gio-ops__location-list button")'))
    await choose('Shanghái')
    await confirm()
    await waitFor(()=>evaluate('!!document.querySelector(".gio-ops__location-list button")'))
    await choose('Puerto Caldera')
    await confirm()
    await choose('Marítimo')
    await choose('Omitir')
    await waitFor(()=>has('Consultar'))
    await click('.gio-ops__primary')
    await waitFor(()=>has('2026-12-05'))
    assert.equal(itineraryReads,1,'Public itinerary API should be called exactly once')
    const itineraryLink = await evaluate('document.querySelector(".gio-ops__card a[href^=\"/itinerario?\"]")?.getAttribute("href") || ""')
    const itineraryParams = new URL(itineraryLink || '/itinerario', 'http://example.invalid').searchParams
    assert.equal(itineraryParams.get('pol'),'Shanghái','GIO must hand off the searched origin')
    assert.equal(itineraryParams.get('pod'),'Puerto Caldera','GIO must hand off the searched destination')
    assert.equal(itineraryParams.get('transporte'),'maritime','GIO must hand off the transport mode')
    await click('.gio-ops__back')
    role = 'cliente'
    await waitFor(()=>evaluate('document.querySelectorAll(".site-assistant__quick button").length===4'))
    await evaluate('document.querySelectorAll(".site-assistant__quick button")[1].click()')
    await choose('BCF / BL / HBL')
    await answer('GCF2026-00515')
    await click('.gio-ops__primary')
    await waitFor(()=>has('verificación adicional de titularidad'))
    assert.equal(trackingReads,0,'Customer shipment must not call unscoped Dynamics lookup')
    console.log('PASS: guest quotes, verified equipment choices, GIO receipt, admin direct link, public itineraries, and tracking guards')
  } finally {
    try { socket?.close() } catch {}
    if (chrome) chrome.kill('SIGKILL')
    if (vite) vite.kill('SIGKILL')
    await close(api)
    // Chrome may still be flushing its profile after SIGKILL; do not fail an otherwise
    // successful business-flow test solely because temporary cleanup raced that exit.
    try { fs.rmSync(profile,{recursive:true,force:true,maxRetries:12,retryDelay:250}) }
    catch (e) { console.warn('Chrome temporary profile cleanup:', e.message) }
  }
}
main().catch(error => { console.error(error); process.exitCode=1 })
