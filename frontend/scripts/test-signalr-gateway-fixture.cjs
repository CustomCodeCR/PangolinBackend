// Isolated SignalR probe fixture: no Docker, external calls, sessions or credentials.
const assert = require('node:assert/strict')
const http = require('node:http')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { WebSocketServer } = require('ws')

const probe = path.resolve(__dirname, '../../scripts/check-signalr-gateway.cjs')
const marker = 'LOCAL_FIXTURE_TOKEN_NOT_FOR_LOGS'
let mode = 'ready'
let negotiateCount = 0
let handshakeCount = 0
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/auth/me') {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    return res.end('{}')
  }
  if (req.method === 'POST' && req.url.startsWith('/api/hubs/updates/negotiate?')) {
    negotiateCount++
    if (mode === 'upstream-error') { res.writeHead(502); return res.end('{}') }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({
      negotiateVersion: 1, connectionId: 'fixture',
      connectionToken: marker,
      availableTransports: [{ transport: 'WebSockets', transferFormats: ['Text'] }]
    }))
  }
  res.writeHead(404)
  res.end()
})
const wsServer = new WebSocketServer({ noServer: true })
server.on('upgrade', (req, socket, head) => {
  if (mode !== 'ready' || !req.url.startsWith('/api/hubs/updates?id=')) return socket.destroy()
  wsServer.handleUpgrade(req, socket, head, client => {
    wsServer.emit('connection', client)
  })
})
wsServer.on('connection', ws => {
  ws.on('message', raw => {
    if (raw.toString() === '{"protocol":"json","version":1}\x1e') {
      handshakeCount++
      ws.send('{}\x1e')
    }
  })
})
function run(url) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [probe], {
      env: { ...process.env, SIGNALR_GATEWAY_URL: url },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = '', stderr = ''
    child.stdout.on('data', data => { stdout += data.toString() })
    child.stderr.on('data', data => { stderr += data.toString() })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('SignalR probe hung'))
    }, 15000)
    child.on('error', reject)
    child.on('close', code => {
      clearTimeout(timer)
      resolve({ code, output: stdout + stderr })
    })
  })
}
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = 'http://127.0.0.1:' + server.address().port
  try {
    const good = await run(base)
    assert.equal(good.code, 0, good.output)
    assert.match(good.output, /PASS .*auth\/me/)
    assert.match(good.output, /PASS WebSocket Upgrade/)
    assert.equal(negotiateCount, 1)
    assert.equal(handshakeCount, 1)
    assert(!good.output.includes(marker), 'Probe printed an ephemeral hub connectionToken')

    mode = 'upstream-error'
    const bad = await run(base)
    assert.notEqual(bad.code, 0)
    assert.match(bad.output, /negotiate devolvió HTTP 502/)
    assert(!bad.output.includes(marker))
    const remote = await run('https://www.logisticacastrofallas.com')
    assert.notEqual(remote.code, 0, 'Probe must reject non-local production URLs')
    assert.match(remote.output, /URL HTTP\(S\) local/)
    console.log('PASS offline SignalR: 401 esperado, negotiate 200/502, WebSocket handshake, sin filtraciones.')
  } finally {
    for (const client of wsServer.clients) client.terminate()
    await new Promise(resolve => wsServer.close(resolve))
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
