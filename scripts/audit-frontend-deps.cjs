#!/usr/bin/env node
'use strict';

// GHSA-fc5q-39xc-vjpf was withdrawn as not a security issue on 2026-11-18.
// https://github.com/advisories/GHSA-fc5q-39xc-vjpf
// No advisory whitelist or development-dependency exemption remains.
// Keep both full-tree and runtime audits strict: fail on any high/critical
// finding or npm/network failure. Do not weaken this gate for future PRs.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const front = path.join(__dirname, '..', 'frontend');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

for (const [label, args] of [
  ['full npm dependency tree (including dev)', ['audit', '--prefix', front, '--audit-level=high']],
  ['runtime npm dependencies', ['audit', '--prefix', front, '--omit=dev', '--audit-level=high']]
]) {
  console.log('SECURITY AUDIT: ' + label);
  const result = spawnSync(npm, args, { stdio: 'inherit' });
  if (result.error) {
    console.error('SECURITY AUDIT FAILED:', result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error('SECURITY AUDIT FAILED:', label + ', exit=' + String(result.status));
    process.exit(1);
  }
  console.log('PASS:', label);
}
