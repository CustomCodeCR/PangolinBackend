// Browser regression: real built Noticias page, two dynamic articles, ES/EN and light/dark.
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const dist = path.join(root, 'dist')
const articles = [
  { id: 'f6e837c0-8b2e-4c63-8907-9051dc71921a', title: 'Puerto de Caldera', category: 'LOGÍSTICA', description: 'Llegaron nuevos contenedores.', body: 'El puerto recibió carga.\nSegunda línea en español.', author: 'Equipo Editorial CF', publicationDate: '2026-10-20', image: '/images/cover-logistics.jpeg', published: true },
  { id: '5c6bb714-5b7d-437b-bbb6-d6d1ea5e6bf5', title: 'Exportaciones de Costa Rica', category: 'COMERCIO', description: 'Crecieron las exportaciones.', body: 'Costa Rica exporta productos.', author: 'Departamento de Comunicación', publicationDate: '2026-10-23', image: '/images/news-ports.webp', published: true }
]
const translated = {
  [articles[0].id]: { title: 'Port of Caldera', category: 'LOGISTICS', description: 'New containers arrived.', body: 'The port received cargo.\nSecond line in English.' },
  [articles[1].id]: { title: 'Costa Rican exports', category: 'TRADE', description: 'Exports increased.', body: 'Costa Rica exports products.' }
}
let translatedCalls = 0
let spanishTranslationCalls = 0
const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  const pathname = url.pathname
  function json(status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)) }
  if (pathname === '/api/auth/me') return json(401, { error: 'No session' })
  if (pathname === '/api/content/news') return json(200, articles)
  if (pathname === '/api/content/site') return json(200, {})
  const match = pathname.match(/^\/api\/content\/news\/([\da-f-]+)\/translation$/)
  if (match) {
    if (url.searchParams.get('lang') !== 'en') spanishTranslationCalls++
    translatedCalls++
    return json(translated[match[1]] ? 200 : 404, translated[match[1]] || {})
  }
  if (pathname.startsWith('/api/')) return json(404, { error: 'Not configured for smoke' })
  let resolved = path.resolve(dist, '.' + decodeURIComponent(pathname))
  if (!resolved.startsWith(dist + path.sep) && resolved !== dist) return json(403, {})
  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    if (fs.existsSync(path.join(resolved, 'index.html'))) resolved = path.join(resolved, 'index.html')
    else resolved = path.join(dist, 'index.html')
  }
  let body = fs.readFileSync(resolved)
  const ext = path.extname(resolved).toLowerCase()
  const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json', '.png':'image/png', '.webp':'image/webp', '.jpeg':'image/jpeg', '.jpg':'image/jpeg' }
  if (ext === '.html') {
    const locale = url.searchParams.get('testLocale') === 'en' ? 'en' : 'es'
    const theme = url.searchParams.get('testTheme') === 'dark' ? 'dark' : 'light'
    // Set language/theme before Vue loads; read the full article's computed page background.
    const injection = '<script>localStorage.setItem("user-locale",' + JSON.stringify(locale) + ');localStorage.setItem("castrofallas-theme",' + JSON.stringify(theme) + ');</script>'
    let html = body.toString('utf8').replace('</head>', injection + '</head>')
    html = html.replace('</body>', '<script>window.addEventListener("load",()=>setTimeout(()=>{const page=document.querySelector(".news-article-page");if(page){const el=document.createElement("output");el.id="tested-article-bg";el.textContent=getComputedStyle(page).backgroundColor;document.body.appendChild(el)}},1500))</script></body>')
    body = Buffer.from(html)
  }
  res.writeHead(200, { 'Content-Type': (mime[ext] || 'application/octet-stream') + (['.html','.js','.css','.json'].includes(ext)?'; charset=utf-8':'') })
  res.end(body)
})
function chromeBinary() {
  for (const name of [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', 'google-chrome','google-chrome-stable','chromium','chromium-browser'].filter(Boolean)) {
    if (path.isAbsolute(name) && fs.existsSync(name)) return name
    const result = spawnSync('which',[name],{encoding:'utf8'})
    if (result.status === 0) return result.stdout.trim()
  }
  throw Error('Chrome/Chromium unavailable')
}
async function dump(url) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'cf-news-test-'))
  return new Promise((resolve,reject) => {
    const chrome = spawn(chromeBinary(),[
      '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-extensions',
      '--disable-background-networking','--virtual-time-budget=11000','--user-data-dir='+dir,
      '--dump-dom',url
    ],{stdio:['ignore','pipe','pipe']})
    let out='',err=''
    const watchdog=setTimeout(()=>chrome.kill('SIGKILL'),35000)
    chrome.stdout.on('data',b=>{out+=b})
    chrome.stderr.on('data',b=>{if(err.length<3000)err+=b})
    chrome.on('error',reject)
    chrome.on('close',code=>{
      clearTimeout(watchdog)
      fs.rmSync(dir,{recursive:true,force:true})
      if(code!==0)reject(Error('Chrome exited '+code+' '+err.slice(-500)))
      else resolve(out)
    })
  })
}
async function main(){
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  try {
    const origin = 'http://127.0.0.1:' + server.address().port
    const listing = await dump(origin + '/noticias?testLocale=es&testTheme=light')
    assert.ok(listing.includes('Puerto de Caldera') && listing.includes('Exportaciones de Costa Rica'), 'Both published titles must appear in listing')
    assert.ok(!listing.includes('Llegaron nuevos contenedores.') && !listing.includes('Crecieron las exportaciones.'), 'Listing shows titles without summaries')
    const articlePath = '/noticias/2026-10-20-puerto-de-caldera-' + articles[0].id.replace(/-/g, '').slice(-8).toLowerCase()
    assert.ok(listing.includes(articlePath), 'Each article must link to its readable article URL')

    const base = origin + articlePath
    const spanish = await dump(base + '?testLocale=es&testTheme=light')
    assert.ok(spanish.includes('class="news-article-page"'), 'Article must render in a dedicated full-page section')
    assert.ok(spanish.includes('Puerto de Caldera') && spanish.includes('Segunda línea en español.'), 'Spanish article must show entire body')
    assert.ok(spanish.includes('datetime="2026-10-20"'), 'Publication date must be visible at upper-right of article')
    assert.ok(spanish.includes('Equipo Editorial CF'), 'Article must display its author at the end')
    assert.ok(spanish.includes('href="/noticias"'), 'Article must allow returning to News')
    assert.ok(!spanish.includes('class="news-article-modal-backdrop"'), 'Do not render old modal')
    assert.ok(!spanish.includes('Exportaciones de Costa Rica'), 'Article page must not show the listing beneath the article')
    assert.ok(spanish.includes('id="tested-article-bg">rgb(255, 255, 255)'), 'Light article must use normal page background')
    assert.equal(translatedCalls, 0, 'Spanish page should not request translations')

    const oldSlug = await dump(origin + '/noticias/puerto-de-caldera-' + articles[0].id.replace(/-/g, '').slice(-8).toLowerCase() + '?testLocale=es&testTheme=light')
    assert.ok(oldSlug.includes('Equipo Editorial CF'), 'Prior slug without date must still render article')
    const legacy = await dump(origin + '/noticias?article=' + articles[0].id + '&testLocale=es&testTheme=light')
    assert.ok(legacy.includes('Puerto de Caldera') && legacy.includes('Segunda línea en español.'), 'Legacy article links must keep working')

    const english = await dump(origin + '/noticias?article=' + articles[0].id + '&testLocale=en&testTheme=dark')
    for (const expected of ['Port of Caldera', 'New containers arrived.', 'Second line in English.', 'Back to news'])
      assert.ok(english.includes(expected), 'English full article missing: ' + expected)
    assert.ok(english.includes('id="tested-article-bg">rgb(1, 8, 29)'), 'Dark full article must use site navy background')
    assert.equal(translatedCalls, 2, 'All published articles must request translations')
    assert.equal(spanishTranslationCalls, 0, 'Spanish should not request translations')
    console.log('PASS: date-first article URL, author, publication date, historic slug/ID routes, ES/EN, light/dark')
  } finally {await new Promise(resolve=>server.close(resolve))}
}
main().catch(err=>{console.error('FAIL:',err.message);process.exitCode=1})
