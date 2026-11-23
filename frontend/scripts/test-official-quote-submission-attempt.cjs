#!/usr/bin/env node
// No network: verify the same quote-retry helper used by wizard and GIO under
// HTTPS/localhost and an insecure LAN HTTP origin with no SubtleCrypto.
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { randomUUID, webcrypto } = require('node:crypto')
const { TextEncoder } = require('node:util')

const source = fs.readFileSync(path.join(__dirname,
  '../src/lib/officialQuoteSubmissionAttempt.ts'),'utf8')
const js = ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText

function harness(secure) {
  const store = new Map()
  const storage = {
    getItem:key => store.get(key) ?? null,
    setItem:(key,value) => store.set(key,value),
    removeItem:key => store.delete(key)
  }
  const cryptoProvider = secure
    ? {randomUUID,subtle:webcrypto.subtle,getRandomValues:arr=>webcrypto.getRandomValues(arr)}
    : {getRandomValues:arr=>webcrypto.getRandomValues(arr)}
  const module = {exports:{}}
  vm.runInNewContext(js,{
    module,exports:module.exports,
    crypto:cryptoProvider,globalThis:{crypto:cryptoProvider},
    sessionStorage:storage,TextEncoder,Uint8Array,Date,JSON,Error
  },{filename:'officialQuoteSubmissionAttempt.transpiled.js'})
  return {store,api:module.exports}
}

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const original = JSON.stringify({contactName:'Fictional CI Contact',packages:3,weightKg:10})
const modified = JSON.stringify({contactName:'Fictional CI Contact',packages:4,weightKg:10})

async function testMode(secure) {
  const {store,api} = harness(secure)
  const key = secure ? 'https-test' : 'lan-http-test'
  const attempt = await api.prepareQuoteSubmissionAttempt(key,original,null)
  assert.match(attempt.key,uuidV4,'Creation UUID must always use secure v4 randomness')
  const resumed = await api.prepareQuoteSubmissionAttempt(key,original,
    secure ? null : attempt)
  assert.equal(resumed.key,attempt.key,'Retry must preserve original creation key')
  assert.equal(api.unresolvedKeyedQuoteAttempt(key,attempt),true,
    'A pending keyed request must not be downgraded if server disables support')
  assert.equal(api.unresolvedKeyedQuoteAttempt(key,null),secure,
    'Only the secure-session path retains the keyed identity after a page refresh')
  await assert.rejects(api.prepareQuoteSubmissionAttempt(key,modified,attempt),
    /Para evitar duplicados/,'Modified ambiguous request must be refused')
  if (secure) {
    assert.equal(attempt.digest.length,64,'HTTPS must have SHA256 fingerprint')
    assert.equal(attempt.transientBody,undefined,'Do not retain raw body in HTTPS path')
    assert.ok(store.has(key),'Secure tab stores a fingerprint for a lost receipt')
    assert.ok(!store.get(key).includes('Fictional CI Contact'),
      'No personal information is saved as raw body in session storage')
  } else {
    assert.equal(attempt.digest,'','LAN preview without SubtleCrypto uses memory only')
    assert.equal(attempt.transientBody,original,'LAN comparison stays in process memory')
    assert.equal(store.size,0,'Insecure LAN must not persist a non-SHA256 fingerprint')
  }
  assert.equal(api.legacyQuoteResultUncertain(key),false,
    'No legacy uncertainty before the first potential submission')
  api.setLegacyQuoteResultUncertain(key)
  assert.equal(api.legacyQuoteResultUncertain(key),true,
    'Legacy HTTP uncertainty survives navigation without storing a quote body')
  assert.equal(store.get(key+':unverified'),'1',
    'Legacy uncertainty marker must contain no identity or cargo data')
  api.clearQuoteSubmissionAttempt(key)
  assert.equal(store.has(key),false,'Verified receipt must clear the retry key')
  assert.equal(api.unresolvedKeyedQuoteAttempt(key,null),false,
    'A verified receipt frees the key for a new request')
  assert.equal(api.legacyQuoteResultUncertain(key),false,
    'A verified receipt also clears the legacy unknown-outcome marker')
}

(async()=>{
  await testMode(true)
  await testMode(false)
  console.log('PASS: HTTPS and LAN HTTP create secure UUIDv4, reuse key, block changed data, no raw PII storage.')
})().catch(err=>{console.error(err);process.exitCode=1})
