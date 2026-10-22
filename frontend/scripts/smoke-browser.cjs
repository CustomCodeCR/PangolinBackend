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
const apiPort = Number(process.env.SMOKE_API_PORT || 5000)
let activeRole = null
let sessionCalls = 0
function findChrome() {
  const windowsPaths = process.platform === 'win32'
    ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
       'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
       'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
       'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe']
    : []
  const options = [process.env.CHROME_BIN, ...windowsPaths,
    'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)
  const lookup = process.platform === 'win32' ? 'where.exe' : 'which'
  for (const name of options) {
    if (path.isAbsolute(name) && fs.existsSync(name)) return name
    const r = spawnSync(lookup, [name], { encoding: 'utf8' })
    if (r.status === 0) return r.stdout.split(/\r?\n/)[0].trim()
  }
  throw Error('Se requiere Chrome/Chromium para validar rutas en navegador.')
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
      { url: '/nosotros', role: null, must: ['about-reference-page', 'about-reference-intro'] },
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
      assert.ok(sessionCalls > before, 'No se comprobó la sesión para ' + scenario.url)
      console.log('PASS navegador: ' + scenario.url + ' [' + (activeRole || 'invitado') + ']')
    }
    if (serverError.includes('Error')) console.log('Vite stderr: ' + serverError.slice(-500))
    console.log('OK: páginas públicas, login, control de acceso, cotizaciones y administración renderizadas en Chrome.')
  } finally {
    if (preview && preview.exitCode === null) preview.kill('SIGTERM')
    await closeServer(api)
  }
}
main().catch(error => { console.error('FAIL browser smoke:', error.message); process.exitCode = 1 })
