#!/usr/bin/env node
// Real Chrome smoke of the unchanged four-step OfficialQuoteWizard using a
// localhost-only fake Dhole OPTIONS API. Never contacts the Dhole provider,
// never uses credentials, and never writes to any PostgreSQL database.
'use strict'
const assert = require('node:assert/strict')
const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { spawn, spawnSync } = require('node:child_process')
const WebSocket = require('ws')

const frontend = path.resolve(__dirname, '..')
const host = '127.0.0.1'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
let posts = []
let optionsReads = 0
let legacyLocationReads = 0
let upstreamIsDown = false
let explicitlyLegacy = false
const originId = '11111111-1111-4111-8111-111111111111'
const destId = '22222222-2222-4222-8222-222222222222'
const podId = '33333333-3333-4333-8333-333333333333'
const confirmationId = '44444444-4444-4444-8444-444444444444'

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}
const api = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  if (url.pathname === '/api/auth/me') return send(res, 401, { error: 'Guest' })
  if (url.pathname === '/api/content/site') return send(res, 200, [])
  if (url.pathname === '/api/content/news') return send(res, 200, [])
  if (url.pathname === '/api/quotes/official/dhole-options') {
    optionsReads++
    if (upstreamIsDown) return send(res, 503, {code:'catalog_upstream_unavailable'})
    if (explicitlyLegacy) return send(res, 404, {code:'dhole_form_disabled'})
    return send(res, 200, {
      source: 'dhole',
      mode: url.searchParams.get('mode'),
      shipmentType: url.searchParams.get('shipmentType'),
      incoterms: ['CIF', 'FOB'],
      origins: [{id:originId, displayName:'Origen Dhole', code:'O-DHOLE'}],
      destinations: [{id:destId, displayName:'Destino Dhole', code:'D-DHOLE'}],
      pods: [{id:podId, displayName:'POD Dhole', code:'P-DHOLE'}],
      equipmentSizes: [
        {value:'20 pies',label:'20 pies'},
        {value:'45 pies',label:'45 pies'}
      ],
      equipmentTypesBySize: {
        '20 pies':['Dry Van','High Cube'],
        '45 pies':['High Cube']
      }
    })
  }
  if (url.pathname === '/api/quotes/official/locations') {
    legacyLocationReads++
    const role = url.searchParams.get('routeRole')
    return send(res, 200, {items: [{
      id: role==='origin' ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        : 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      displayName: role==='origin' ? 'Origen LOCAL' : 'Destino LOCAL',
      code:null
    }]})
  }
  if (url.pathname === '/api/quotes/official' && req.method === 'POST') {
    const parts = []
    for await (const part of req) parts.push(part)
    const data = JSON.parse(Buffer.concat(parts).toString('utf8'))
    posts.push(data)
    return send(res, 201, {id:confirmationId,status:'Received'})
  }
  return send(res, 404, {error:'Not in isolated mock'})
})
const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, host, () => resolve(server.address().port))
})
const close = server => new Promise(resolve => server.close(resolve))
const bin = () => {
  for (const name of [process.env.CHROME_BIN,'google-chrome','chromium','chromium-browser'].filter(Boolean)) {
    const result = spawnSync('which', [name], {encoding:'utf8'})
    if (result.status===0) return result.stdout.trim()
  }
  throw Error('Chrome/Chromium is needed by this isolated browser smoke')
}
async function waitFor(check, description, timeout=18000) {
  const start=Date.now()
  while(Date.now()-start<timeout) {
    try { if(await check()) return } catch { /* still rendering */ }
    await sleep(120)
  }
  throw Error('Timed out: '+description)
}
async function main() {
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'dhole-wizard-cdp-'))
  let vite, chrome, socket, evaluate
  const artifacts=path.resolve(frontend,'../artifacts/dhole-quote-visual')
  try {
    const apiPort=await listen(api)
    vite=spawn(process.execPath,[path.join(frontend,'node_modules/vite/bin/vite.js'),
      '--host',host,'--port','5194','--strictPort'], {
      cwd:frontend,env:{...process.env,VITE_OFFICIAL_QUOTES_ENABLED:'true',
        VITE_API_PROXY_TARGET:'http://'+host+':'+apiPort},stdio:'ignore'
    })
    await waitFor(async()=> (await fetch('http://'+host+':5194/cotizaciones')).ok,
      'Vite server',24000)

    chrome=spawn(bin(),[
      '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--disable-background-networking','--disable-extensions',
      '--remote-allow-origins=*','--remote-debugging-port=0',
      '--user-data-dir='+profile,'about:blank'
    ],{stdio:'ignore'})
    let debugPort=0
    await waitFor(async()=>{
      try { debugPort=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]) } catch {}
      return debugPort>0
    },'Chrome debugging port')
    const target=await (await fetch('http://'+host+':'+debugPort+'/json/list')).json()
    const page=target.find(t=>t.type==='page' && t.webSocketDebuggerUrl)
    assert.ok(page,'Chrome page target missing')
    socket=new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject)})
    let seq=0
    const pending=new Map()
    socket.on('message',data=>{
      const msg=JSON.parse(data.toString())
      if(!msg.id||!pending.has(msg.id)) return
      const p=pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? p.reject(Error(msg.error.message)) : p.resolve(msg.result)
    })
    const cdp=(method,params={})=>new Promise((resolve,reject)=>{
      const id=++seq
      pending.set(id,{resolve,reject})
      socket.send(JSON.stringify({id,method,params}))
    })
    evaluate=async expression=>{
      const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
      if(r.exceptionDetails) throw Error('Chrome eval: '+r.exceptionDetails.text)
      return r.result?.value
    }
    const exists=selector=>evaluate('!!document.querySelector('+JSON.stringify(selector)+')')
    const click=async selector=>{
      const result=await evaluate('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');if(!el)return false;el.scrollIntoView({block:"center",behavior:"instant"});el.click();return true})()')
      assert.ok(result,'Could not click '+selector)
    }
    const value=async(selector,text)=>{
      const result=await evaluate('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');if(!el)return false;const setter=Object.getOwnPropertyDescriptor(el.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,"value").set;setter.call(el,'+JSON.stringify(text)+');el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));return true})()')
      assert.ok(result,'Cannot enter '+selector)
    }
    const chooseMode=async text=>{
      const success=await evaluate('(()=>{const el=[...document.querySelectorAll(".official-choices .official-choice")].find(b=>b.textContent.includes('+JSON.stringify(text)+'));if(!el)return false;el.click();return true})()')
      assert.ok(success,'Missing selectable choice '+text)
    }
    const selectDropdown=async(id,label)=>{
      await click('#'+id)
      await waitFor(()=>exists('#'+id+'-options [role=option]'),'Dropdown '+id)
      const success=await evaluate('(()=>{const el=[...document.querySelectorAll('+JSON.stringify('#'+id+'-options [role=option]')+')].find(b=>b.textContent.trim()==='+JSON.stringify(label)+');if(!el)return false;el.click();return true})()')
      assert.ok(success,'Missing dropdown option '+id+': '+label)
      await sleep(60)
    }
    const screenshot=async name=>{
      fs.mkdirSync(artifacts,{recursive:true})
      await evaluate('window.scrollTo({top:0,behavior:"instant"})')
      await sleep(270)
      const pic=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
      fs.writeFileSync(path.join(artifacts,name),Buffer.from(pic.data,'base64'))
    }
    await cdp('Page.enable')
    await cdp('Runtime.enable')
    await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
    await cdp('Page.navigate',{url:'http://'+host+':5194/cotizaciones'})
    await waitFor(()=>exists('.official-page .official-choice'),'Official form initial render')
    assert.equal(await evaluate('document.querySelectorAll(".official-progress-item").length'),4,
      'Keep the original four steps')
    await chooseMode('Marítimo')
    await click('.official-primary')
    await waitFor(()=>exists('.official-choice'),'Select shipment')
    await chooseMode('FCL')
    await click('.official-primary')
    await waitFor(()=>exists('#quote-origin'),'Real route step')
    assert.ok(optionsReads>0,'Form must request dynamic Dhole catalogue')
    assert.equal(legacyLocationReads,0,'Dhole route must not mix local location IDs')
    await click('#quote-origin')
    await waitFor(()=>exists('#quote-origin-options button'),'Origin choices')
    await click('#quote-origin-options li button')
    await click('#quote-destination')
    await waitFor(()=>exists('#quote-destination-options button'),'Destination choices')
    await click('#quote-destination-options li button')
    assert.equal(await evaluate('document.querySelector("#quote-origin").value'),'Origen Dhole')
    assert.equal(await evaluate('document.querySelector("#quote-destination").value'),'Destino Dhole')
    await selectDropdown('quote-incoterm','CIF')
    const future=new Date(Date.now()+30*86400000).toISOString().slice(0,10)
    await value('input[type=date]',future)
    await selectDropdown('quote-equipment-size-0','45 pies')
    await click('#quote-equipment-type-0')
    await waitFor(()=>exists('#quote-equipment-type-0-options [role=option]'),'Equipment types')
    const labels=await evaluate('[...document.querySelectorAll("#quote-equipment-type-0-options [role=option]")].map(b=>b.textContent.trim())')
    assert.ok(labels.includes('High Cube') && !labels.includes('Dry Van'),
      'A 45-foot container must NOT offer the incompatible Dry Van type')
    await click('#quote-equipment-type-0-options [role=option]:last-child')
    await value('.official-line input[type=number][min="0.001"]','1300')

    const overflow=await evaluate('({viewport:window.innerWidth,scroll:document.documentElement.scrollWidth})')
    assert.ok(overflow.scroll<=overflow.viewport+3,'Desktop route layout overflows: '+JSON.stringify(overflow))
    await screenshot('wizard-desktop-light.png')

    await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
    await sleep(450)
    const mobile=await evaluate('({viewport:window.innerWidth,scroll:document.documentElement.scrollWidth,form:!!document.querySelector("#quote-origin"),steps:document.querySelectorAll(".official-progress-item").length})')
    assert.ok(mobile.viewport<=400&&mobile.scroll<=mobile.viewport+3&&mobile.form&&mobile.steps===4,
      'Mobile route clipped or missing controls: '+JSON.stringify(mobile))
    await screenshot('wizard-mobile-light.png')
    await evaluate('document.documentElement.classList.add("theme-dark")')
    await sleep(450)
    const dark=await evaluate('(()=>{const el=document.querySelector(".official-panel");const style=getComputedStyle(el);return {text:style.color,background:style.backgroundImage,root:document.documentElement.className}})()')
    assert.ok(dark.root.includes('theme-dark') && dark.text==='rgb(255, 255, 255)' && dark.background!=='none',
      'Dark mode lacks required visual contrast: '+JSON.stringify(dark))
    await screenshot('wizard-mobile-dark.png')
    await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
    await evaluate('document.documentElement.classList.remove("theme-dark")')
    await click('.official-primary')
    await waitFor(()=>exists('.official-fields textarea[maxlength="4000"]'),'Step four cargo')
    await value('.official-fields textarea[maxlength="4000"]','CI cargo mock')
    await value('input[autocomplete=name]','Cliente CI')
    await value('input[autocomplete=email]','ci-quote@example.invalid')
    await value('input[autocomplete=tel]','+506 2222 2222')
    assert.equal(posts.length,0,'Wizard must never submit before the user presses Submit')
    await click('.official-primary')
    await waitFor(()=>exists('.official-success'),'Successful submit and receipt')
    assert.equal(posts.length,1,'Exactly one request was sent')
    assert.equal(posts[0].catalogSource,'dhole','Browser sends catalogSource Dhole')
    assert.equal(posts[0].originLocationId,originId,'Browser sends POL external UUID')
    assert.equal(posts[0].destinationLocationId,destId,'Browser sends POE external UUID')
    assert.equal(posts[0].equipment[0].size,'45 pies')
    assert.equal(posts[0].equipment[0].type,'High Cube')
    assert.equal(posts[0].contactName,'Cliente CI')
    assert.ok(await evaluate('document.body.innerText.includes('+JSON.stringify(confirmationId)+')'),'Receipt shows mock id')
    assert.equal(legacyLocationReads,0,'Form never called local catalogue during Dhole success')
    console.log('PASS Chrome: four-step wizard preserves external UUID, pair-restricted equipment, responsive/dark mode and receipt')

    // Any live Dhole outage must block progression, not silently revert to
    // outdated local UUIDs. A fresh navigation resets the Vue form.
    upstreamIsDown=true
    await cdp('Page.navigate',{url:'http://'+host+':5194/cotizaciones?check=upstream-outage'})
    await waitFor(()=>exists('.official-choice'),'Outage scenario initial render')
    await chooseMode('Aéreo')
    await click('.official-primary')
    await waitFor(()=>exists('.official-choice'),'Air shipment type')
    await chooseMode('LCL')
    await click('.official-primary')
    await waitFor(()=>exists('.official-error'),'Upstream unavailable warning')
    assert.equal(await evaluate('document.querySelector(".official-progress-item.current")?.textContent.includes("2")'),true,
      'Outage must keep wizard on step two')
    assert.equal(legacyLocationReads,0,'Outage must not request legacy locations')
    assert.equal(posts.length,1,'Outage must not submit a second quote')
    console.log('PASS Chrome: failure of Dhole catalogue blocks route, no unsafe local fallback')

    upstreamIsDown=false
    explicitlyLegacy=true
    await cdp('Page.navigate',{url:'http://'+host+':5194/cotizaciones?check=flag-disabled'})
    await waitFor(()=>exists('.official-choice'),'Flag-disabled scenario initial render')
    await chooseMode('Marítimo')
    await click('.official-primary')
    await waitFor(()=>exists('.official-choice'),'Flag-disabled FCL select')
    await chooseMode('FCL')
    await click('.official-primary')
    await waitFor(()=>exists('#quote-origin'),'Flag-disabled route step')
    assert.ok(legacyLocationReads>=2,'Only explicit dhole_form_disabled should load the existing local route')
    console.log('PASS Chrome: explicit feature-disabled 404 preserves original legacy wizard behavior')
    console.log('PASS Chrome: mock-only traffic; no real Dhole API, production database or email')
  } catch(error) {
    if(evaluate) {
      try { console.error('Browser diagnostic:',(await evaluate('document.body.innerText.slice(-1400)')).slice(0,1400)) } catch {}
    }
    throw error
  } finally {
    socket?.close()
    chrome?.kill()
    vite?.kill()
    await close(api).catch(()=>{})
    fs.rmSync(profile,{recursive:true,force:true})
  }
}
main().catch(error=>{console.error(error);process.exitCode=1})
