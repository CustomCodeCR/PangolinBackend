// Test the real TypeScript URL builder using the installed TypeScript compiler.
// No browser, live CMS, MinIO, network request or production flag is needed.
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const read = name => fs.readFileSync(path.join(root, name), 'utf8')
const tsSource = read('src/cmsResponsiveImages.ts')
const emitted = ts.transpileModule(tsSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
const moduleObj = { exports: {} }
new Function('module', 'exports', emitted)(moduleObj, moduleObj.exports)
const { cmsResponsiveSrcset } = moduleObj.exports

const canonical = '/api/content/media/01234567-89ab-cdef-0123-456789abcdef/file'
const widths = [360, 720, 1080, 1600]
const expected = widths.map(w => canonical + '?width=' + w + ' ' + w + 'w').join(', ')
assert.equal(cmsResponsiveSrcset(canonical, false), undefined,
  'The default deployment must not expose CMS variant URLs')
assert.equal(cmsResponsiveSrcset(canonical, true), expected,
  'Supported media URLs must map exactly to the backend width whitelist')

for (const invalid of [
  '',
  '/api/content/media/0123456789abcdef0123456789abcdef/file',
  canonical + '?width=360',
  canonical + '#frag',
  'https://logisticacastrofallas.com' + canonical,
  '//logisticacastrofallas.com' + canonical,
  '/api/admin/content/media/01234567-89ab-cdef-0123-456789abcdef/file',
  '/images/about-operations-enhanced.jpg',
  '/images/cover-logistics.jpeg',
  'data:image/png;base64,abc',
  'blob:https://example.invalid/abc',
  canonical.replace('/file', '/../file'),
  '/api/content/media/invalid/file'
]) {
  assert.equal(cmsResponsiveSrcset(invalid, true), undefined,
    'Only canonical, relative, public CMS file URLs are eligible: ' + invalid)
}

// Guard the layout regressions that previously affected the design. Verify
// variant requests are never enabled for bundled AVIF/WebP static fallbacks.
const image = read('src/components/StaticOptimizedImage.vue')
const home = read('src/Home.vue')
const news = read('src/pages/News.vue')
const site = read('src/components/SiteMedia.vue')
assert.match(image, /VITE_CMS_RESPONSIVE_WEBP_ENABLED === 'true'/,
  'CMS responsive must be opt-in at build time')
assert.match(image, /failedResponsiveSrc\.value === props\.src/,
  'Broken variant must fall back to original CMS URL')
assert.match(image, /:srcset="cmsSrcset"/)
assert.match(image, /:sizes="cmsSrcset \? sizes : undefined"/)
assert.match(image, /@error="onResponsiveError"/)
assert.match(image, /<picture v-else class="static-image-sources">/,
  'Keep the existing static AVIF/WebP picture behavior')
assert.match(home, /<StaticOptimizedImage :src="item\.image"[^\n]+sizes=/,
  'Home news cards must declare their actual display width')
assert.equal((news.match(/<StaticOptimizedImage/g) || []).length, 4,
  'All four news image placements must use the shared responsive component')
assert.equal((news.match(/<StaticOptimizedImage[^\n]+sizes=/g) || []).length, 4,
  'Each news image placement must declare sizes')
assert.match(news, /:loading="index === 0 \? 'eager' : 'lazy'"/,
  'Preserve priority of the lead story')
assert.match(news, /fetchpriority="high"/,
  'Preserve the article image LCP priority')
assert.match(site, /:sizes="sizes"/,
  'Inline CMS site images must accept sizing hints')
console.log('PASS CMS responsive image URLs, default-off, fallback and layout contracts')
