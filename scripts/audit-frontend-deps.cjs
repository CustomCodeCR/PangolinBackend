#!/usr/bin/env node
'use strict';

// Temporary and intentionally narrow exception for ONE UNPATCHED upstream
// dev-only advisory. Security issue: https://github.com/CustomCodeCR/PangolinBackend/issues/255
//
// Do not change this into npm audit --omit=dev for the entire build: the full
// audit must continue to fail when any new dev high/critical advisory appears.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ADVISORY = 'GHSA-fc5q-39xc-vjpf';
const AFFECTED = new Set(['picomatch', 'fdir', 'tinyglobby', 'vite']);
const HIGH = new Set(['high', 'critical']);
const front = path.join(__dirname, '..', 'frontend');
const lock = JSON.parse(fs.readFileSync(path.join(front, 'package-lock.json'), 'utf8'));

function fail(message) {
  console.error('SECURITY AUDIT FAILED:', message);
  process.exit(1);
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const audit = spawnSync(npm, ['audit', '--prefix', front, '--json'], {
  encoding: 'utf8', maxBuffer: 15 * 1024 * 1024
});
if (audit.error) fail(audit.error.message);
let report;
try { report = JSON.parse(audit.stdout); }
catch { fail('Could not parse npm full audit as JSON; do NOT skip this check'); }
if (report.error || !report.vulnerabilities) fail('Unexpected npm audit report: ' + (report.error?.code || 'no vulnerabilities section'));

// Production dependencies have NO exceptions. Preserve a strict gate for them.
const production = spawnSync(npm, ['audit', '--prefix', front, '--omit=dev', '--audit-level=high'], {
  encoding: 'utf8', maxBuffer: 15 * 1024 * 1024
});
if (production.error || production.status !== 0)
  fail('High/critical production dependency advisory detected!\n' +
    (production.stdout || '') + '\n' + (production.stderr || ''));
console.log('PASS: production dependencies have no high/critical audit findings.');

const severe = Object.entries(report.vulnerabilities).filter(([, v]) => HIGH.has(v.severity));
if (severe.length === 0) {
  console.log('PASS: no high/critical npm advisories, including dev tools.');
  process.exit(0);
}
// Every exception must be: one of the four expected *dev-only* advisories,
// descending solely from this exact published Picomatch GHSA.
// Any other finding, severity escalation, runtime exposure or changed graph FAILS.
if (severe.length !== 4 || severe.some(([name]) => !AFFECTED.has(name)) ||
    AFFECTED.size !== severe.length)
  fail('New/unexpected high or critical advisory: ' +
    severe.map(([n, v]) => n + '(' + v.severity + ')').join(', '));

let foundRootAdvisory = false;
for (const [name, details] of severe) {
  const pkg = lock.packages['node_modules/' + name];
  if (!pkg || pkg.dev !== true)
    fail(name + ' is no longer exclusively a development dependency');
  if (details.severity !== 'high')
    fail(name + ' is now critical or severity changed');
  if (!Array.isArray(details.via) || details.via.length < 1)
    fail(name + ' lacks the expected vulnerability dependency chain');
  for (const via of details.via) {
    if (typeof via === 'string') {
      if (!AFFECTED.has(via))
        fail('Unexpected vulnerable dependency ' + via + ' via ' + name);
      continue;
    }
    if (!via || via.name !== 'picomatch' ||
        !String(via.url || '').includes(ADVISORY) ||
        via.severity !== 'high')
      fail('Unexpected advisory for ' + name + ': ' + JSON.stringify(via));
    foundRootAdvisory = true;
  }
}
if (!foundRootAdvisory || !String(JSON.stringify(report.vulnerabilities.picomatch)).includes(ADVISORY))
  fail('Original advisory identity changed: cannot apply temporary exception');

console.warn('KNOWN UNPATCHED BUILD-TIME RISK (NOT FIXED): ' + ADVISORY);
console.warn('Only four existing dev-only transitive findings: ' +
  severe.map(([n]) => n).join(', '));
console.warn('Upstream has not released a fix. Track: https://github.com/CustomCodeCR/PangolinBackend/issues/255');
console.warn('CI still fails on new high/critical advisories, critical severity escalation,');
console.warn('or any production dependency issue. Remove exception once fixed.');
