#!/usr/bin/env node
// Read-only local SignalR gateway check; no cookies, tokens, account data or CMS writes.
// Node.js 22+ supplies fetch and WebSocket; no npm install needed.
const baseInput = process.env.SIGNALR_GATEWAY_URL || process.argv[2] || 'http://127.0.0.1:5173'

function localAddress(host) {
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true
  const groups = host.split('.').map(Number)
  if (groups.length !== 4 || groups.some(x => !Number.isInteger(x) || x < 0 || x > 255)) return false
  return groups[0] === 10 || (groups[0] === 192 && groups[1] === 168) ||
    (groups[0] === 172 && groups[1] >= 16 && groups[1] <= 31) ||
    groups[0] === 127
}

function endpoint(relative, base) {
  return new URL(relative, base)
}

async function check() {
  let base
  try { base = new URL(baseInput) } catch { throw new Error('URL local inválida.') }
  if (!['http:', 'https:'].includes(base.protocol) || !localAddress(base.hostname) ||
      base.username || base.password || base.pathname !== '/' || base.search || base.hash)
    throw new Error('Usá únicamente una URL HTTP(S) local sin credenciales, por ejemplo http://127.0.0.1:5173/')
  if (typeof WebSocket === 'undefined') throw new Error('Se requiere Node.js 22 o superior.')
  console.log('Diagnóstico de gateway local: ' + base.origin)

  const auth = await fetch(endpoint('/api/auth/me', base), {
    headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(7000)
  })
  if (auth.status !== 401)
    throw new Error('GET /api/auth/me devolvió HTTP ' + auth.status + '; se esperaba 401 para un visitante sin cookie.')
  console.log('PASS /api/auth/me: 401 esperado (sin sesión).')

  const negotiate = await fetch(endpoint('/api/hubs/updates/negotiate?negotiateVersion=1', base), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(7000)
  })
  if (!negotiate.ok) throw new Error('SignalR negotiate devolvió HTTP ' + negotiate.status + '. Revisá backend y proxy /api/.')
  const data = await negotiate.json()
  if (!data || !Array.isArray(data.availableTransports) ||
      !data.availableTransports.some(t => t.transport === 'WebSockets'))
    throw new Error('SignalR negotiate no anuncia WebSockets.')
  const token = data.connectionToken
  if (typeof token !== 'string' || !token)
    throw new Error('SignalR negotiate no devolvió un connectionToken.')
  console.log('PASS /api/hubs/updates/negotiate: HTTP ' + negotiate.status + ', WebSockets anunciado.')

  const wsUrl = endpoint('/api/hubs/updates', base)
  wsUrl.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
  wsUrl.searchParams.set('id', token) // Secretos efímeros solo en memoria, nunca en logs.
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl)
    let settled = false
    const timer = setTimeout(() => finish(new Error('Timeout en el handshake WebSocket del gateway.')), 8000)
    function finish(error) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { socket.close() } catch { /* El socket puede no haberse abierto. */ }
      if (error) reject(error)
      else resolve()
    }
    socket.addEventListener('open', () => socket.send('{"protocol":"json","version":1}\x1e'))
    socket.addEventListener('message', event => {
      const frame = String(event.data).split('\x1e')[0]
      try {
        const answer = JSON.parse(frame)
        if (answer && typeof answer === 'object' && !Array.isArray(answer)) {
          if (answer.error) finish(new Error('El hub rechazó el handshake SignalR.'))
          else if (!Object.keys(answer).length) finish()
        }
      } catch { /* Esperar una respuesta válida del handshake de SignalR. */ }
    })
    socket.addEventListener('error', () => finish(new Error('Falló WebSocket Upgrade o la conexión con el hub.')))
    socket.addEventListener('close', () => finish(new Error('WebSocket se cerró antes del handshake.')))
  })
  console.log('PASS WebSocket Upgrade + handshake SignalR (visitante anónimo).')
  console.log('OK: gateway local permite negociar y conectar al hub sin enviar datos privados.')
}

check().catch(error => {
  // No imprimir errores internos de WebSocket que puedan incluir el connectionToken.
  const detail = error instanceof Error ? error.message : 'Error de red.'
  if (error instanceof TypeError || error?.name === 'TimeoutError' || error?.name === 'AbortError')
    console.error('FAIL: solicitud de red fallida o agotó el tiempo. Revisá Docker y el gateway.')
  else console.error('FAIL: ' + detail)
  process.exitCode = 1
})
