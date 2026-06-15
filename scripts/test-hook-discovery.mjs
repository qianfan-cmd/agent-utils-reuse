#!/usr/bin/env node
/**
 * Smoke tests for discovery heuristic (v0.2.0).
 * Usage: node scripts/test-hook-discovery.mjs [projectRoot]
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(__dirname, '..')

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

function recordIndexRead(cwd) {
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
    `${JSON.stringify(
      {
        hookMode: 'confirm',
        utilsDir: 'src/utils',
        utilsBookDir: 'docs/agent-catalog/utils-book',
        utilsImportAliases: ['@/utils'],
        remindWritePaths: ['src/feature', 'src/components', 'src/hooks', 'src/views']
      },
      null,
      2
    )}\n`
  )
}

resetAudit(projectRoot)

const helperPatch = `function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(file)
  })
}`

const denyNoDiscovery = runHook(projectRoot, {
  tool_input: {
    path: 'src/feature/test-discovery.vue',
    content: `<script setup lang="ts">\n${helperPatch}\n</script>\n`
  }
})
assert(
  'Write new local helper without Discovery → deny',
  denyNoDiscovery.permission === 'deny',
  JSON.stringify(denyNoDiscovery)
)

resetAudit(projectRoot)
recordIndexRead(projectRoot)

const allowAfterIndex = runHook(projectRoot, {
  tool_input: {
    path: 'src/feature/test-discovery.vue',
    content: `<script setup lang="ts">\n${helperPatch}\n</script>\n`
  }
})
assert(
  'After Read utils-book index → allow (no @/utils in file)',
  allowAfterIndex.permission === 'allow',
  JSON.stringify(allowAfterIndex)
)

resetAudit(projectRoot)
recordUtilsGrep(projectRoot)

const allowAfterGrep = runHook(projectRoot, {
  tool_input: {
    path: 'src/feature/test-discovery.vue',
    content: `<script setup lang="ts">\n${helperPatch}\n</script>\n`
  }
})
assert(
  'After Grep src/utils → allow (no @/utils in file)',
  allowAfterGrep.permission === 'allow',
  JSON.stringify(allowAfterGrep)
)

resetAudit(projectRoot)

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

if (process.exitCode) {
  console.error('\nSome discovery hook tests failed.')
  process.exit(1)
}
console.log('\nAll discovery hook tests passed.')
