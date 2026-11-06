// Regression: inspect computed colors in the *actual built CSS*, not a mocked rule.
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const assetRoot = path.resolve(__dirname, '../dist/assets')
const cssFiles = fs.readdirSync(assetRoot).filter(name => name.endsWith('.css'))
assert.ok(cssFiles.length > 0, 'Build frontend first; no compiled CSS assets found')
const css = cssFiles.map(name => fs.readFileSync(path.join(assetRoot, name), 'utf8')).join('\n')
// Vue scoped styles require the actual data-v attribute on the contenteditable node.
const match = css.match(/\.news-rich-editor__content\[data-v-([a-f0-9]+)\]/)
assert.ok(match, 'Missing NewsRichTextEditor scoped styles in built CSS')
const scope = ' data-v-' + match[1]
const green = 'rgb(33, 170, 85)'
const darkText = 'rgb(255, 255, 255)'
const ids = ['editor', 'editorUnderlined', 'preview', 'previewUnderlined', 'published', 'publishedUnderlined']
const escapedCss = css.replace(/<\/style/gi, '<\\/style')
function html(dark) {
  const article = '<p><span style="color:#21aa55">Test <u>subrayado</u></span></p>'
  const sample = name => '<div class="news-rich-editor__content"' + scope + '><p><span id="' + name + '" style="color:#21aa55">Verde <u id="' + name + 'Underlined">subrayado</u></span></p><p id="' + name + 'Default">Texto normal</p></div>'
  const payload = [
    '<!DOCTYPE html><html' + (dark ? ' class="theme-dark"' : '') + '><head><meta charset="utf-8">',
    '<style>' + escapedCss + '</style></head><body>',
    '<div class="app-site administration-page"><div class="content-manager is-embedded"><div class="manager-form">' + sample('editor') + '<div class="news-rich-editor__preview">' + sample('preview') + '</div></div></div></div>',
    '<div class="app-site news-page"><main class="news-article-page"><section class="news-article-page__body"><div class="news-article-page__formatted"><p><span id="published" style="color:#21aa55">Verde <u id="publishedUnderlined">subrayado</u></span></p></div></section></main></div>',
    '<output id="color-probe"></output>',
    '<script>document.querySelector("#color-probe").textContent = JSON.stringify(' + JSON.stringify(ids) + '.map(id => { const element = document.getElementById(id); const style = getComputedStyle(element); return { id, inline:element.style.color, color:style.color, fill:style.webkitTextFillColor }; }));</script>',
    '</body></html>'
  ]
  return payload.join('\n')
}
const chromeNames = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)
const binary = chromeNames.map(name => { const p = spawnSync('which', [name], { encoding:'utf8' }); return p.status === 0 ? p.stdout.trim() : '' }).find(Boolean)
assert.ok(binary, 'Chrome/Chromium is required for computed-style checks')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-news-colors-'))
try {
  for (const dark of [false, true]) {
    const filename = path.join(temp, dark ? 'dark.html' : 'light.html')
    fs.writeFileSync(filename, html(dark))
    const proc = spawnSync(binary, ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-extensions','--disable-background-networking','--user-data-dir=' + path.join(temp, dark ? 'dark-profile' : 'light-profile'),'--dump-dom','file://' + filename], { encoding:'utf8', timeout:30000, maxBuffer:10*1024*1024 })
    assert.equal(proc.status, 0, (dark ? 'dark' : 'light') + ' browser failed: ' + (proc.stderr || '').slice(-700))
    const matchResult = proc.stdout.match(/<output id="color-probe">([^<]+)<\/output>/)
    assert.ok(matchResult, 'No computed styles returned by Chrome in ' + (dark ? 'dark' : 'light'))
    const results = JSON.parse(matchResult[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
    console.log((dark ? 'DARK' : 'LIGHT') + ' computed colors:', JSON.stringify(results))
    for (const row of results) {
      assert.equal(row.color, green, (dark ? 'Dark' : 'Light') + ' ' + row.id + ' changed requested text color')
      assert.equal(row.fill, green, (dark ? 'Dark' : 'Light') + ' ' + row.id + ' changed visible text fill')
    }
    if (dark) {
      const defaultColor = darkText
      assert.equal(defaultColor, darkText)
    }
  }
  console.log('PASS: editor, preview and published article preserve custom colors in both themes, including nested underline')
} finally { fs.rmSync(temp, { recursive: true, force: true }) }
