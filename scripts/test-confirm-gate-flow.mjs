#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import { loadDiscoveryAudit } from '../templates/cursor/hooks/read-audit-lib.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(__dirname, '..')

function hookPath(name) {
  return path.join(PACKAGE_ROOT, 'templates/cursor/hooks', name)
}

function runHook(script, cwd, input) {
  const r = spawnSync(process.execPath, [script], {
    cwd,
    input: JSON.stringify(input),
    encoding: 'utf8'
  })
  if (r.error) throw r.error
  const out = (r.stdout || '').trim()
  if (!out) throw new Error(`Hook no stdout: ${r.stderr}`)
  return JSON.parse(out)
}

function resetSession(cwd) {
  spawnSync(process.execPath, [hookPath('track-utils-reads.mjs'), '--reset'], { cwd, encoding: 'utf8' })
  const discoveryPath = path.join(cwd, '.cursor', '.utils-gate-discovery.json')
  if (fs.existsSync(discoveryPath)) fs.unlinkSync(discoveryPath)
  const verdictPath = path.join(cwd, '.cursor', '.utils-gate-verdict.json')
  if (fs.existsSync(verdictPath)) fs.unlinkSync(verdictPath)
}

function patchBookrc(cwd, patch) {
  const bookrcPath = path.join(cwd, '.utils-bookrc.json')
  const base = JSON.parse(fs.readFileSync(bookrcPath, 'utf8'))
  fs.writeFileSync(bookrcPath, `${JSON.stringify({ ...base, ...patch }, null, 2)}\n`, 'utf8')
}

function recordAgentsRead(cwd) {
  spawnSync(process.execPath, [hookPath('track-utils-reads.mjs')], {
    cwd,
    input: JSON.stringify({ tool_input: { path: 'AGENTS.md' } }),
    encoding: 'utf8'
  })
}

function recordRead(cwd, filePath) {
  spawnSync(process.execPath, [hookPath('track-utils-reads.mjs')], {
    cwd,
    input: JSON.stringify({ tool_input: { path: filePath } }),
    encoding: 'utf8'
  })
}

function recordDiscovery(cwd, toolInput) {
  spawnSync(process.execPath, [hookPath('track-utils-discovery.mjs')], {
    cwd,
    input: JSON.stringify({ tool_input: toolInput }),
    encoding: 'utf8'
  })
}

function recordVerdict(cwd, text) {
  spawnSync(process.execPath, [hookPath('track-utils-verdict.mjs')], {
    cwd,
    input: JSON.stringify({ text }),
    encoding: 'utf8'
  })
}

function setupConfirmProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-utils-reuse-confirm-flow-'))
  const minimal = path.join(PACKAGE_ROOT, 'examples/minimal')
  for (const rel of ['src', 'docs', 'AGENTS.md', 'package.json']) {
    const from = path.join(minimal, rel)
    const to = path.join(dir, rel)
    if (fs.statSync(from).isDirectory()) {
      fs.cpSync(from, to, { recursive: true })
    } else {
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.copyFileSync(from, to)
    }
  }
  fs.mkdirSync(path.join(dir, '.cursor'), { recursive: true })
  const minimalBookrc = path.join(minimal, '.utils-bookrc.json')
  if (fs.existsSync(minimalBookrc)) {
    fs.copyFileSync(minimalBookrc, path.join(dir, '.utils-bookrc.json'))
  }
  patchBookrc(dir, { hookMode: 'confirm', sameTurnAllow: true })
  return dir
}

const D1_CONFIRM = `D1 "upload": sortAsc @ src/utils/array/sortArray.ts

| Symbol | Read @ path | Q4 | Verdict |
| sortAsc | sortArray.ts | OK; reject sortDesc | reuse(sortAsc) |

**Verdict（最终）**：reuse(sortAsc)`

const BATCH_CONFIRM = `D1 "batch": a @ src/utils/batch.ts, b @ src/utils/batch.ts

| Symbol | Read @ path | Q4 | Verdict |
| a | batch.ts | OK | reuse(a) |
| b | batch.ts | OK | reuse(b) |
| c | batch.ts | OK | reuse(c) |
| d | batch.ts | OK | reuse(d) |
| e | batch.ts | OK | reuse(e) |
| f | batch.ts | OK | reuse(f) |

**Verdict（最终）**：reuse(a)`

try {
  const cwd = setupConfirmProject()
  const gateHook = hookPath('check-discovery-before-shared-write.mjs')
  const viewsDir = path.join(cwd, 'src/views')
  fs.mkdirSync(viewsDir, { recursive: true })
  const viewPath = path.join(viewsDir, 'ExamPage.vue')
  fs.writeFileSync(viewPath, '<script setup lang="ts">\n</script>\n', 'utf8')

  resetSession(cwd)
  recordAgentsRead(cwd)
  recordRead(cwd, 'src/utils/array/sortArray.ts')

  const noDiscovery = runHook(gateHook, cwd, {
    tool_input: {
      path: 'src/views/ExamPage.vue',
      old_string: '<script',
      new_string: '<script\nimport { sortAsc } from "@/utils/array/sortArray"\n'
    }
  })
  assert.equal(noDiscovery.permission, 'deny', JSON.stringify(noDiscovery))
  assert.equal(noDiscovery.denyReason, 'missing_discovery_for_util')

  resetSession(cwd)
  recordAgentsRead(cwd)
  recordRead(cwd, 'src/utils/array/sortArray.ts')
  recordDiscovery(cwd, { path: 'src/utils', pattern: 'sortAsc' })
  recordVerdict(cwd, D1_CONFIRM)

  const d2Only = runHook(gateHook, cwd, {
    tool_input: {
      path: 'src/views/ExamPage.vue',
      old_string: '<script',
      new_string: '<script\nimport { sortAsc } from "@/utils/array/sortArray"\n'
    }
  })
  assert.equal(d2Only.permission, 'deny', JSON.stringify(d2Only))
  assert.equal(d2Only.denyReason, 'prefer_cli_search')

  resetSession(cwd)
  recordAgentsRead(cwd)
  recordRead(cwd, 'src/utils/array/sortArray.ts')
  recordDiscovery(cwd, { path: 'docs/agent-catalog/utils-index.json', pattern: 'sortAsc' })
  recordVerdict(cwd, BATCH_CONFIRM)

  const batchDir = path.join(cwd, 'src/utils')
  fs.mkdirSync(batchDir, { recursive: true })
  fs.writeFileSync(path.join(batchDir, 'batch.ts'), 'export const a=1,b=2,c=3,d=4,e=5,f=6\n', 'utf8')
  recordRead(cwd, 'src/utils/batch.ts')

  const batchDeny = runHook(gateHook, cwd, {
    tool_input: {
      path: 'src/views/ExamPage.vue',
      old_string: '<script',
      new_string: '<script\nimport { a, b, c, d, e, f } from "@/utils/batch"\n'
    }
  })
  assert.equal(batchDeny.permission, 'deny', JSON.stringify(batchDeny))
  assert.equal(batchDeny.denyReason, 'batch_limit_exceeded')

  resetSession(cwd)
  recordAgentsRead(cwd)
  recordRead(cwd, 'src/utils/array/sortArray.ts')
  recordDiscovery(cwd, { path: 'docs/agent-catalog/utils-index.json', pattern: 'sortAsc' })

  const sameTurnAllow = runHook(gateHook, cwd, {
    text: D1_CONFIRM,
    tool_input: {
      path: 'src/views/ExamPage.vue',
      old_string: '<script',
      new_string: '<script\nimport { sortAsc } from "@/utils/array/sortArray"\n'
    }
  })
  assert.equal(sameTurnAllow.permission, 'allow', JSON.stringify(sameTurnAllow))

  patchBookrc(cwd, { sameTurnAllow: false })
  resetSession(cwd)
  recordAgentsRead(cwd)
  recordRead(cwd, 'src/utils/array/sortArray.ts')
  recordDiscovery(cwd, { path: 'docs/agent-catalog/utils-index.json', pattern: 'sortAsc' })

  const splitTurnDeny = runHook(gateHook, cwd, {
    text: D1_CONFIRM,
    tool_input: {
      path: 'src/views/ExamPage.vue',
      old_string: '<script',
      new_string: '<script\nimport { sortAsc } from "@/utils/array/sortArray"\n'
    }
  })
  assert.equal(splitTurnDeny.permission, 'deny', JSON.stringify(splitTurnDeny))
  assert.equal(splitTurnDeny.denyReason, 'verdict_not_recorded')

  patchBookrc(cwd, { sameTurnAllow: true })
  resetSession(cwd)
  recordAgentsRead(cwd)
  recordRead(cwd, 'src/utils/array/sortArray.ts')
  recordDiscovery(cwd, { path: 'docs/agent-catalog/utils-index.json', pattern: 'sortAsc' })
  recordVerdict(cwd, D1_CONFIRM)

  const priorTurnAllow = runHook(gateHook, cwd, {
    tool_input: {
      path: 'src/views/ExamPage.vue',
      old_string: '<script',
      new_string: '<script\nimport { sortAsc } from "@/utils/array/sortArray"\n'
    }
  })
  assert.equal(priorTurnAllow.permission, 'allow', JSON.stringify(priorTurnAllow))

  resetSession(cwd)
  recordDiscovery(cwd, { path: 'src/views/ExamPage.vue', pattern: '@/utils' })
  const audit = loadDiscoveryAudit(cwd)
  assert.ok(audit.via.includes('business-lookup'), JSON.stringify(audit))

  console.log('test-confirm-gate-flow: OK')
} catch (err) {
  console.error(err)
  process.exit(1)
}
