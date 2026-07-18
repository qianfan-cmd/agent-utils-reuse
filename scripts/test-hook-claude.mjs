#!/usr/bin/env node
/**
 * Smoke tests for Claude Code hook runtime (PreToolUse deny via exit 2).
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(__dirname, '..')

function hookScript(name) {
  return path.join(pkgRoot, 'templates/claude/hooks', name)
}

function runHook(cwd, scriptName, input, extraArgs = []) {
  const r = spawnSync(process.execPath, [hookScript(scriptName), ...extraArgs], {
    cwd,
    input: JSON.stringify(input),
    encoding: 'utf8'
  })
  return r
}

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'utils-gate-claude-'))
  fs.writeFileSync(
    path.join(tmp, '.utils-bookrc.json'),
    JSON.stringify({ hookMode: 'confirm', utilsDir: 'src/utils', remindWritePaths: ['src/feature'] }, null, 2)
  )

  const deny = runHook(tmp, 'check-discovery-before-shared-write.mjs', {
    tool_input: { path: 'src/feature/List.vue', content: "import { x } from '@/utils/foo'" }
  })
  if (deny.status !== 2) {
    console.error('Expected exit 2 for Claude deny, got', deny.status, deny.stdout, deny.stderr)
    process.exit(1)
  }
  if (!String(deny.stderr).includes('Denied')) {
    console.error('Expected deny message on stderr')
    process.exit(1)
  }
  console.log('OK: Claude PreToolUse deny → exit 2 + stderr')

  const allow = runHook(tmp, 'check-discovery-before-shared-write.mjs', {
    tool_input: { path: 'README.md', content: 'hello' }
  })
  if (allow.status !== 0) {
    console.error('Expected exit 0 for non-gate path', allow.status, allow.stderr)
    process.exit(1)
  }
  console.log('OK: Claude non-gate Write → exit 0')

  console.log('\nAll Claude hook tests passed.')
}

main()
