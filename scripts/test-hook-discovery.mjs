#!/usr/bin/env node
/**
 * Smoke tests for discovery + local helpers table heuristic (v0.3.0 KV D1).
 * Usage: node scripts/test-hook-discovery.mjs [projectRoot]
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateUtilsBook } from '../lib/generate-utils-book.mjs'
import { loadConfig } from '../lib/load-config.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(__dirname, '..')

const SAMPLE_VERDICT_WITH_TABLE = `D1: Grep utils-index fileToBase64 @ path

Local helpers
| 本地函数 | utils 候选 | 对照结论 |
| readFileAsDataUrl | fileToBase64 @ imageUploadUtils.ts | reuse(fileToBase64) |

Confirm readFileAsDataUrl: Q1 File Q2 data URL Q3 FileReader Q4 same as fileToBase64 Q5 no
Verdict（最终）: reuse(fileToBase64)`

const SAMPLE_VERDICT_NO_TABLE = `Confirm readFileAsDataUrl: Q1 File Q2 data URL Q3 FileReader Q4 same Q5 no
Verdict（最终）: reuse(fileToBase64)`

function resolveProjectRoot(arg) {
  if (arg) return path.resolve(arg)
  return path.resolve(pkgRoot, 'examples/minimal')
}

function hookPath(_cwd, name) {
  return path.join(pkgRoot, 'templates/cursor/hooks', name)
}

function runHook(cwd, input) {
  const script = hookPath(cwd, 'check-discovery-before-shared-write.mjs')
  const r = spawnSync(process.execPath, [script], {
    cwd,
    input: JSON.stringify(input),
    encoding: 'utf8'
  })
  if (r.error) throw r.error
  const out = (r.stdout || '').trim()
  if (!out) throw new Error(`Hook produced no stdout (stderr: ${r.stderr})`)
  return JSON.parse(out)
}

function resetAudit(cwd) {
  spawnSync(process.execPath, [hookPath(cwd, 'track-utils-reads.mjs'), '--reset'], {
    cwd,
    encoding: 'utf8'
  })
}

function recordAgentsRead(cwd, agentsFile = 'AGENTS.md') {
  spawnSync(process.execPath, [hookPath(cwd, 'track-utils-reads.mjs')], {
    cwd,
    input: JSON.stringify({ tool_input: { path: agentsFile } }),
    encoding: 'utf8'
  })
}

function prepareGateSession(cwd) {
  resetAudit(cwd)
  recordAgentsRead(cwd)
}

function recordIndexGrep(cwd, indexPath) {
  spawnSync(process.execPath, [hookPath(cwd, 'track-utils-discovery.mjs')], {
    cwd,
    input: JSON.stringify({
      tool_input: { pattern: 'sortAsc', path: indexPath }
    }),
    encoding: 'utf8'
  })
}

function recordShellSearch(cwd) {
  spawnSync(process.execPath, [hookPath(cwd, 'track-utils-discovery.mjs')], {
    cwd,
    input: JSON.stringify({
      tool_input: {
        command: 'node node_modules/agent-utils-reuse/bin/cli.mjs search "数组 排序"'
      }
    }),
    encoding: 'utf8'
  })
}

function recordLegacyIndexRead(cwd) {
  spawnSync(process.execPath, [hookPath(cwd, 'track-utils-reads.mjs')], {
    cwd,
    input: JSON.stringify({
      tool_input: { path: 'docs/agent-catalog/utils-book/index.md' }
    }),
    encoding: 'utf8'
  })
}

function recordUtilsGrep(cwd) {
  spawnSync(process.execPath, [hookPath(cwd, 'track-utils-discovery.mjs')], {
    cwd,
    input: JSON.stringify({
      tool_input: { pattern: 'fileToBase64', path: 'src/utils' }
    }),
    encoding: 'utf8'
  })
}

function recordVerdict(cwd, text) {
  spawnSync(process.execPath, [hookPath(cwd, 'track-utils-verdict.mjs')], {
    cwd,
    input: JSON.stringify({ text }),
    encoding: 'utf8'
  })
}

function assert(name, cond, detail = '') {
  if (!cond) {
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`)
    process.exitCode = 1
    return false
  }
  console.log(`OK: ${name}`)
  return true
}

const projectRoot = resolveProjectRoot(process.argv[2])
console.log(`Project root: ${projectRoot}`)

generateUtilsBook(loadConfig(projectRoot))

const bookrcPath = path.join(projectRoot, '.utils-bookrc.json')
const indexPath = 'docs/agent-catalog/utils-index.json'
if (fs.existsSync(bookrcPath)) {
  const rc = JSON.parse(fs.readFileSync(bookrcPath, 'utf8'))
  rc.hookMode = 'confirm'
  rc.utilsIndexFile = rc.utilsIndexFile || indexPath
  fs.writeFileSync(bookrcPath, `${JSON.stringify(rc, null, 2)}\n`)
} else {
  fs.writeFileSync(
    bookrcPath,
    `${JSON.stringify(
      {
        hookMode: 'confirm',
        utilsDir: 'src/utils',
        utilsBookDir: 'docs/agent-catalog/utils-book',
        utilsIndexFile: indexPath,
        utilsImportAliases: ['@/utils'],
        remindWritePaths: ['src/feature', 'src/components', 'src/hooks', 'src/views']
      },
      null,
      2
    )}\n`
  )
}

prepareGateSession(projectRoot)

const helperPatch = `function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(file)
  })
}`

const helperWrite = {
  tool_input: {
    path: 'src/feature/test-discovery.vue',
    content: `<script setup lang="ts">\n${helperPatch}\n</script>\n`
  }
}

const denyNoDiscovery = runHook(projectRoot, helperWrite)
assert(
  'Write new local helper without Discovery → deny',
  denyNoDiscovery.permission === 'deny',
  JSON.stringify(denyNoDiscovery)
)

prepareGateSession(projectRoot)
recordLegacyIndexRead(projectRoot)

const denyLegacyMd = runHook(projectRoot, helperWrite)
assert(
  'Read utils-book index.md no longer counts as Discovery → deny',
  denyLegacyMd.permission === 'deny',
  JSON.stringify(denyLegacyMd)
)

prepareGateSession(projectRoot)
recordIndexGrep(projectRoot, indexPath)

const denyNoVerdict = runHook(projectRoot, helperWrite)
assert(
  'After Grep utils-index but no Verdict → deny',
  denyNoVerdict.permission === 'deny',
  JSON.stringify(denyNoVerdict)
)

prepareGateSession(projectRoot)
recordIndexGrep(projectRoot, indexPath)
recordVerdict(projectRoot, SAMPLE_VERDICT_NO_TABLE)

const denyNoTable = runHook(projectRoot, helperWrite)
assert(
  'Discovery + Verdict without Local helpers table → deny',
  denyNoTable.permission === 'deny',
  JSON.stringify(denyNoTable)
)

prepareGateSession(projectRoot)
recordShellSearch(projectRoot)
recordVerdict(projectRoot, SAMPLE_VERDICT_WITH_TABLE)

const allowShellSearch = runHook(projectRoot, helperWrite)
assert(
  'Shell search + Verdict + Local helpers table → allow',
  allowShellSearch.permission === 'allow',
  JSON.stringify(allowShellSearch)
)

prepareGateSession(projectRoot)
recordIndexGrep(projectRoot, indexPath)
recordVerdict(projectRoot, SAMPLE_VERDICT_WITH_TABLE)

const allowFull = runHook(projectRoot, helperWrite)
assert(
  'Grep utils-index + substantive Verdict + Local helpers table → allow',
  allowFull.permission === 'allow',
  JSON.stringify(allowFull)
)

prepareGateSession(projectRoot)
recordUtilsGrep(projectRoot)
recordVerdict(projectRoot, SAMPLE_VERDICT_WITH_TABLE)

const allowAfterGrep = runHook(projectRoot, helperWrite)
assert(
  'After Grep src/utils + Verdict + table → allow',
  allowAfterGrep.permission === 'allow',
  JSON.stringify(allowAfterGrep)
)

prepareGateSession(projectRoot)

const allowCommentOnly = runHook(projectRoot, {
  tool_input: {
    path: 'src/feature/test-discovery.vue',
    old_string: '// marker-a',
    new_string: '// marker-b'
  }
})
assert(
  'StrReplace comment-only without Discovery → allow',
  allowCommentOnly.permission === 'allow',
  JSON.stringify(allowCommentOnly)
)

// --- v0.3.5: Grep with absolute utilsDir path ---
resetAudit(projectRoot)
const absUtilsPath = path.join(projectRoot, 'src/utils').replace(/\\/g, '/')
spawnSync(process.execPath, [hookPath(projectRoot, 'track-utils-discovery.mjs')], {
  cwd: projectRoot,
  input: JSON.stringify({
    tool_input: { pattern: 'fileToBase64', path: absUtilsPath }
  }),
  encoding: 'utf8'
})
const absDiscAudit = JSON.parse(
  fs.readFileSync(path.join(projectRoot, '.cursor', '.utils-gate-discovery.json'), 'utf8')
)
assert(
  'Grep absolute path to src/utils → discovery recorded',
  absDiscAudit.recorded === true,
  JSON.stringify(absDiscAudit)
)
assert(
  'Grep utilsDir records via d2-utils-dir',
  absDiscAudit.via.includes('d2-utils-dir'),
  JSON.stringify(absDiscAudit)
)

resetAudit(projectRoot)
spawnSync(process.execPath, [hookPath(projectRoot, 'track-utils-discovery.mjs')], {
  cwd: projectRoot,
  input: JSON.stringify({ tool_input: { pattern: 'sortAsc', path: indexPath } }),
  encoding: 'utf8'
})
const indexDisc = JSON.parse(
  fs.readFileSync(path.join(projectRoot, '.cursor', '.utils-gate-discovery.json'), 'utf8')
)
assert('Grep utils-index records via grep-index', indexDisc.via.includes('grep-index'), JSON.stringify(indexDisc))

resetAudit(projectRoot)
recordShellSearch(projectRoot)
const cliDisc = JSON.parse(
  fs.readFileSync(path.join(projectRoot, '.cursor', '.utils-gate-discovery.json'), 'utf8')
)
assert('Shell search records via cli', cliDisc.via.includes('cli'), JSON.stringify(cliDisc))

const HELPER_HEADER_VERDICT = `D1: Grep utils-index fileToBase64 @ path
| Helper | utils 候选 | 对照结论 |
| readFileAsDataUrl | fileToBase64 @ imageUploadUtils.ts | reuse(fileToBase64) |

Confirm readFileAsDataUrl: Q1 File Q2 data URL Q3 FileReader Q4 same as fileToBase64 Q5 no
Verdict（最终）: reuse(fileToBase64)`

prepareGateSession(projectRoot)
spawnSync(process.execPath, [hookPath(projectRoot, 'track-utils-discovery.mjs')], {
  cwd: projectRoot,
  input: JSON.stringify({ tool_input: { pattern: 'fileToBase64', path: absUtilsPath } }),
  encoding: 'utf8'
})
recordVerdict(projectRoot, HELPER_HEADER_VERDICT)
const allowHelperHeader = runHook(projectRoot, helperWrite)
assert(
  'Absolute-path Discovery + | Helper | table Verdict → allow',
  allowHelperHeader.permission === 'allow',
  JSON.stringify(allowHelperHeader)
)

if (process.exitCode) {
  console.error('\nSome discovery hook tests failed.')
  process.exit(1)
}
console.log('\nAll discovery hook tests passed.')
