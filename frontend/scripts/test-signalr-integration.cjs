// Test real de SignalR contra el backend de Docker.
// Se ejecuta desde scripts/smoke-local.py con una cookie efímera del usuario demo.
// No imprime ni persiste credenciales.
const signalR = require('@microsoft/signalr')
const assert = require('node:assert/strict')
const BASE = process.env.SIGNALR_TEST_BASE || 'http://127.0.0.1:5000'
const COOKIE = process.env.SIGNALR_TEST_COOKIE
if (!COOKIE) throw Error('Falta cookie temporal de prueba')
const testKey = process.env.SIGNALR_TEST_SLOT
if (!testKey) throw Error('Falta ranura de prueba')
const admin = new signalR.HubConnectionBuilder()
  .withUrl(BASE + '/api/hubs/updates', { headers: { Cookie: COOKIE }, transport: signalR.HttpTransportType.WebSockets })
  .build()
const visitor = new signalR.HubConnectionBuilder()
  .withUrl(BASE + '/api/hubs/updates', { transport: signalR.HttpTransportType.WebSockets })
  .build()
const adminEvents = []
const publicEvents = []
const collect = (arr) => (evt) => {
  if (evt && evt.type === 'data-changed' && typeof evt.eventId === 'string') arr.push(evt.resource)
}
admin.on('DataChanged', collect(adminEvents))
visitor.on('DataChanged', collect(publicEvents))
async function api(route, method = 'GET', body) {
  const res = await fetch(BASE + route, {
    method, headers: { Cookie: COOKIE, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) throw Error(`API ${route}: HTTP ${res.status}`)
}
function waitFor(arr, resource, limit = 7000) {
  if (arr.includes(resource)) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const timer = setInterval(() => {
      if (arr.includes(resource)) { clearInterval(timer); resolve() }
      else if (Date.now() - start > limit) { clearInterval(timer); reject(Error('Timeout esperando evento ' + resource)) }
    }, 50)
  })
}
async function main() {
  let active = false
  try {
    await admin.start()
    await visitor.start()
    active = true
    let refused = false
    try { await visitor.invoke('PublishChange', { resource: 'site-admin' }) }
    catch { refused = true }
    assert(refused, 'Un visitante pudo invocar un método de publicación')
    const path = '/api/admin/content/site/' + encodeURIComponent(testKey)
    // Publicación ficticia protegida, nunca un registro real de otro usuario.
    await api(path, 'PUT', { textEs: 'REALTIME SMOKE', textEn: 'REALTIME TEST', mediaId: null })
    await waitFor(adminEvents, 'site-admin')
    await new Promise(resolve => setTimeout(resolve, 350))
    assert(!publicEvents.includes('site-admin'), 'Visitante recibió evento interno')
    assert(!publicEvents.includes('site'), 'Borrador enviado públicamente')
    await api(path + '/publish', 'POST')
    await Promise.all([waitFor(publicEvents, 'site'), waitFor(adminEvents, 'site')])
    console.log('OK: SignalR privado y público desde backend después del guardado')
  } finally {
    if (active) {
      try { await api('/api/admin/content/site/' + encodeURIComponent(testKey) + '/restore', 'POST') }
      catch { /* test smoke se ejecuta sobre una clave previamente vacía */ }
    }
    await Promise.allSettled([admin.stop(), visitor.stop()])
  }
}
main().catch(error => { console.error('FAIL SignalR:', error.message); process.exitCode = 1 })
