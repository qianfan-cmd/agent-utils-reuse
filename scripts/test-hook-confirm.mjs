#!/usr/bin/env node
/**
 * Smoke tests for hookMode confirm + merged-file util detection + Verdict audit (v0.2.1).
 * Usage: node scripts/test-hook-confirm.mjs [projectRoot]
 * Default projectRoot: ../ai-web if exists, else examples/minimal
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(__dirname, '..')

const SAMPLE_VERDICT = `Confirm uploadSingleFile: Q1 file input Q2 upload API Q3 side effects Q4 matches Q5 no
Verdict（最终）: reuse(uploadSingleFile)`

const HOLLOW_VERDICT = `Confirm: Q1-Q5 通过
Verdict（最终）: reuse(uploadSingleFile)`

function resolveProjectRoot(arg) {
  if (arg) return path.resolve(arg)
  const aiWeb = path.resolve(pkgRoot, '../ai-web')
  if (fs.existsSync(path.join(aiWeb, 'package.json'))) return aiWeb
  return path.resolve(pkgRoot, 'examples/minimal')
}

function hookPath(_cwd, name) {
  return path.join(pkgRoot, 'templates/cursor/hooks', name)
}

function hookScript(cwd) {
  return hookPath(cwd, 'check-discovery-before-shared-write.mjs')
}

function runHook(cwd, input) {
  const script = hookScript(cwd)
  const r = spawnSync(process.execPath, [script], {
    cwd,
    input: JSON.stringify(input),
    encoding: 'utf8'
  })
  if (r.error) throw r.error
  const out = (r.stdout || '').trim()
  if (!out) {
    throw new Error(`Hook produced no stdout (stderr: ${r.stderr})`)
  }
  return JSON.parse(out)
}

function resetAudit(cwd) {
  spawnSync(process.execPath, [hookPath(cwd, 'track-utils-reads.mjs'), '--reset'], {
    cwd,
    encoding: 'utf8'
  })
}

function recordRead(cwd, filePath) {
  spawnSync(process.execPath, [hookPath(cwd, 'track-utils-reads.mjs')], {
    cwd,
    input: JSON.stringify({ tool_input: { path: filePath } }),
    encoding: 'utf8'
  })
}

function recordVerdict(cwd, text = SAMPLE_VERDICT) {
  const r = spawnSync(process.execPath, [hookPath(cwd, 'track-utils-verdict.mjs')], {
    cwd,
    input: JSON.stringify({ text }),
    encoding: 'utf8'
  })
  const out = (r.stdout || '').trim()
  if (!out) return { recorded: false }
  try {
    return JSON.parse(out)
  } catch {
    return { recorded: false }
  }
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

const bookrcPath = path.join(projectRoot, '.utils-bookrc.json')
if (fs.existsSync(bookrcPath)) {
  const rc = JSON.parse(fs.readFileSync(bookrcPath, 'utf8'))
  rc.hookMode = 'confirm'
  fs.writeFileSync(bookrcPath, `${JSON.stringify(rc, null, 2)}\n`)
} else {
  fs.writeFileSync(
    bookrcPath,
    `${JSON.stringify({ hookMode: 'confirm', utilsDir: 'src/utils', utilsImportAliases: ['@/utils'], remindWritePaths: ['src/feature', 'src/components', 'src/hooks', 'src/views'] }, null, 2)}\n`
  )
}

const featureVue = 'src/feature/ai-art/components/art-generate-input.vue'
const featurePath = path.join(projectRoot, featureVue)
const hasFeature = fs.existsSync(featurePath)

resetAudit(projectRoot)

assert(
  'hollow Q1-Q5 通过 not recorded as Verdict',
  recordVerdict(projectRoot, HOLLOW_VERDICT).recorded !== true
)

resetAudit(projectRoot)

if (hasFeature) {
  const denyRead = runHook(projectRoot, {
    tool_input: {
      path: featureVue,
      old_string: '// hook-test-marker',
      new_string: '// hook-test-marker-updated'
    }
  })
  assert(
    'StrReplace without import in patch but file has @/utils → deny (read)',
    denyRead.permission === 'deny',
    JSON.stringify(denyRead)
  )

  recordRead(projectRoot, 'src/utils/prompt/promptUtils.ts')
  recordRead(projectRoot, 'src/utils/chatFile/imageUploadUtils.ts')

  const denyVerdict = runHook(projectRoot, {
    tool_input: {
      path: featureVue,
      old_string: '// hook-test-marker-updated',
      new_string: '// hook-test-marker'
    }
  })
  assert(
    'After Read util files but no Verdict → deny',
    denyVerdict.permission === 'deny',
    JSON.stringify(denyVerdict)
  )

  recordVerdict(projectRoot)

  const allow = runHook(projectRoot, {
    tool_input: {
      path: featureVue,
      old_string: '// hook-test-marker',
      new_string: '// hook-test-marker-updated'
    }
  })
  assert(
    'After Read util files + substantive Verdict → allow',
    allow.permission === 'allow',
    JSON.stringify(allow)
  )
} else {
  console.log('SKIP: feature vue fixture not found — run from ai-web or pass project root')
}

resetAudit(projectRoot)

const writeDeny = runHook(projectRoot, {
  tool_input: {
    path: 'src/feature/test-utils-gate.vue',
    content: 'import { X } from "@/utils/foo"\n'
  }
})
assert('Write new file with @/utils import, empty audit → deny', writeDeny.permission === 'deny')

if (process.exitCode) {
  console.error('\nSome tests failed.')
  process.exit(1)
}
console.log('\nAll hook confirm tests passed.')
