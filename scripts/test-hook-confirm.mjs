#!/usr/bin/env node
/**
 * Smoke tests for hookMode confirm + merged-file util detection.
 * Usage: node scripts/test-hook-confirm.mjs [projectRoot]
 * Default projectRoot: ../ai-web if exists, else examples/minimal
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(__dirname, '..')

function resolveProjectRoot(arg) {
  if (arg) return path.resolve(arg)
  const aiWeb = path.resolve(pkgRoot, '../ai-web')
  if (fs.existsSync(path.join(aiWeb, 'package.json'))) return aiWeb
  return path.resolve(pkgRoot, 'examples/minimal')
}

function hookScript(cwd) {
  const inProject = path.join(cwd, '.cursor/hooks/check-discovery-before-shared-write.mjs')
  if (fs.existsSync(inProject)) return inProject
  return path.join(pkgRoot, 'templates/cursor/hooks/check-discovery-before-shared-write.mjs')
}

function runHook(cwd, input) {
  const script = hookScript(cwd)
  const libDir = path.dirname(script)
  const env = { ...process.env }
  if (!fs.existsSync(path.join(cwd, '.cursor/hooks/read-audit-lib.mjs'))) {
    env.NODE_PATH = libDir
  }
  const r = spawnSync(process.execPath, [script], {
    cwd,
    input: JSON.stringify(input),
    encoding: 'utf8',
    env
  })
  if (r.error) throw r.error
  const out = (r.stdout || '').trim()
  if (!out) {
    throw new Error(`Hook produced no stdout (stderr: ${r.stderr})`)
  }
  return JSON.parse(out)
}

function resetAudit(cwd) {
  const track = fs.existsSync(path.join(cwd, '.cursor/hooks/track-utils-reads.mjs'))
    ? path.join(cwd, '.cursor/hooks/track-utils-reads.mjs')
    : path.join(pkgRoot, 'templates/cursor/hooks/track-utils-reads.mjs')
  spawnSync(process.execPath, [track, '--reset'], { cwd, encoding: 'utf8' })
}

function recordRead(cwd, filePath) {
  const track = fs.existsSync(path.join(cwd, '.cursor/hooks/track-utils-reads.mjs'))
    ? path.join(cwd, '.cursor/hooks/track-utils-reads.mjs')
    : path.join(pkgRoot, 'templates/cursor/hooks/track-utils-reads.mjs')
  spawnSync(process.execPath, [track], {
    cwd,
    input: JSON.stringify({ tool_input: { path: filePath } }),
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

if (hasFeature) {
  const deny = runHook(projectRoot, {
    tool_input: {
      path: featureVue,
      old_string: '// hook-test-marker',
      new_string: '// hook-test-marker-updated'
    }
  })
  assert(
    'StrReplace without import in patch but file has @/utils → deny',
    deny.permission === 'deny',
    JSON.stringify(deny)
  )

  recordRead(projectRoot, 'src/utils/prompt/promptUtils.ts')
  recordRead(projectRoot, 'src/utils/chatFile/imageUploadUtils.ts')

  const allow = runHook(projectRoot, {
    tool_input: {
      path: featureVue,
      old_string: '// hook-test-marker-updated',
      new_string: '// hook-test-marker'
    }
  })
  assert(
    'After Read util files → allow',
    allow.permission === 'allow',
    JSON.stringify(allow)
  )
} else {
  console.log('SKIP: feature vue fixture not found — run from ai-web or pass project root')
}

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
