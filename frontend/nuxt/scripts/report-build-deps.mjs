// Compare actual dependency resolutions in Ubuntu CI and node:22-alpine.
// This is intentionally read-only; it never modifies package versions.
// npm install generates the local Nuxt package-lock.json even though it is
// ignored by Git. Its exact graph is captured for intermittent Rollup failures.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'

const root = path.resolve(import.meta.dirname, '..')
const lockPath = path.join(root, 'package-lock.json')
const outputDir = path.join(root, '.build-diagnostics')
const targets = new Set([
  'nuxt', '@nuxt/nitro-server', 'nitropack', 'rollup', 'vite', 'vue',
  '@rollup/rollup-linux-x64-gnu', '@rollup/rollup-linux-x64-musl',
  'rolldown', '@rolldown/binding-linux-x64-gnu', '@rolldown/binding-linux-x64-musl',
  'oxc-parser', '@oxc-parser/binding-linux-x64-gnu', '@oxc-parser/binding-linux-x64-musl'
])

if (!fs.existsSync(lockPath)) {
  console.error('FAIL Nuxt dependency snapshot: npm install did not create package-lock.json')
  process.exit(1)
}
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
if (lock.lockfileVersion !== 3 || !lock.packages || !lock.packages['']) {
  console.error('FAIL Nuxt dependency snapshot: unexpected npm lockfile')
  process.exit(1)
}

const dependencies = []
for (const [location, value] of Object.entries(lock.packages)) {
  const name = location.split('/node_modules/').at(-1).replace(/^node_modules\//, '')
  if (targets.has(name) && typeof value.version === 'string') {
    dependencies.push({ name, version: value.version, location })
  }
}
dependencies.sort((a, b) => (a.name + a.location).localeCompare(b.name + b.location))
for (const required of ['nuxt', 'rollup', 'vite', 'vue']) {
  if (!dependencies.some(p => p.name === required)) {
    console.error('FAIL Nuxt dependency snapshot: missing ' + required)
    process.exit(1)
  }
}

// Digest only package names, locations and versions, not machine-specific
// tarball integrity fields. A difference in this fingerprint across CI and
// Docker means their transitive package resolution is not identical.
const fingerprint = createHash('sha256')
  .update(JSON.stringify(dependencies))
  .digest('hex')
const snapshot = {
  platform: process.platform,
  arch: process.arch,
  release: os.release(),
  node: process.version,
  npmUserAgent: process.env.npm_config_user_agent ?? 'not set',
  lockfileVersion: lock.lockfileVersion,
  selectedDependencyFingerprint: fingerprint,
  selectedDependencies: dependencies
}
fs.mkdirSync(outputDir, { recursive: true })
fs.writeFileSync(path.join(outputDir, 'nuxt-deps.json'), JSON.stringify(snapshot, null, 2) + '\n')
console.log('[nuxt-dependencies] platform=' + snapshot.platform + '/' + snapshot.arch
  + ', node=' + snapshot.node + ', fingerprint=' + fingerprint)
for (const entry of dependencies) {
  console.log('[nuxt-dependencies] ' + entry.name + '@' + entry.version + ' [' + entry.location + ']')
}
