#!/usr/bin/env node
/**
 * Smoke tests for hookMode: off (default) — no preToolUse in hooks.json.
 * Usage: node scripts/test-hook-mode-off.mjs
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildHooksForMode, readHooksFragment } from '../lib/build-hooks-json.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(__dirname, '..')

function assert(name, cond, detail = '') {
  if (!cond) {
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`)
    process.exitCode = 1
    return false
  }
  console.log(`OK: ${name}`)
  return true
}

const fragment = readHooksFragment(path.join(pkgRoot, 'templates'))

const offDoc = buildHooksForMode(fragment, 'off')
assert('off mode has empty hooks', Object.keys(offDoc.hooks).length === 0)
assert('off mode has no preToolUse', !offDoc.hooks.preToolUse)

const remindDoc = buildHooksForMode(fragment, 'remind')
assert('remind mode has preToolUse only', remindDoc.hooks.preToolUse?.length === 1)
assert('remind mode has no postToolUse', !remindDoc.hooks.postToolUse)

const confirmDoc = buildHooksForMode(fragment, 'confirm')
assert('confirm mode has preToolUse', confirmDoc.hooks.preToolUse?.length === 1)
assert('confirm mode has postToolUse', confirmDoc.hooks.postToolUse?.length === 2)
assert('confirm mode has afterAgentResponse', confirmDoc.hooks.afterAgentResponse?.length === 1)

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-off-init-'))
try {
  fs.writeFileSync(
    path.join(tempDir, 'package.json'),
    `${JSON.stringify({ name: 'hook-off-test', private: true }, null, 2)}\n`
  )
  fs.writeFileSync(
    path.join(tempDir, '.utils-bookrc.json'),
    `${JSON.stringify({ hookMode: 'off', utilsDir: 'src/utils' }, null, 2)}\n`
  )

  const init = spawnSync(process.execPath, [path.join(pkgRoot, 'bin/cli.mjs'), 'init', '--yes', '--force'], {
    cwd: tempDir,
    encoding: 'utf8'
  })
  if (init.status !== 0) {
    throw new Error(`init failed: ${init.stderr}`)
  }

  const hooksJson = JSON.parse(fs.readFileSync(path.join(tempDir, '.cursor', 'hooks.json'), 'utf8'))
  assert('init with off writes empty hooks.json', Object.keys(hooksJson.hooks ?? {}).length === 0)

  const bookrc = JSON.parse(fs.readFileSync(path.join(tempDir, '.utils-bookrc.json'), 'utf8'))
  assert('bookrc hookMode is off', bookrc.hookMode === 'off')
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

if (process.exitCode) {
  console.error('\nSome hookMode off tests failed.')
  process.exit(1)
}
console.log('\nAll hookMode off tests passed.')
