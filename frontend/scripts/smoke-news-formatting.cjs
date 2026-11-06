// Browser regression for the real admin news editor and teleported FieldDropdown menus.
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const os = require('node:os')
const { spawn, spawnSync } = require('node:child_process')
const dist = path.resolve(__dirname, '../dist')
const binaries = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)
const browser = binaries.map(name => {
  if (path.isAbsolute(name) && fs.existsSync(name)) return name
  const result = spawnSync('which', [name], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : ''
}).find(Boolean)
assert.ok(browser, 'Chrome/Chromium is required for the real editor interaction test')
const client = String.raw`
(async () => {
  const output = document.createElement('output')
  output.id = 'news-formatting-results'
  document.body.appendChild(output)
  const pause = (ms = 90) => new Promise(resolve => setTimeout(resolve, ms))
  const until = async (query, limit = 75) => {
    for (let i = 0; i < limit; i++) {
      const element = document.querySelector(query)
      if (element) return element
      await pause(80)
    }
    throw Error('Element not found: ' + query)
  }
  const click = async element => {
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }))
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    element.focus?.({ preventScroll: true })
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }))
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    element.click()
    await pause()
  }
  const getText = (needle, root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node
    while ((node = walker.nextNode())) {
      if (node.textContent?.includes(needle)) return { node, index: node.textContent.indexOf(needle) }
    }
    throw Error('Text not found: ' + needle)
  }
  const selectText = (needle, root) => {
    const { node, index } = getText(needle, root)
    const range = document.createRange()
    range.setStart(node, index)
    range.setEnd(node, index + needle.length)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    return node
  }
  const selectMenu = async (name, label) => {
    const trigger = document.querySelector('.news-rich-editor [role="combobox"][aria-label="' + name + '"]')
    if (!trigger) throw Error('Missing dropdown '+name+'; DOM '+document.querySelector('.news-rich-editor')?.outerHTML.slice(0,1800))
    await click(trigger)
    const menu = await until('.cf-dropdown__menu[aria-label="' + name + '"]')
    const option = Array.from(menu.querySelectorAll('[role="option"]')).find(item => item.textContent.trim() === label)
    if (!option) throw Error('Option missing: ' + name + ': ' + label)
    await click(option)
    await pause(120)
  }
  const changeTab = async label => {
    const button = Array.from(document.querySelectorAll('.news-rich-editor__tabs button')).find(el => el.textContent.trim() === label)
    if (!button) throw Error('Missing tab: ' + label)
    await click(button)
  }
  const results = { theme: document.documentElement.classList.contains('theme-dark') ? 'dark' : 'light' }
  try {
    await until('.manager-subtabs')
    const newsButton = Array.from(document.querySelectorAll('.manager-subtabs button')).find(b => b.textContent.includes('Noticias'))
    if (!newsButton) throw Error('Missing news tab')
    await click(newsButton)
    const editor = await until('.news-rich-editor__content[contenteditable="true"]')
    const reset = async html => {
      editor.innerHTML = html
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
      await pause(120)
    }
    const sizeAt = needle => {
      const { node } = getText(needle, editor)
      return { size: getComputedStyle(node.parentElement).fontSize, html: editor.innerHTML }
    }
    await reset('<p>Inicio <span style="font-size:12px;color:#047857"><u>Objetivo</u></span> final</p>')
    selectText('Objetivo', editor)
    await changeTab('Diseño')
    await selectMenu('Tamaño', '24px')
    results.firstSize = sizeAt('Objetivo')
    selectText('Objetivo', editor)
    await selectMenu('Tamaño', '16px')
    results.secondSize = sizeAt('Objetivo')
    selectText('Objetivo', editor)
    await selectMenu('Tamaño', '32px')
    results.thirdSize = sizeAt('Objetivo')
    results.preservedUnderline = !!getText('Objetivo', editor).node.parentElement.closest('u')
    results.preservedGreen = !!getText('Objetivo', editor).node.parentElement.closest('[style*="color"]')
    await changeTab('Vista previa')
    const preview = await until('.news-rich-editor__preview-article')
    const previewNode = getText('Objetivo', preview).node
    results.previewSize = getComputedStyle(previewNode.parentElement).fontSize
    await changeTab('Inicio')

    await reset('<p>Antes <span style="font-size:14px;color:#047857"><u>Encabezado</u></span> después</p>')
    selectText('Encabezado', editor)
    await selectMenu('Estilo', 'Título H2')
    const heading = () => {
      const n = getText('Encabezado', editor).node
      return { tag: n.parentElement.closest('h1,h2,h3,p')?.tagName || '', size: getComputedStyle(n.parentElement).fontSize, html: editor.innerHTML }
    }
    results.h2 = heading()
    selectText('Encabezado', editor)
    await selectMenu('Estilo', 'Título H1')
    results.h1 = heading()
    selectText('Encabezado', editor)
    await selectMenu('Estilo', 'Párrafo normal')
    results.paragraph = heading()
    output.textContent = JSON.stringify(results)
  } catch (error) {
    output.textContent = JSON.stringify({ ...results, error: String(error && (error.stack || error)) })
  }
})()
`;
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname
  const json = body => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(body))
  }
  if (pathname === '/api/auth/me') return json({ correo: 'ci-admin@example.invalid', role: 'administrador', nombre: 'CI Admin' })
  if (pathname === '/api/admin/content/media/storage-status') return json({ enabled: false })
  if (pathname === '/api/admin/content/news' || pathname === '/api/admin/content/comments' || pathname === '/api/admin/content/media' || pathname === '/api/admin/content/itineraries' || pathname === '/api/itinerarios') return json([])
  if (pathname === '/api/content/news' || pathname === '/api/content/site') return json([])
  if (pathname.startsWith('/api/')) return json([])
  let file = path.resolve(dist, '.' + decodeURIComponent(pathname))
  if (!file.startsWith(dist + path.sep) && file !== dist) { res.writeHead(403); return res.end() }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html')
  const ext = path.extname(file)
  const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.jpeg':'image/jpeg', '.jpg':'image/jpeg' }
  let content = fs.readFileSync(file)
  if (ext === '.html') {
    const theme = new URL(req.url || '/', 'http://localhost').searchParams.has('test-dark') ? 'dark' : 'light'
    const injection = '<script>localStorage.setItem("castrofallas-theme",'+JSON.stringify(theme)+');</script>'
    content = Buffer.from(content.toString('utf8').replace('</head>', injection + '</head>').replace('</body>', '<script>' + client + '</script></body>'))
  }
  res.writeHead(200, { 'Content-Type': (mime[ext] || 'application/octet-stream') + (['.html','.js','.css'].includes(ext)?'; charset=utf-8':'') })
  res.end(content)
})
async function run(dark) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-format-test-'))
  try {
    const port = server.address().port
    const url = 'http://127.0.0.1:' + port + '/administracion' + (dark ? '?test-dark' : '')
    return await new Promise((resolve,reject) => {
      const chrome = spawn(browser, ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-extensions','--disable-background-networking','--virtual-time-budget=17000','--user-data-dir='+profile,'--dump-dom',url], {stdio:['ignore','pipe','pipe']})
      let text = '', err = ''
      const timer = setTimeout(() => chrome.kill('SIGKILL'), 40000)
      chrome.stdout.on('data', b => text += b)
      chrome.stderr.on('data', b => err += b)
      chrome.on('close', code => {
        clearTimeout(timer)
        if (code !== 0) return reject(Error('Chrome exit '+code+' '+err.slice(-300)))
        const match = text.match(/<output id="news-formatting-results">([^<]*)<\/output>/)
        if (!match || !match[1]) return reject(Error('Browser did not complete editor test; '+text.slice(-800)))
        resolve(JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>')))
      })
      chrome.on('error', reject)
    })
  } finally { fs.rmSync(profile, {recursive:true, force:true}) }
}
async function main() {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
  try {
    for (const dark of [false,true]) {
      const result = await run(dark)
      console.log('EDITOR', JSON.stringify(result))
      assert.ok(!result.error, 'Editor browser scenario error: '+result.error)
      for (const [key,value] of [['firstSize','24px'],['secondSize','16px'],['thirdSize','32px'],['previewSize','32px']]) {
        const actual = typeof result[key] === 'string' ? result[key] : result[key]?.size
        assert.equal(actual, value, 'Wrong '+key+' in '+result.theme+' theme')
      }
      assert.equal(result.h2.tag, 'H2')
      assert.equal(result.h1.tag, 'H1')
      assert.equal(result.paragraph.tag, 'P')
      assert.ok(result.preservedUnderline, 'Text underline lost while resizing')
      assert.ok(result.preservedGreen, 'Colored formatting lost while resizing')
      assert.ok(parseFloat(result.h2.size) > 14, 'Heading H2 must visually override prior 14px inline size')
      assert.ok(parseFloat(result.h1.size) > parseFloat(result.h2.size), 'H1 must visually be larger than H2')
      assert.equal(result.paragraph.size, '15px', 'Normal paragraph should restore default size')
    }
    console.log('PASS: repeated sizes, headings, paragraph, colors, underline and preview')
  } finally { await new Promise(resolve => server.close(resolve)) }
}
main().catch(e => { console.error('FAIL:',e.message); process.exitCode = 1 })
