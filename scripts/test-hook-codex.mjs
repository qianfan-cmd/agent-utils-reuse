#!/usr/bin/env node
/**
 * Smoke tests for Codex hook runtime (apply_patch path + deny).
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(__dirname, '..')

function runHook(cwd, input) {
  return spawnSync(
    process.execPath,
    [path.join(pkgRoot, 'templates/codex/hooks/check-discovery-before-shared-write.mjs')],
    { cwd, input: JSON.stringify(input), encoding: 'utf8' }
  )
}

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'utils-gate-codex-'))
  fs.writeFileSync(
    path.join(tmp, '.utils-bookrc.json'),
    JSON.stringify({ hookMode: 'confirm', utilsDir: 'src/utils', remindWritePaths: ['src/views'] }, null, 2)
  )

  const deny = runHook(tmp, {
    tool_input: { path: 'src/views/Page.vue', content: "import { sortDesc } from '@/utils/array/sortArray'" }
  })
  if (deny.status !== 2) {
    console.error('Expected exit 2 for Codex deny', deny.status)
    process.exit(1)
  }
  console.log('OK: Codex PreToolUse deny → exit 2')

  const allow = runHook(tmp, { tool_input: { path: 'docs/readme.md', content: 'text' } })
  if (allow.status !== 0) {
    console.error('Expected exit 0 for non-gate file')
    process.exit(1)
  }
  console.log('OK: Codex non-gate path → exit 0')

  console.log('\nAll Codex hook tests passed.')
}

main()
