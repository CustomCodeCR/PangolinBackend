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
let postKeys = []
let optionsReads = 0
let legacyLocationReads = 0
let upstreamIsDown = false
let explicitlyLegacy = false
let optionsDelayMs = 0
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
    if (optionsDelayMs) await sleep(optionsDelayMs)
    if (upstreamIsDown) return send(res, 503, {code:'catalog_upstream_unavailable'})
    if (explicitlyLegacy) return send(res, 404, {code:'dhole_form_disabled'})
    return send(res, 200, {
      source: 'dhole',
      clientCreateIdempotencyEnabled: true,
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
    postKeys.push(String(req.headers['x-cf-quote-request-key'] || ''))
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
  let profile=fs.mkdtempSync(path.join(os.tmpdir(),'dhole-wizard-cdp-'))
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

    // Shared GitHub runners occasionally need a second Chrome launch even when
    // Vite is already ready. Retry once with a fresh, isolated profile. Keep
    // browser stderr bounded so a failed test identifies Chrome vs. UI errors.
    let debugPort=0
    for (let attempt=1; attempt<=2; attempt++) {
      let stderr=''
      let launchError=null
      chrome=spawn(bin(),[
        '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--disable-background-networking','--disable-extensions',
        '--remote-allow-origins=*','--remote-debugging-port=0',
        '--user-data-dir='+profile,'about:blank'
      ],{stdio:['ignore','ignore','pipe']})
      chrome.on('error',error => { launchError=error })
      chrome.stderr.on('data',chunk => { stderr=(stderr+chunk.toString()).slice(-3000) })
      try {
        await waitFor(async()=>{
          if (launchError || chrome.exitCode !== null) return false
          try { debugPort=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]) } catch {}
          return debugPort>0
        },'Chrome debugging port',30000)
        break
      } catch (error) {
        console.warn('Chrome launch '+attempt+' failed:',launchError?.message || error.message)
        if (stderr) console.warn('Chrome stderr (last 3000 chars):',stderr)
        chrome.kill()
        if (attempt===2) throw error
        try { fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200}) } catch {}
        profile=fs.mkdtempSync(path.join(os.tmpdir(),'dhole-wizard-cdp-'))
        debugPort=0
      }
    }
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
    const screenshot=async (name,focusSelector=null)=>{
      fs.mkdirSync(artifacts,{recursive:true})
      if (focusSelector) {
        const focused=await evaluate('(()=>{const el=document.querySelector('+JSON.stringify(focusSelector)+');if(!el)return false;el.scrollIntoView({block:"center",behavior:"instant"});return true})()')
        assert.ok(focused,'Screenshot target missing: '+focusSelector)
      } else await evaluate('window.scrollTo({top:0,behavior:"instant"})')
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
    await click('#quote-origin + .official-location-toggle')
    await waitFor(()=>exists('#quote-origin-options button'),'Origin choices')
    await click('#quote-origin-options li button')
    await click('#quote-destination + .official-location-toggle')
    await waitFor(()=>exists('#quote-destination-options button'),'Destination choices')
    await click('#quote-destination-options li button')
    assert.equal(await evaluate('document.querySelector("#quote-origin").value'),'Origen Dhole')
    assert.equal(await evaluate('document.querySelector("#quote-destination").value'),'Destino Dhole')
    assert.ok(await exists('#quote-pod[required]'), 'Maritime FCL POD input must be visible and required')
    await click('.official-primary')
    await waitFor(()=>evaluate('document.querySelector(".official-error")?.textContent.includes("POD obligatorio")'),
      'Missing maritime FCL POD must block next step')
    await click('#quote-pod + .official-location-toggle')
    await waitFor(()=>exists('#quote-pod-options [role=option]'),'Mandatory POD choices')
    const noSkipPod = await evaluate('[...document.querySelectorAll("#quote-pod-options [role=option]")].some(x => x.textContent.includes("Sin POD adicional"))')
    assert.equal(noSkipPod,false,'Maritime POD must never offer skip / no additional POD')
    await click('#quote-pod-options [role=option]')
    assert.equal(await evaluate('document.querySelector("#quote-pod").value'),'POD Dhole')
    const quoteServices=await evaluate('[...document.querySelectorAll(".official-service-card .official-service-name")].map(x=>x.textContent.trim())')
    assert.equal(quoteServices.length,12,'Official quote wizard must only show the 12 reviewed service labels')
    assert.ok(!quoteServices.includes('Transporte nacional'),'Retired national transport must not be selectable')
    assert.ok(quoteServices.includes('Transporte internacional') && quoteServices.includes('Transporte recolección'),
      'Existing allowed services remain available')
    const insuranceSelected = await evaluate('(()=>{const label=[...document.querySelectorAll(".official-service-card")].find(x=>x.textContent.includes("Seguro de carga"));if(!label)return false;const checkbox=label.querySelector("input[type=checkbox]");if(!checkbox)return false;checkbox.click();return checkbox.checked})()')
    assert.ok(insuranceSelected,'Cargo insurance must be a selectable official service')
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
    const dark=await evaluate('(()=>{const el=document.querySelector(".official-panel");const panel=getComputedStyle(el);const html=getComputedStyle(document.documentElement);return {text:panel.color,canvas:html.backgroundImage,root:document.documentElement.className}})()')
    // The approved quote design intentionally makes the panel transparent:
    // a viewport-fixed dark gradient is painted on the HTML canvas instead.
    await screenshot('wizard-mobile-dark.png')
    assert.ok(dark.root.includes('theme-dark') && dark.text==='rgb(255, 255, 255)' &&
      dark.canvas.includes('linear-gradient'),
      'Dark mode needs white text on the document-wide dark gradient: '+JSON.stringify(dark))
    await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
    await evaluate('document.documentElement.classList.remove("theme-dark")')
    await click('.official-primary')
    await waitFor(()=>exists('.official-fields textarea[maxlength="4000"]'),'Step four cargo')
    await value('.official-fields textarea[maxlength="4000"]','CI cargo mock')
    assert.equal(await evaluate('document.querySelector("#quote-destination-handling")?.maxLength'),100,
      'Optional destination handling field is visible with the same 100-character limit as GIO')
    await value('#quote-destination-handling','Descarga delicada, mercancía frágil')
    await screenshot('wizard-destination-handling-desktop-light.png','#quote-destination-handling')
    await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
    await sleep(380)
    const handlingMobile=await evaluate('({width:window.innerWidth,scroll:document.documentElement.scrollWidth,field:!!document.querySelector("#quote-destination-handling")})')
    assert.ok(handlingMobile.field && handlingMobile.scroll<=handlingMobile.width+3,
      'Optional handling field should remain visible without horizontal overflow on mobile: '+JSON.stringify(handlingMobile))
    await evaluate('document.documentElement.classList.add("theme-dark")')
    await sleep(300)
    await screenshot('wizard-destination-handling-mobile-dark.png','#quote-destination-handling')
    const darkHandling=await evaluate('getComputedStyle(document.querySelector("#quote-destination-handling")).color')
    assert.equal(darkHandling,'rgb(255, 255, 255)','Special handling must remain readable in dark mode')
    await evaluate('document.documentElement.classList.remove("theme-dark")')
    await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
    assert.ok(await exists('#quote-cargo-value'),'Declared cargo value input must exist')
    await value('#quote-cargo-value','1500')
    await waitFor(()=>exists('#quote-cargo-currency'),'Insurance must ask for ISO currency')
    await value('input[autocomplete=name]','Cliente CI')
    await value('input[autocomplete=email]','ci-quote@example.invalid')
    await value('input[autocomplete=tel]','+506 2222 2222')
    assert.equal(posts.length,0,'Wizard must never submit before the user presses Submit')
    await click('.official-primary')
    assert.equal(posts.length,0,'Cargo insurance without currency must not submit')
    assert.ok(await exists('#quote-cargo-currency'),'Missing currency keeps the form editable')
    await click('#quote-cargo-currency')
    await waitFor(()=>exists('#quote-cargo-currency-options [role=option]'),'Currency choices')
    assert.deepEqual(await evaluate('[...document.querySelectorAll("#quote-cargo-currency-options [role=option]")].map(x=>x.textContent.trim())'),
      ['Seleccionar','USD — Dólar estadounidense','CRC — Colón costarricense','EUR — Euro'],
      'Only three reviewed currencies and the empty placeholder are offered')
    await click('#quote-cargo-currency-options [role=option]:nth-child(2)')
    await click('.official-primary')
    await waitFor(()=>exists('.official-success'),'Successful submit and receipt')
    assert.equal(posts.length,1,'Exactly one request was sent')
    assert.equal(posts[0].catalogSource,'dhole','Browser sends catalogSource Dhole')
    assert.equal(posts[0].originLocationId,originId,'Browser sends POL external UUID')
    assert.equal(posts[0].destinationLocationId,destId,'Browser sends POE external UUID')
    assert.equal(posts[0].podLocationId,podId,'Browser must submit required maritime POD UUID')
    assert.equal(posts[0].equipment[0].size,'45 pies')
    assert.equal(posts[0].equipment[0].type,'High Cube')
    assert.equal(posts[0].contactName,'Cliente CI')
    assert.ok(posts[0].services.includes('Seguro de carga'),'Chosen insurance must be in submitted services')
    assert.equal(posts[0].cargoValue,1500,'Wizard must retain declared cargo value')
    assert.equal(posts[0].cargoCurrencyCode,'USD','Wizard must retain ISO currency')
    assert.equal(posts[0].destinationHandling,'Descarga delicada, mercancía frágil',
      'Wizard must transmit special destination handling in the existing field')
    assert.equal(postKeys.length,1,'Wizard should send only once after validation')
    assert.match(postKeys[0], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      'Wizard must include a strong UUIDv4 client creation key')
    assert.equal(await evaluate('sessionStorage.getItem("gcf-official-quote-wizard-attempt-v1")'),null,
      'Confirmed receipt removes only the temporary creation retry identity')
    assert.ok(await evaluate('document.body.innerText.includes('+JSON.stringify(confirmationId)+')'),'Receipt shows mock id')
    assert.equal(legacyLocationReads,0,'Form never called local catalogue during Dhole success')
    console.log('PASS Chrome: four-step wizard preserves external UUID, pair-restricted equipment, responsive/dark mode and receipt')

    // A consolidated LCL cargo line is authoritative for stackability.
    // Never show a duplicate global checkbox that could contradict the line.
    await cdp('Page.navigate',{url:'http://'+host+':5194/cotizaciones?check=lcl-stackability'})
    await waitFor(()=>exists('.official-page .official-choice'),'Fresh LCL wizard')
    await chooseMode('Marítimo')
    await click('.official-primary')
    await waitFor(()=>exists('.official-choice'),'LCL transport selection')
    await chooseMode('LCL')
    // Reproduce rapid Continue presses while Dhole options are still loading.
    optionsDelayMs=700
    const readsBeforeBurst=optionsReads
    await evaluate(`(()=>{
      const next=document.querySelector('.official-primary')
      for(let i=0;i<8;i++) next.click()
    })()`)
    await waitFor(()=>evaluate('document.querySelector(".official-primary")?.disabled === true'),'Navigation locked during catalog request')
    assert.equal(await evaluate('document.querySelector(".official-back")?.disabled'),true,'Back locked during catalog request')
    assert.equal(await evaluate('[...document.querySelectorAll(".official-choice")].every(x=>x.disabled)'),true,'Shipment selection locked during catalog request')
    await evaluate(`(()=>{
      const next=document.querySelector('.official-primary')
      for(let i=0;i<8;i++) next.dispatchEvent(new MouseEvent('click',{bubbles:true}))
    })()`)
    await waitFor(()=>exists('#quote-origin'),'LCL route details')
    await sleep(850)
    optionsDelayMs=0
    assert.equal(optionsReads,readsBeforeBurst+1,'Rapid clicks must start exactly one catalog request')
    assert.ok(await exists('#quote-incoterm'),'Rapid clicks must not skip the mandatory Incoterm step')
    assert.equal(await evaluate('document.querySelector(".official-progress-item.current")?.getAttribute("aria-current")'), 'step')
    assert.equal(await evaluate('document.querySelector(".official-progress-item.current span")?.textContent.trim()'),'3')
    assert.equal(await exists('.official-fields textarea[maxlength="4000"]'),false,'Step four must not open before route validation')
    assert.equal(posts.length,1,'Rapid navigation must not create another quote')
    await click('.official-primary')
    assert.ok(await exists('#quote-incoterm'),'Empty route still blocks step four')
    console.log('PASS Chrome: repeated navigation while slow catalog loads never skips step 3')
    await click('#quote-origin + .official-location-toggle')
    await waitFor(()=>exists('#quote-origin-options li button'),'LCL origin list')
    await click('#quote-origin-options li button')
    await click('#quote-destination + .official-location-toggle')
    await waitFor(()=>exists('#quote-destination-options li button'),'LCL destination list')
    await click('#quote-destination-options li button')
    await click('#quote-pod + .official-location-toggle')
    await waitFor(()=>exists('#quote-pod-options [role=option]'),'LCL maritime POD')
    await click('#quote-pod-options [role=option]')
    await selectDropdown('quote-incoterm','CIF')
    await value('input[type=date]',future)
    await click('.official-primary')
    await waitFor(()=>exists('.official-line input[maxlength="400"]'),'LCL cargo line')
    const visibleFlags = await evaluate('[...document.querySelectorAll(".official-cargo-flags-grid .official-service-name")].map(x=>x.textContent.trim())')
    assert.deepEqual(visibleFlags,['Carga peligrosa','Sobrepeso'],
      'No estibable must NOT appear twice; only per-line stackability is editable')
    assert.ok(await evaluate('document.body.textContent.includes("La estibabilidad se indica por separado")'),
      'Explain that the aggregate non-stackable flag follows cargo lines')
    await value('.official-line input[maxlength="400"]','Cajas CI')
    await value('.official-line input[type="number"][min="1"]','2')
    const countDimensions = await evaluate(`(()=>{
      const inputs=[...document.querySelectorAll('.official-line input[type="number"][min="0.001"]')]
      if(inputs.length!==4) return inputs.length
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set
      for(const [i,value] of ['400','40','50','60'].entries()) {
        setter.call(inputs[i],value)
        inputs[i].dispatchEvent(new Event('input',{bubbles:true}))
        inputs[i].dispatchEvent(new Event('change',{bubbles:true}))
      }
      return inputs.length
    })()`)
    assert.equal(countDimensions,4,'LCL must provide weight plus three dimensions per line')
    await waitFor(()=>evaluate('document.querySelector(".official-weight-reference strong")?.textContent==="400 kg"'),'Calculated line total (not multiplied by quantity)')
    assert.equal(await exists('.official-weight-advisory'),false,'No declared weight: no warning')
    await value('#quote-declared-weight','400')
    await waitFor(async()=>!await exists('.official-weight-advisory'),'Equal weights do not warn')
    await value('#quote-declared-weight','400.1')
    await waitFor(()=>evaluate('document.querySelector(".official-weight-advisory")?.textContent.includes("kg menos")'),'Small positive difference warns')
    await value('#quote-declared-weight','399.9')
    await waitFor(()=>evaluate('document.querySelector(".official-weight-advisory")?.textContent.includes("kg más")'),'Small negative difference warns')
    await value('#quote-declared-weight','500')
    await waitFor(()=>evaluate('document.querySelector(".official-weight-advisory")?.textContent.includes("100 kg menos")'),'Declared weight higher')
    await value('#quote-declared-weight','300')
    await waitFor(()=>evaluate('document.querySelector(".official-weight-advisory")?.textContent.includes("100 kg más")'),'Declared weight lower')
    await selectDropdown('quote-weight-unit','Libras (lb)')
    await waitFor(()=>evaluate('document.querySelector(".official-weight-reference strong")?.textContent.includes("181")'),'Pounds converted to kg')
    await selectDropdown('quote-weight-unit','Kilogramos (kg)')
    await waitFor(()=>evaluate('document.querySelector(".official-weight-reference strong")?.textContent==="400 kg"'),'Back to kg')
    const lclCargoDropdownCount = await evaluate('document.querySelectorAll(".official-line .cf-dropdown__trigger").length')
    assert.equal(lclCargoDropdownCount,2,'LCL cargo line must have unit-type and stackability selectors')
    await click('.official-line .cf-dropdown__trigger')
    await waitFor(()=>exists('.cf-dropdown__menu [role=option]'),'Cargo unit choices')
    const boxChosen = await evaluate('(()=>{const choice=[...document.querySelectorAll(".cf-dropdown__menu[role=listbox] [role=option]")].find(x=>x.textContent.trim()==="Caja");if(!choice)return false;choice.click();return true})()')
    assert.ok(boxChosen,'LCL mock must allow Box as its cargo unit')
    const openedStackability = await evaluate('(()=>{const controls=document.querySelectorAll(".official-line .cf-dropdown__trigger");if(controls.length!==2)return false;controls[1].scrollIntoView({block:"center",behavior:"instant"});controls[1].click();return true})()')
    assert.ok(openedStackability,'Open per-line stackability selector')
    await waitFor(()=>exists('.cf-dropdown__menu [role=option]'),'Per-line stackability choices')
    const nonStackableChosen = await evaluate('(()=>{const choice=[...document.querySelectorAll(".cf-dropdown__menu[role=listbox] [role=option]")].find(x=>x.textContent.trim()==="No estibable");if(!choice)return false;choice.click();return true})()')
    assert.ok(nonStackableChosen,'Package must allow NonStackable on its own line')
    await value('.official-fields textarea[maxlength="4000"]','Mercancía CI consolidada')
    await value('input[autocomplete=name]','Cliente LCL CI')
    await value('input[autocomplete=email]','lcl-quote@example.invalid')
    await value('input[autocomplete=tel]','+506 2222 2222')
    await click('.official-primary')
    await waitFor(()=>posts.length===2,'LCL mock submission')
    assert.equal(posts[1].shipmentType,'LCL')
    assert.equal(posts[1].destinationHandling,null,'Destination handling remains optional in other modalities')
    assert.equal(posts[1].packages.length,1)
    assert.equal(posts[1].packages[0].quantity,2)
    assert.equal(posts[1].packages[0].weight,400,'Form cargo weight is total for this line')
    assert.equal(posts[1].declaredWeight,300,'Weight warning must not block or change declared weight')
    assert.equal(posts[1].packages[0].stackability,'NonStackable')
    assert.equal(posts[1].packages[0].unitType,'Box')
    assert.deepEqual(posts[1].cargoFlags,['No estibable'],
      'Line-level nonstackability must derive one aggregate flag automatically')
    console.log('PASS Chrome: LCL line-level stackability derives global flag with no duplicate checkbox')

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
    assert.equal(posts.length,2,'Outage must not submit an additional quote')
    console.log('PASS Chrome: failure of Dhole catalogue blocks route, no unsafe local fallback')

    upstreamIsDown=false
    explicitlyLegacy=true
    await cdp('Page.navigate',{url:'http://'+host+':5194/cotizaciones?check=flag-disabled'})
    await waitFor(()=>evaluate('location.search==="?check=flag-disabled" && document.querySelector(".official-progress-item.current")?.textContent.includes("1") && [...document.querySelectorAll(".official-choice")].some(b=>b.textContent.includes("Marítimo"))'),'Flag-disabled scenario initial render')
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
    // Print the primary failure BEFORE cleanup. Chrome may still be writing to
    // its profile when it is killed; an ENOTEMPTY error must not mask a failed
    // assertion or an actual defect in the quote UI.
    console.error('Primary wizard failure:',error)
    if(evaluate) {
      try { console.error('Browser diagnostic:',(await evaluate('document.body.innerText.slice(-1400)')).slice(0,1400)) } catch {}
      try { console.error('Controls:',await evaluate('({origin:document.querySelector("#quote-origin")?.value,originOpen:document.querySelector("#quote-origin")?.getAttribute("aria-expanded"),originOptions:document.querySelectorAll("#quote-origin-options [role=option]").length,destination:document.querySelector("#quote-destination")?.value,step:document.querySelector(".official-progress-item.current")?.innerText})')) } catch {}
    }
    throw error
  } finally {
    socket?.close()
    chrome?.kill()
    vite?.kill()
    await close(api).catch(()=>{})
    try { fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200}) }
    catch(e) { console.warn('Could not remove ephemeral Chrome profile:',e.code) }
  }
}
main().catch(error=>{console.error(error);process.exitCode=1})
