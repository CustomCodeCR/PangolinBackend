// Offline inventory of the actual generated catalog, not a second hand-written list.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
function evaluate(relative, imports) {
  const input = fs.readFileSync(path.join(root, relative), 'utf8')
  const { outputText } = ts.transpileModule(input, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  })
  const mod = { exports: {} }
  const localRequire = name => {
    assert.ok(Object.hasOwn(imports, name), 'Unexpected catalog import: ' + name)
    return imports[name]
  }
  // Only repository-owned catalog and benefit data are executed; no app or network.
  new Function('require', 'module', 'exports', outputText)(localRequire, mod, mod.exports)
  return mod.exports
}
const extras = evaluate('src/lib/serviceExtraBenefits.ts', {})
const { siteSlotCatalog } = evaluate('src/siteCmsCatalog.ts', {
  '../seo/service-landings.json': require('../seo/service-landings.json'),
  '../seo/service-pages.json': require('../seo/service-pages.json'),
  '../seo/service-faqs.json': require('../seo/service-faqs.json'),
  './lib/serviceExtraBenefits': extras
})
assert.ok(Array.isArray(siteSlotCatalog) && siteSlotCatalog.length > 0)
const keys = new Set()
const groups = {}
for (const slot of siteSlotCatalog) {
  assert.ok(/^[a-zA-Z0-9.-]+$/.test(slot.key), 'Invalid key: ' + slot.key)
  assert.ok(!keys.has(slot.key), 'Duplicate CMS key: ' + slot.key)
  assert.ok(['text', 'media'].includes(slot.type), 'Invalid type: ' + slot.key)
  keys.add(slot.key)
  groups[slot.page] = (groups[slot.page] || 0) + 1
}
const slots = siteSlotCatalog.map(({key, type, page}) => ({key, type, page}))
const output = process.argv[2]
assert.ok(output, 'Provide an output path for the offline backend check')
fs.writeFileSync(output, JSON.stringify(slots))
console.log('CMS inventory:', slots.length, 'locations;', slots.filter(s => s.type === 'media').length, 'media;', JSON.stringify(groups))
