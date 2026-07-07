#!/usr/bin/env node
/**
 * Smoke tests for hookMode confirm + merged-file util detection + Verdict audit (v0.2.1).
 * Usage: node scripts/test-hook-confirm.mjs [projectRoot]
 * Default projectRoot: examples/minimal
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(__dirname, '..')

const SAMPLE_VERDICT = `Confirm uploadSingleFile: Q1 file input Q2 upload API Q3 side effects Q4 matches Q5 no
Verdict（最终）: reuse(uploadSingleFile)`

/** Test harness: confirm hooks without Discovery/batch defaults (see test-confirm-gate-flow.mjs). */
const TEST_CONFIRM_GATE_OPTOUT = {
  requireDiscoveryForUtilGate: false,
  preferCliSearch: false,
  strictBatchLimit: false,
  allowBusinessDiscovery: false
}

function mergeTestConfirmBookrc(rc = {}) {
  return { hookMode: 'confirm', ...TEST_CONFIRM_GATE_OPTOUT, ...rc }
}

const HOLLOW_VERDICT = `Confirm: Q1-Q5 通过
Verdict（最终）: reuse(uploadSingleFile)`

function resolveProjectRoot(arg) {
  if (arg) return path.resolve(arg)
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

function recordAgentsRead(cwd, agentsFile = 'AGENTS.md') {
  spawnSync(process.execPath, [hookPath(cwd, 'track-utils-reads.mjs')], {
    cwd,
    input: JSON.stringify({ tool_input: { path: agentsFile } }),
    encoding: 'utf8'
  })
}

function prepareGateSession(cwd, agentsFile = 'AGENTS.md') {
  resetAudit(cwd)
  recordAgentsRead(cwd, agentsFile)
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
  fs.writeFileSync(bookrcPath, `${JSON.stringify(mergeTestConfirmBookrc(rc), null, 2)}\n`)
} else {
  fs.writeFileSync(
    bookrcPath,
    `${JSON.stringify(
      mergeTestConfirmBookrc({
        utilsDir: 'src/utils',
        utilsImportAliases: ['@/utils'],
        remindWritePaths: ['src/feature', 'src/components', 'src/hooks', 'src/views']
      }),
      null,
      2
    )}\n`
  )
}

const featureVue = 'src/feature/ai-art/components/art-generate-input.vue'
const featurePath = path.join(projectRoot, featureVue)
const hasFeature = fs.existsSync(featurePath)

resetAudit(projectRoot)

const denyNoAgents = runHook(projectRoot, {
  tool_input: {
    path: 'src/feature/test-utils-gate.vue',
    content: 'import { X } from "@/utils/foo"\n'
  }
})
assert(
  'Write remind path without AGENTS.md Read → deny missing_agents_read',
  denyNoAgents.permission === 'deny' && denyNoAgents.denyReason === 'missing_agents_read',
  JSON.stringify(denyNoAgents)
)

prepareGateSession(projectRoot)

assert(
  'hollow Q1-Q5 通过 not recorded as Verdict',
  recordVerdict(projectRoot, HOLLOW_VERDICT).recorded !== true
)

prepareGateSession(projectRoot)

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
    'After Read util files but no Verdict → deny verdict_not_recorded (v0.3.17)',
    denyVerdict.permission === 'deny' && denyVerdict.denyReason === 'verdict_not_recorded',
    JSON.stringify(denyVerdict)
  )

  const rcStrict = JSON.parse(fs.readFileSync(bookrcPath, 'utf8'))
  rcStrict.sameTurnAllow = false
  fs.writeFileSync(bookrcPath, `${JSON.stringify(rcStrict, null, 2)}\n`)
  const denyVerdictStrict = runHook(projectRoot, {
    tool_input: {
      path: featureVue,
      old_string: '// hook-test-marker',
      new_string: '// hook-test-marker-updated'
    }
  })
  assert(
    'sameTurnAllow false + no Verdict → deny verdict_not_recorded',
    denyVerdictStrict.permission === 'deny' && denyVerdictStrict.denyReason === 'verdict_not_recorded',
    JSON.stringify(denyVerdictStrict)
  )
  delete rcStrict.sameTurnAllow
  fs.writeFileSync(bookrcPath, `${JSON.stringify(rcStrict, null, 2)}\n`)

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
  console.log('SKIP: feature vue fixture not found — pass project root as argv[2]')
}

prepareGateSession(projectRoot)

const writeDeny = runHook(projectRoot, {
  tool_input: {
    path: 'src/feature/test-utils-gate.vue',
    content: 'import { X } from "@/utils/foo"\n'
  }
})
assert('Write new file with @/utils import, empty audit → deny', writeDeny.permission === 'deny')
assert(
  'Write deny without util Read → missing_reads or verdict',
  writeDeny.denyReason === 'missing_reads' || writeDeny.permission === 'deny',
  JSON.stringify(writeDeny)
)

// --- v0.3.3: session Read util + Write remind path without @/utils in patch ---
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-session-read-'))
try {
  fs.mkdirSync(path.join(tempDir, 'src', 'views'), { recursive: true })
  fs.mkdirSync(path.join(tempDir, 'src', 'utils'), { recursive: true })
  fs.writeFileSync(
    path.join(tempDir, '.utils-bookrc.json'),
    `${JSON.stringify(
      mergeTestConfirmBookrc({
        utilsDir: 'src/utils',
        utilsImportAliases: ['@/utils'],
        remindWritePaths: ['src/views']
      }),
      null,
      2
    )}\n`
  )
  fs.writeFileSync(path.join(tempDir, 'src', 'utils', 'copy.ts'), 'export function copyToClip() {}\n')
  fs.writeFileSync(
    path.join(tempDir, 'src', 'views', 'Page.vue'),
    '<template><div>test</div></template>\n'
  )

  resetAudit(tempDir)
  recordAgentsRead(tempDir, 'AGENTS.md')
  recordRead(tempDir, 'src/utils/copy.ts')

  const sessionDeny = runHook(tempDir, {
    tool_input: {
      path: 'src/views/Page.vue',
      old_string: 'test',
      new_string: 'test-updated'
    }
  })
  assert(
    'Session Read util + template-only StrReplace (no imports on patch) → allow without Verdict (v0.3.11 uiOnly)',
    sessionDeny.permission === 'allow',
    JSON.stringify(sessionDeny)
  )

  recordVerdict(tempDir)
  const sessionAllow = runHook(tempDir, {
    tool_input: {
      path: 'src/views/Page.vue',
      old_string: 'test-updated',
      new_string: 'test'
    }
  })
  assert(
    'Session Read util + Verdict + StrReplace views → allow',
    sessionAllow.permission === 'allow',
    JSON.stringify(sessionAllow)
  )

  const badJson = spawnSync(process.execPath, [hookScript(tempDir)], {
    cwd: tempDir,
    input: '{not valid json',
    encoding: 'utf8'
  })
  const badOut = (badJson.stdout || '').trim()
  let badParsed = null
  try {
    badParsed = badOut ? JSON.parse(badOut) : null
  } catch {
    badParsed = null
  }
  assert(
    'Invalid hook stdin JSON + sameTurnAllow (default) + reads → deny parse_error (v0.3.17)',
    badParsed?.permission === 'deny' && badParsed?.denyReason === 'parse_error',
    badOut
  )

  fs.writeFileSync(
    path.join(tempDir, '.utils-bookrc.json'),
    `${JSON.stringify(
      mergeTestConfirmBookrc({
        sameTurnAllow: false,
        utilsDir: 'src/utils',
        utilsImportAliases: ['@/utils'],
        remindWritePaths: ['src/views']
      }),
      null,
      2
    )}\n`,
    'utf8'
  )
  const badStrict = spawnSync(process.execPath, [hookScript(tempDir)], {
    cwd: tempDir,
    input: '{not valid json',
    encoding: 'utf8'
  })
  const badStrictOut = (badStrict.stdout || '').trim()
  let badStrictParsed = null
  try {
    badStrictParsed = badStrictOut ? JSON.parse(badStrictOut) : null
  } catch {
    badStrictParsed = null
  }
  assert(
    'Invalid hook stdin JSON + sameTurnAllow false → deny parse_error',
    badStrictParsed?.permission === 'deny' && badStrictParsed?.denyReason === 'parse_error',
    badStrictOut
  )
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}


// --- v0.3.4: BOM stdin on track hooks ---
function runHookRaw(cwd, scriptName, rawInput) {
  const script = hookPath(cwd, scriptName)
  const r = spawnSync(process.execPath, [script], { cwd, input: rawInput, encoding: "utf8" })
  if (r.error) throw r.error
  const out = (r.stdout || "").trim()
  if (!out) throw new Error("no stdout: " + r.stderr)
  return JSON.parse(out)
}

const bomTemp = fs.mkdtempSync(path.join(os.tmpdir(), "gate-bom-"))
try {
  fs.mkdirSync(path.join(bomTemp, "src", "utils"), { recursive: true })
  fs.writeFileSync(path.join(bomTemp, ".utils-bookrc.json"), JSON.stringify({ hookMode: "confirm", requireDiscoveryForUtilGate: false, preferCliSearch: false, strictBatchLimit: false, allowBusinessDiscovery: false, utilsDir: "src/utils" }, null, 2) + "\n")
  resetAudit(bomTemp)
  const bomPayload = "\uFEFF" + JSON.stringify({ tool_input: { path: "src/utils/foo.ts" } })
  const readOut = runHookRaw(bomTemp, "track-utils-reads.mjs", bomPayload)
  assert("BOM stdin Read util → recorded in audit", readOut.ok === true)
  const audit = JSON.parse(fs.readFileSync(path.join(bomTemp, ".cursor", ".utils-gate-reads.json"), "utf8"))
  assert("BOM Read audit contains path", audit.reads.includes("src/utils/foo.ts"))

  resetAudit(bomTemp)
  const verdictPayload = "\uFEFF" + JSON.stringify({ text: SAMPLE_VERDICT })
  const vOut = runHookRaw(bomTemp, "track-utils-verdict.mjs", verdictPayload)
  assert("BOM stdin Verdict → recorded", vOut.recorded === true)

  // v0.3.5: real UTF-8 BOM bytes (EF BB BF) on check-discovery + track-utils-discovery
  const bomBytes = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(JSON.stringify({ tool_input: { path: "src/utils/bar.ts" } }), "utf8")
  ])
  const readBytes = spawnSync(process.execPath, [hookPath(bomTemp, "track-utils-reads.mjs")], {
    cwd: bomTemp,
    input: bomBytes,
    encoding: "utf8"
  })
  const readBytesOut = JSON.parse((readBytes.stdout || "").trim())
  assert("BOM bytes Read util → ok", readBytesOut.ok === true)

  resetAudit(bomTemp)
  recordAgentsRead(bomTemp)
  recordRead(bomTemp, "src/utils/copy.ts")
  recordVerdict(bomTemp)
  fs.mkdirSync(path.join(bomTemp, "src", "views"), { recursive: true })
  fs.writeFileSync(
    path.join(bomTemp, "src", "views", "Page.vue"),
    "<template><div>test</div></template>\n"
  )
  fs.writeFileSync(
    path.join(bomTemp, ".utils-bookrc.json"),
    JSON.stringify(
      { hookMode: "confirm", requireDiscoveryForUtilGate: false, preferCliSearch: false, strictBatchLimit: false, allowBusinessDiscovery: false, utilsDir: "src/utils", utilsImportAliases: ["@/utils"], remindWritePaths: ["src/views"] },
      null,
      2
    ) + "\n"
  )
  const writeBomBytes = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(
      JSON.stringify({
        tool_input: { path: "src/views/Page.vue", old_string: "test", new_string: "test-updated" }
      }),
      "utf8"
    )
  ])
  const writeBom = spawnSync(process.execPath, [hookScript(bomTemp)], {
    cwd: bomTemp,
    input: writeBomBytes,
    encoding: "utf8"
  })
  const writeBomOut = JSON.parse((writeBom.stdout || "").trim())
  assert(
    "BOM bytes preToolUse Write after Verdict → allow",
    writeBomOut.permission === "allow",
    JSON.stringify(writeBomOut)
  )

  const discoveryBom = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(JSON.stringify({ tool_input: { pattern: "foo", path: "src/utils" } }), "utf8")
  ])
  const discOut = spawnSync(process.execPath, [hookPath(bomTemp, "track-utils-discovery.mjs")], {
    cwd: bomTemp,
    input: discoveryBom,
    encoding: "utf8"
  })
  const discParsed = JSON.parse((discOut.stdout || "").trim())
  assert("BOM bytes track-utils-discovery → ok", discParsed.ok === true)
  const discAudit = JSON.parse(
    fs.readFileSync(path.join(bomTemp, ".cursor", ".utils-gate-discovery.json"), "utf8")
  )
  assert("BOM bytes Discovery recorded", discAudit.recorded === true)
} finally {
  fs.rmSync(bomTemp, { recursive: true, force: true })
}

// --- v0.3.4: same-turn Verdict in preToolUse payload ---
const sameTurnDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-same-turn-"))
try {
  fs.mkdirSync(path.join(sameTurnDir, "src", "views"), { recursive: true })
  fs.mkdirSync(path.join(sameTurnDir, "src", "utils"), { recursive: true })
  fs.writeFileSync(
    path.join(sameTurnDir, ".utils-bookrc.json"),
    JSON.stringify({ hookMode: "confirm", requireDiscoveryForUtilGate: false, preferCliSearch: false, strictBatchLimit: false, allowBusinessDiscovery: false, utilsDir: "src/utils", utilsImportAliases: ["@/utils"], remindWritePaths: ["src/views"] }, null, 2) + "\n"
  )
  fs.writeFileSync(path.join(sameTurnDir, "src/utils/copy.ts"), "export function copyToClip() {}\n")
  fs.writeFileSync(path.join(sameTurnDir, "src/views/Page.vue"), "<template><div>test</div></template>\n")
  resetAudit(sameTurnDir)
  recordAgentsRead(sameTurnDir)
  recordRead(sameTurnDir, "src/utils/copy.ts")
  const sameTurnAllow = runHook(sameTurnDir, {
    text: SAMPLE_VERDICT,
    tool_input: { path: "src/views/Page.vue", old_string: "test", new_string: "test-updated" }
  })
  assert(
    "Same-turn payload.text Verdict + StrReplace views → allow (no prior recordVerdict)",
    sameTurnAllow.permission === "allow",
    JSON.stringify(sameTurnAllow)
  )
} finally {
  fs.rmSync(sameTurnDir, { recursive: true, force: true })
}

// --- v0.3.14: sameTurnAllow default (no payload.text, reads OK) ---
const sameTurnDefaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-same-turn-default-"))
try {
  fs.mkdirSync(path.join(sameTurnDefaultDir, "src", "views"), { recursive: true })
  fs.mkdirSync(path.join(sameTurnDefaultDir, "src", "utils"), { recursive: true })
  fs.writeFileSync(
    path.join(sameTurnDefaultDir, ".utils-bookrc.json"),
    JSON.stringify(
      {
        hookMode: "confirm", requireDiscoveryForUtilGate: false, preferCliSearch: false, strictBatchLimit: false, allowBusinessDiscovery: false,
        utilsDir: "src/utils",
        utilsImportAliases: ["@/utils"],
        remindWritePaths: ["src/views"]
      },
      null,
      2
    ) + "\n"
  )
  fs.writeFileSync(path.join(sameTurnDefaultDir, "src/utils/copy.ts"), "export function copyToClip() {}\n")
  fs.writeFileSync(
    path.join(sameTurnDefaultDir, "src/views/Page.vue"),
    `<script setup lang="ts">
import { copyToClip } from '@/utils/copy'
copyToClip()
</script>
`
  )
  resetAudit(sameTurnDefaultDir)
  recordAgentsRead(sameTurnDefaultDir)
  recordRead(sameTurnDefaultDir, "src/utils/copy.ts")
  const defaultAllow = runHook(sameTurnDefaultDir, {
    tool_input: {
      path: "src/views/Page.vue",
      old_string: "copyToClip()",
      new_string: "copyToClip('x')"
    }
  })
  assert(
    "default sameTurnAllow (omitted) + reads OK + no payload.text → deny (v0.3.17)",
    defaultAllow.permission === "deny" && defaultAllow.denyReason === "verdict_not_recorded",
    JSON.stringify(defaultAllow)
  )
} finally {
  fs.rmSync(sameTurnDefaultDir, { recursive: true, force: true })
}

// --- v0.3.13: sameTurnAllow explicit true (no payload.text, reads OK) ---
const sameTurnOptDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-same-turn-opt-"))
try {
  fs.mkdirSync(path.join(sameTurnOptDir, "src", "views"), { recursive: true })
  fs.mkdirSync(path.join(sameTurnOptDir, "src", "utils"), { recursive: true })
  fs.writeFileSync(
    path.join(sameTurnOptDir, ".utils-bookrc.json"),
    JSON.stringify(
      {
        hookMode: "confirm", requireDiscoveryForUtilGate: false, preferCliSearch: false, strictBatchLimit: false, allowBusinessDiscovery: false,
        sameTurnAllow: true,
        utilsDir: "src/utils",
        utilsImportAliases: ["@/utils"],
        remindWritePaths: ["src/views"]
      },
      null,
      2
    ) + "\n"
  )
  fs.writeFileSync(path.join(sameTurnOptDir, "src", "utils", "copy.ts"), "export function copyToClip() {}\n")
  fs.writeFileSync(
    path.join(sameTurnOptDir, "src", "views", "Page.vue"),
    `<script setup lang="ts">
import { copyToClip } from '@/utils/copy'
copyToClip()
</script>
`
  )
  resetAudit(sameTurnOptDir)
  recordAgentsRead(sameTurnOptDir)
  recordRead(sameTurnOptDir, "src/utils/copy.ts")
  const optAllow = runHook(sameTurnOptDir, {
    tool_input: {
      path: "src/views/Page.vue",
      old_string: "copyToClip()",
      new_string: "copyToClip('x')"
    }
  })
  assert(
    "sameTurnAllow true + reads OK + no payload.text → deny (v0.3.17)",
    optAllow.permission === "deny" && optAllow.denyReason === "verdict_not_recorded",
    JSON.stringify(optAllow)
  )
} finally {
  fs.rmSync(sameTurnOptDir, { recursive: true, force: true })
}

const sameTurnStrictDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-same-turn-strict-"))
try {
  fs.mkdirSync(path.join(sameTurnStrictDir, "src", "views"), { recursive: true })
  fs.mkdirSync(path.join(sameTurnStrictDir, "src", "utils"), { recursive: true })
  fs.writeFileSync(
    path.join(sameTurnStrictDir, ".utils-bookrc.json"),
    JSON.stringify(
      {
        hookMode: "confirm", requireDiscoveryForUtilGate: false, preferCliSearch: false, strictBatchLimit: false, allowBusinessDiscovery: false,
        sameTurnAllow: false,
        utilsDir: "src/utils",
        utilsImportAliases: ["@/utils"],
        remindWritePaths: ["src/views"]
      },
      null,
      2
    ) + "\n"
  )
  fs.writeFileSync(path.join(sameTurnStrictDir, "src", "utils", "copy.ts"), "export function copyToClip() {}\n")
  fs.writeFileSync(
    path.join(sameTurnStrictDir, "src", "views", "Page.vue"),
    `<script setup lang="ts">
import { copyToClip } from '@/utils/copy'
copyToClip()
</script>
`
  )
  resetAudit(sameTurnStrictDir)
  recordAgentsRead(sameTurnStrictDir)
  recordRead(sameTurnStrictDir, "src/utils/copy.ts")
  const strictDeny = runHook(sameTurnStrictDir, {
    tool_input: {
      path: "src/views/Page.vue",
      old_string: "copyToClip()",
      new_string: "copyToClip('x')"
    }
  })
  assert(
    "sameTurnAllow false + no payload.text → deny verdict_not_recorded",
    strictDeny.permission === "deny" && strictDeny.denyReason === "verdict_not_recorded",
    JSON.stringify(strictDeny)
  )
} finally {
  fs.rmSync(sameTurnStrictDir, { recursive: true, force: true })
}

// --- v0.3.5: addsHelper + | Helper | table + CSS-only allow ---
const helperTableVerdict = `D1: Grep utils-index copy @ path
| Helper | utils 候选 | 对照结论 |
| copyText | copyToClip @ copy.ts | reuse(copyToClip) |

Confirm copyToClip: Q1 text Q2 clipboard Q3 DOM Q4 same Q5 no
Verdict（最终）: reuse(copyToClip)`

const helperDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-helper-table-"))
try {
  fs.mkdirSync(path.join(helperDir, "src", "views"), { recursive: true })
  fs.mkdirSync(path.join(helperDir, "src", "utils"), { recursive: true })
  fs.writeFileSync(
    path.join(helperDir, ".utils-bookrc.json"),
    JSON.stringify(
      {
        hookMode: "confirm", requireDiscoveryForUtilGate: false, preferCliSearch: false, strictBatchLimit: false, allowBusinessDiscovery: false,
        utilsDir: "src/utils",
        utilsImportAliases: ["@/utils"],
        remindWritePaths: ["src/views"],
        utilsIndexFile: "docs/agent-catalog/utils-index.json"
      },
      null,
      2
    ) + "\n"
  )
  fs.writeFileSync(path.join(helperDir, "src", "utils", "copy.ts"), "export function copyToClip() {}\n")
  fs.writeFileSync(
    path.join(helperDir, "src", "views", "Page.vue"),
    `<template><div>test</div></template>
<script setup lang="ts">
// marker
</script>
<style scoped>
.copy-btn { color: red; }
</style>
`
  )
  resetAudit(helperDir)
  recordAgentsRead(helperDir)
  spawnSync(process.execPath, [hookPath(helperDir, "track-utils-discovery.mjs")], {
    cwd: helperDir,
    input: JSON.stringify({ tool_input: { pattern: "copy", path: "src/utils" } }),
    encoding: "utf8"
  })
  recordVerdict(helperDir, helperTableVerdict)

  const helperAllow = runHook(helperDir, {
    tool_input: {
      path: "src/views/Page.vue",
      old_string: "// marker",
      new_string: `function copyText() {}\n// marker`
    }
  })
  assert(
    "addsHelper + discovery + | Helper | table + Verdict → allow",
    helperAllow.permission === "allow",
    JSON.stringify(helperAllow)
  )

  const arrowAllow = runHook(helperDir, {
    tool_input: {
      path: "src/views/Page.vue",
      old_string: "// marker",
      new_string: `const arrowFn = () => {}\n// marker`
    }
  })
  assert(
    "addsHelper detects arrow function helper → allow after gate",
    arrowAllow.permission === "allow",
    JSON.stringify(arrowAllow)
  )

  const cssAllow = runHook(helperDir, {
    tool_input: {
      path: "src/views/Page.vue",
      old_string: "color: red;",
      new_string: "color: blue;"
    }
  })
  assert(
    "CSS-only StrReplace (no helper) → allow",
    cssAllow.permission === "allow",
    JSON.stringify(cssAllow)
  )
} finally {
  fs.rmSync(helperDir, { recursive: true, force: true })
}

// --- v0.3.7: staleSymbols + template-only after script + Read BOM postToolUse ---
const staleDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-stale-"))
try {
  fs.mkdirSync(path.join(staleDir, "src", "views"), { recursive: true })
  fs.mkdirSync(path.join(staleDir, "src", "utils"), { recursive: true })
  fs.writeFileSync(
    path.join(staleDir, ".utils-bookrc.json"),
    JSON.stringify(
      { hookMode: "confirm", requireDiscoveryForUtilGate: false, preferCliSearch: false, strictBatchLimit: false, allowBusinessDiscovery: false, utilsDir: "src/utils", utilsImportAliases: ["@/utils"], remindWritePaths: ["src/views"] },
      null,
      2
    ) + "\n"
  )
  fs.writeFileSync(path.join(staleDir, "src", "utils", "copy.ts"), "export function copyToClip() {}\n")
  fs.writeFileSync(path.join(staleDir, "src", "utils", "other.ts"), "export function otherUtil() {}\n")
  fs.writeFileSync(
    path.join(staleDir, "src", "views", "Page.vue"),
    `<template><div>test</div></template>
<script setup lang="ts">
import { copyToClip } from '@/utils/copy'
</script>
`
  )
  resetAudit(staleDir)
  recordAgentsRead(staleDir)
  recordRead(staleDir, "src/utils/copy.ts")
  recordRead(staleDir, "src/utils/other.ts")
  recordVerdict(
    staleDir,
    `Confirm copyToClip: Q1 text Q2 clip Q3 DOM Q4 same Q5 no
Verdict（最终）: reuse(copyToClip)`
  )
  const staleDeny = runHook(staleDir, {
    tool_input: {
      path: "src/views/Page.vue",
      old_string: "import { copyToClip } from '@/utils/copy'",
      new_string: "import { copyToClip, otherUtil } from '@/utils/other'"
    }
  })
  assert(
    "Verdict for copyToClip only + Write imports otherUtil → deny staleSymbols",
    staleDeny.permission === "deny" &&
      staleDeny.denyReason === "verdict_stale_for_symbol" &&
      Array.isArray(staleDeny.staleSymbols) &&
      staleDeny.staleSymbols.includes("otherUtil"),
    JSON.stringify(staleDeny)
  )

  recordVerdict(
    staleDir,
    `Confirm copyToClip: Q1 a Q2 b Q3 c Q4 d Q5 no
Confirm otherUtil: Q1 a Q2 b Q3 c Q4 d Q5 no
Verdict（最终）: reuse(copyToClip) + reuse(otherUtil)`
  )
  const staleAllow = runHook(staleDir, {
    tool_input: {
      path: "src/views/Page.vue",
      old_string: "import { copyToClip } from '@/utils/copy'",
      new_string: "import { copyToClip, otherUtil } from '@/utils/other'"
    }
  })
  assert(
    "Updated Verdict covering otherUtil → allow",
    staleAllow.permission === "allow",
    JSON.stringify(staleAllow)
  )
} finally {
  fs.rmSync(staleDir, { recursive: true, force: true })
}

// --- v0.3.12: sessionCoversPatch — delta merge + allow without this-turn Verdict ---
const coverDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-session-cover-"))
try {
  fs.mkdirSync(path.join(coverDir, "src", "views"), { recursive: true })
  fs.mkdirSync(path.join(coverDir, "src", "utils"), { recursive: true })
  fs.writeFileSync(
    path.join(coverDir, ".utils-bookrc.json"),
    JSON.stringify(
      { hookMode: "confirm", requireDiscoveryForUtilGate: false, preferCliSearch: false, strictBatchLimit: false, allowBusinessDiscovery: false, utilsDir: "src/utils", utilsImportAliases: ["@/utils"], remindWritePaths: ["src/views"] },
      null,
      2
    ) + "\n"
  )
  fs.writeFileSync(path.join(coverDir, "src", "utils", "copy.ts"), "export function copyToClip() {}\n")
  fs.writeFileSync(path.join(coverDir, "src", "utils", "other.ts"), "export function otherUtil() {}\n")
  fs.writeFileSync(
    path.join(coverDir, "src", "views", "Page.vue"),
    `<template><div>test</div></template>
<script setup lang="ts">
import { copyToClip } from '@/utils/copy'
copyToClip()
</script>
`
  )
  resetAudit(coverDir)
  recordAgentsRead(coverDir)
  recordRead(coverDir, "src/utils/copy.ts")
  recordVerdict(
    coverDir,
    `| Symbol | Read @ path | Q4 | Verdict |
| copyToClip | copy.ts | clip OK; same API | reuse(copyToClip) |
Verdict（最终）: reuse(copyToClip)`
  )
  const coverAllow = runHook(coverDir, {
    tool_input: {
      path: "src/views/Page.vue",
      old_string: "copyToClip()",
      new_string: "copyToClip('updated')"
    }
  })
  assert(
    "Session covers copyToClip + script patch same symbol → allow without new Verdict (v0.3.12)",
    coverAllow.permission === "allow",
    JSON.stringify(coverAllow)
  )

  // --- v0.3.22: newCall — existing import, patch adds Binding.method ---
  const newCallDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-new-call-"))
  try {
    fs.mkdirSync(path.join(newCallDir, "src", "views"), { recursive: true })
    fs.mkdirSync(path.join(newCallDir, "src", "utils"), { recursive: true })
    fs.writeFileSync(
      path.join(newCallDir, ".utils-bookrc.json"),
      JSON.stringify(
        mergeTestConfirmBookrc({
          utilsDir: "src/utils",
          utilsImportAliases: ["@/utils"],
          remindWritePaths: ["src/views"]
        }),
        null,
        2
      ) + "\n"
    )
    fs.writeFileSync(path.join(newCallDir, "src", "utils", "copy.ts"), "export function copyToClip() {}\n")
    fs.writeFileSync(
      path.join(newCallDir, "src", "utils", "url.ts"),
      "export const UrlUtils = { replaceX() {} }\n"
    )
    fs.writeFileSync(
      path.join(newCallDir, "src", "views", "Page.vue"),
      `<template><div>test</div></template>
<script setup lang="ts">
import { copyToClip } from '@/utils/copy'
import { UrlUtils } from '@/utils/url'
copyToClip()
</script>
`
    )
    resetAudit(newCallDir)
    recordAgentsRead(newCallDir)
    recordRead(newCallDir, "src/utils/copy.ts")
    recordRead(newCallDir, "src/utils/url.ts")
    recordVerdict(
      newCallDir,
      `| Symbol | Read @ path | Q4 | Verdict |
| copyToClip | copy.ts | clip OK | reuse(copyToClip) |
Verdict（最终）: reuse(copyToClip)`
    )

    const newCallDeny = runHook(newCallDir, {
      tool_input: {
        path: "src/views/Page.vue",
        old_string: "copyToClip()",
        new_string: "copyToClip()\nUrlUtils.replaceX()"
      }
    })
    assert(
      "newCall UrlUtils.replaceX without method-level Verdict → deny (needsConfirm or verdict)",
      newCallDeny.permission === "deny" &&
        (newCallDeny.denyReason === "verdict_stale_for_symbol" ||
          newCallDeny.denyReason === "verdict_not_recorded" ||
          (Array.isArray(newCallDeny.needsConfirm) && newCallDeny.needsConfirm.some((s) => /replaceX/i.test(s)))),
      JSON.stringify(newCallDeny)
    )

    recordVerdict(
      newCallDir,
      `| Symbol | Read @ path | Q4 | Verdict |
| UrlUtils.replaceX | url.ts | replaceX OK; no sibling | reuse(UrlUtils.replaceX) |
Verdict（最终）: reuse(UrlUtils.replaceX)`
    )
    const newCallAllow = runHook(newCallDir, {
      tool_input: {
        path: "src/views/Page.vue",
        old_string: "copyToClip()",
        new_string: "copyToClip()\nUrlUtils.replaceX()"
      }
    })
    assert(
      "newCall + method-level Confirm → allow",
      newCallAllow.permission === "allow",
      JSON.stringify(newCallAllow)
    )
  } finally {
    fs.rmSync(newCallDir, { recursive: true, force: true })
  }

  recordRead(coverDir, "src/utils/other.ts")
  recordVerdict(
    coverDir,
    `| Symbol | Read @ path | Q4 | Verdict |
| otherUtil | other.ts | other OK; same use | reuse(otherUtil) |
Verdict（最终）: reuse(otherUtil)`
  )
  fs.writeFileSync(
    path.join(coverDir, "src", "views", "Page.vue"),
    `<template><div>test</div></template>
<script setup lang="ts">
import { copyToClip, otherUtil } from '@/utils/other'
copyToClip()
otherUtil()
</script>
`
  )
  const mergedAllow = runHook(coverDir, {
    tool_input: {
      path: "src/views/Page.vue",
      old_string: "copyToClip()",
      new_string: "copyToClip()\notherUtil()"
    }
  })
  assert(
    "Delta recordVerdict merges symbols — both copyToClip and otherUtil covered",
    mergedAllow.permission === "allow",
    JSON.stringify(mergedAllow)
  )
} finally {
  fs.rmSync(coverDir, { recursive: true, force: true })
}

const templateDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-template-only-"))
try {
  fs.mkdirSync(path.join(templateDir, "src", "views"), { recursive: true })
  fs.writeFileSync(
    path.join(templateDir, ".utils-bookrc.json"),
    JSON.stringify(
      {
        hookMode: "confirm", requireDiscoveryForUtilGate: false, preferCliSearch: false, strictBatchLimit: false, allowBusinessDiscovery: false,
        utilsDir: "src/utils",
        utilsImportAliases: ["@/utils"],
        remindWritePaths: ["src/views"],
        utilsIndexFile: "docs/agent-catalog/utils-index.json"
      },
      null,
      2
    ) + "\n"
  )
  fs.writeFileSync(
    path.join(templateDir, "src", "views", "Page.vue"),
    `<template><div>old</div></template>
<script setup lang="ts">
function copyText() {}
</script>
`
  )
  resetAudit(templateDir)
  recordAgentsRead(templateDir)
  spawnSync(process.execPath, [hookPath(templateDir, "track-utils-discovery.mjs")], {
    cwd: templateDir,
    input: JSON.stringify({ tool_input: { pattern: "copy", path: "src/utils" } }),
    encoding: "utf8"
  })
  recordVerdict(
    templateDir,
    `| Helper | utils | verdict |
| copyText | copyToClip | reuse(copyToClip) |
Confirm copyToClip: Q1 a Q2 b Q3 c Q4 d Q5 no
Verdict（最终）: reuse(copyToClip)`
  )
  const templateAllow = runHook(templateDir, {
    tool_input: {
      path: "src/views/Page.vue",
      old_string: "<div>old</div>",
      new_string: "<div>new</div>"
    }
  })
  assert(
    "Template-only StrReplace after script helper on disk → allow (no addsHelper)",
    templateAllow.permission === "allow",
    JSON.stringify(templateAllow)
  )
} finally {
  fs.rmSync(templateDir, { recursive: true, force: true })
}

// --- v0.3.8: newUtil Write new utils file (no self-Read required) ---
const newUtilDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-new-util-"))
try {
  fs.mkdirSync(path.join(newUtilDir, "src", "utils"), { recursive: true })
  fs.writeFileSync(
    path.join(newUtilDir, ".utils-bookrc.json"),
    JSON.stringify({ hookMode: "confirm", requireDiscoveryForUtilGate: false, preferCliSearch: false, strictBatchLimit: false, allowBusinessDiscovery: false, utilsDir: "src/utils", utilsImportAliases: ["@/utils"] }, null, 2) + "\n"
  )
  prepareGateSession(newUtilDir)
  recordVerdict(
    newUtilDir,
    `Confirm freshUtil: Q1 n Q2 n Q3 n Q4 n Q5 no
Verdict（最终）: newUtil(freshUtil)`
  )
  const newUtilAllow = runHook(newUtilDir, {
    tool_input: {
      path: "src/utils/freshUtil.ts",
      content: "/** @utils-book fresh */\nexport function freshUtil() {}\n"
    }
  })
  assert(
    "newUtil Write new utils file without prior self-Read → allow",
    newUtilAllow.permission === "allow",
    JSON.stringify(newUtilAllow)
  )
} finally {
  fs.rmSync(newUtilDir, { recursive: true, force: true })
}

const readBomDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-read-bom-"))
try {
  fs.mkdirSync(path.join(readBomDir, "src", "utils"), { recursive: true })
  fs.writeFileSync(
    path.join(readBomDir, ".utils-bookrc.json"),
    JSON.stringify({ hookMode: "confirm", requireDiscoveryForUtilGate: false, preferCliSearch: false, strictBatchLimit: false, allowBusinessDiscovery: false, utilsDir: "src/utils" }, null, 2) + "\n"
  )
  resetAudit(readBomDir)
  const readBomPayload = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(JSON.stringify({ tool_input: { path: "src/utils/bom-read.ts" } }), "utf8")
  ])
  const readHookOut = spawnSync(process.execPath, [hookPath(readBomDir, "track-utils-reads.mjs")], {
    cwd: readBomDir,
    input: readBomPayload,
    encoding: "utf8"
  })
  const readParsed = JSON.parse((readHookOut.stdout || "").trim())
  assert("BOM bytes track-utils-reads postToolUse → ok", readParsed.ok === true)
  const readAudit = JSON.parse(fs.readFileSync(path.join(readBomDir, ".cursor", ".utils-gate-reads.json"), "utf8"))
  assert("BOM Read audit path recorded", readAudit.reads.includes("src/utils/bom-read.ts"))
} finally {
  fs.rmSync(readBomDir, { recursive: true, force: true })
}

// --- v0.3.9: compact bulk sibling Q4 + bulk row validation ---
const siblingDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-sibling-v039-"))
try {
  fs.mkdirSync(path.join(siblingDir, "src", "utils", "array"), { recursive: true })
  fs.mkdirSync(path.join(siblingDir, "src", "views"), { recursive: true })
  fs.mkdirSync(path.join(siblingDir, "docs", "agent-catalog"), { recursive: true })
  fs.writeFileSync(
    path.join(siblingDir, ".utils-bookrc.json"),
    JSON.stringify(
      {
        hookMode: "confirm", requireDiscoveryForUtilGate: false, preferCliSearch: false, strictBatchLimit: false, allowBusinessDiscovery: false,
        utilsDir: "src/utils",
        utilsImportAliases: ["@/utils"],
        remindWritePaths: ["src/views"],
        utilsIndexFile: "docs/agent-catalog/utils-index.json"
      },
      null,
      2
    ) + "\n"
  )
  fs.writeFileSync(
    path.join(siblingDir, "docs/agent-catalog/utils-index.json"),
    JSON.stringify({
      symbols: {
        sortAsc: [{ path: "src/utils/array/sortArray.ts" }],
        sortDesc: [{ path: "src/utils/array/sortArray.ts" }]
      },
      siblingsByPath: {
        "src/utils/array/sortArray.ts": ["sortAsc", "sortDesc"]
      }
    })
  )
  fs.writeFileSync(
    path.join(siblingDir, "src/utils/array/sortArray.ts"),
    "export function sortAsc() {}\nexport function sortDesc() {}\n"
  )
  fs.writeFileSync(
    path.join(siblingDir, "src/views", "Page.vue"),
    `<script setup lang="ts">
import { sortAsc } from '@/utils/array/sortArray'
// marker
</script>
`
  )
  prepareGateSession(siblingDir)
  recordRead(siblingDir, "src/utils/array/sortArray.ts")

  const compactNoSibling = `| Symbol | Read @ path | Q4 | Verdict |
| sortAsc | sortArray.ts | ascending sort only | reuse(sortAsc) |

**Verdict（最终）**：reuse(sortAsc)`

  recordVerdict(siblingDir, compactNoSibling)
  const siblingDeny = runHook(siblingDir, {
    tool_input: {
      path: "src/views/Page.vue",
      old_string: "import { sortAsc }",
      new_string: "import { sortAsc } from '@/utils/array/sortArray'"
    }
  })
  assert(
    "compact bulk Q4 without sibling mention → deny sibling_q4_missing",
    siblingDeny.permission === "deny" && siblingDeny.denyReason === "sibling_q4_missing",
    JSON.stringify(siblingDeny)
  )

  const compactOk = `| Symbol | Read @ path | Q4 | Verdict |
| sortAsc | sortArray.ts | ascending only; reject sortDesc | reuse(sortAsc) |

**Verdict（最终）**：reuse(sortAsc)`

  recordVerdict(siblingDir, compactOk)
  const siblingAllow = runHook(siblingDir, {
    tool_input: {
      path: "src/views/Page.vue",
      old_string: "// marker",
      new_string: "// ok\n"
    }
  })
  assert(
    "compact bulk Q4 with reject sibling → allow",
    siblingAllow.permission === "allow",
    JSON.stringify(siblingAllow)
  )

  const compactEmptyRead = `| Symbol | Read @ path | Q4 | Verdict |
| sortAsc | | ascending only; reject sortDesc | reuse(sortAsc) |

**Verdict（最终）**：reuse(sortAsc)`

  recordVerdict(siblingDir, compactEmptyRead)
  const bulkDeny = runHook(siblingDir, {
    tool_input: {
      path: "src/views/Page.vue",
      old_string: "// ok",
      new_string: "// patch\n"
    }
  })
  assert(
    "compact bulk empty Read column → deny bulk_row_invalid",
    bulkDeny.permission === "deny" &&
      (bulkDeny.denyReason === "bulk_row_invalid" || bulkDeny.denyReason === "bulk_read_not_in_session"),
    JSON.stringify(bulkDeny)
  )
} finally {
  fs.rmSync(siblingDir, { recursive: true, force: true })
}

// --- v0.3.11: #27 mixed page — file has @/utils, template-only patch → allow without Verdict ---
const mixedUiDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-mixed-ui-"))
try {
  fs.mkdirSync(path.join(mixedUiDir, "src", "views"), { recursive: true })
  fs.mkdirSync(path.join(mixedUiDir, "src", "utils"), { recursive: true })
  fs.writeFileSync(
    path.join(mixedUiDir, ".utils-bookrc.json"),
    JSON.stringify(
      {
        hookMode: "confirm", requireDiscoveryForUtilGate: false, preferCliSearch: false, strictBatchLimit: false, allowBusinessDiscovery: false,
        utilsDir: "src/utils",
        utilsImportAliases: ["@/utils"],
        remindWritePaths: ["src/views"]
      },
      null,
      2
    ) + "\n"
  )
  fs.writeFileSync(path.join(mixedUiDir, "src", "utils", "copy.ts"), "export function copyToClip() {}\n")
  fs.mkdirSync(path.join(mixedUiDir, "src", "utils", "array"), { recursive: true })
  fs.writeFileSync(
    path.join(mixedUiDir, "src", "utils", "array", "sortArray.ts"),
    "export function sortAsc() {}\n"
  )
  fs.writeFileSync(
    path.join(mixedUiDir, "src", "views", "Mixed.vue"),
    `<template><div class="skeleton">loading</div></template>
<script setup lang="ts">
import { copyToClip } from '@/utils/copy'
</script>
`
  )
  prepareGateSession(mixedUiDir)
  recordRead(mixedUiDir, "src/utils/copy.ts")
  const mixedAllow = runHook(mixedUiDir, {
    tool_input: {
      path: "src/views/Mixed.vue",
      old_string: '<div class="skeleton">loading</div>',
      new_string: '<div class="skeleton">Loading…</div>'
    }
  })
  assert(
    "#27 template-only on file with existing @/utils → allow without Verdict",
    mixedAllow.permission === "allow",
    JSON.stringify(mixedAllow)
  )

  const mixedDeny = runHook(mixedUiDir, {
    tool_input: {
      path: "src/views/Mixed.vue",
      old_string: "import { copyToClip } from '@/utils/copy'",
      new_string:
        "import { copyToClip } from '@/utils/copy'\nimport sortUtil from '@/utils/array/sortArray'"
    }
  })
  assert(
    "script patch adding unread util import → deny (missing_reads or verdict)",
    mixedDeny.permission === "deny",
    JSON.stringify(mixedDeny)
  )
} finally {
  fs.rmSync(mixedUiDir, { recursive: true, force: true })
}

// --- v0.3.17: malformed JSON + confirm required + addsHelper enforced ---
const parseSafeDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-parse-safe-"))
try {
  fs.mkdirSync(path.join(parseSafeDir, "src", "views"), { recursive: true })
  fs.mkdirSync(path.join(parseSafeDir, "src", "utils"), { recursive: true })
  fs.writeFileSync(
    path.join(parseSafeDir, ".utils-bookrc.json"),
    JSON.stringify(
      {
        hookMode: "confirm", requireDiscoveryForUtilGate: false, preferCliSearch: false, strictBatchLimit: false, allowBusinessDiscovery: false,
        sameTurnAllow: true,
        utilsDir: "src/utils",
        utilsImportAliases: ["@/utils"],
        remindWritePaths: ["src/views"]
      },
      null,
      2
    ) + "\n"
  )
  fs.writeFileSync(path.join(parseSafeDir, "src/utils/copy.ts"), "export function copyToClip() {}\n")
  fs.writeFileSync(
    path.join(parseSafeDir, "src/views/Page.vue"),
    `<script setup lang="ts">
import { copyToClip } from '@/utils/copy'
copyToClip()
</script>
<template><div>test</div></template>
`
  )
  resetAudit(parseSafeDir)
  recordAgentsRead(parseSafeDir)
  recordRead(parseSafeDir, "src/utils/copy.ts")

  const malformedPayload =
    '{"tool_input":{"path":"src/views/Page.vue","old_string":"copyToClip()","new_string":"copyToClip(\'x\')"},"broken":'
  const malformedDeny = runHookRaw(parseSafeDir, "check-discovery-before-shared-write.mjs", malformedPayload)
  assert(
    "malformed JSON with extractable path + no Confirm → deny verdict_not_recorded",
    malformedDeny.permission === "deny" &&
      (malformedDeny.denyReason === "verdict_not_recorded" || malformedDeny.denyReason === "parse_error"),
    JSON.stringify(malformedDeny)
  )

  spawnSync(process.execPath, [hookPath(parseSafeDir, "track-utils-discovery.mjs")], {
    cwd: parseSafeDir,
    input: JSON.stringify({ tool_input: { pattern: "copy", path: "src/utils" } }),
    encoding: "utf8"
  })
  const helperNoVerdict = runHook(parseSafeDir, {
    tool_input: {
      path: "src/views/Page.vue",
      old_string: "copyToClip()",
      new_string: "function localHelper() {}\ncopyToClip()"
    }
  })
  assert(
    "addsHelper + sameTurnAllow + reads OK + no verdict → deny (v0.3.17)",
    helperNoVerdict.permission === "deny" &&
      (helperNoVerdict.denyReason === "verdict_not_recorded" ||
        helperNoVerdict.denyReason === "local_helpers_table_missing"),
    JSON.stringify(helperNoVerdict)
  )

  const bulkConfirm = `${SAMPLE_VERDICT}\n| Symbol | Read @ path | Q4（替换 + sibling 拒选） | Verdict |\n| copyToClip | src/utils/copy.ts | 与 util 行为一致，不选 sibling | reuse(copyToClip) |`
  const malformedWithConfirm =
    `{"text":"${bulkConfirm.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}","tool_input":{"path":"src/views/Page.vue","old_string":"copyToClip()","new_string":"copyToClip('x')"},"broken":`
  const malformedAllow = runHookRaw(parseSafeDir, "check-discovery-before-shared-write.mjs", malformedWithConfirm)
  assert(
    "malformed JSON + bulk Confirm in payload + reads → allow sameTurnBypass",
    malformedAllow.permission === "allow" && malformedAllow.sameTurnBypass === true,
    JSON.stringify(malformedAllow)
  )

  const uiOnlyMalformed =
    '{"tool_input":{"path":"src/views/Page.vue","old_string":"<div>test</div>","new_string":"<div>Test</div>"},broken'
  const uiMalformedAllow = runHookRaw(
    parseSafeDir,
    "check-discovery-before-shared-write.mjs",
    uiOnlyMalformed
  )
  assert(
    "uiOnly template patch + malformed JSON → allow (no utils import in delta)",
    uiMalformedAllow.permission === "allow",
    JSON.stringify(uiMalformedAllow)
  )

  const chineseVerdict = `${SAMPLE_VERDICT}\n| Symbol | Read @ path | Q4（替换 + sibling 拒选） | Verdict |\n| copyToClip | src/utils/copy.ts | 与 util 行为一致，不选 sibling | reuse(copyToClip) |`
  const brokenVerdictStdin = `{"text":"${chineseVerdict.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}","broken":`
  const vOut = runHookRaw(parseSafeDir, "track-utils-verdict.mjs", brokenVerdictStdin)
  assert(
    "track-utils-verdict partial JSON + Chinese bulk table → recorded",
    vOut.ok === true && vOut.recorded === true,
    JSON.stringify(vOut)
  )

  // transcript extraction from broken JSON (v0.3.17)
  const transcriptConfirm = `${SAMPLE_VERDICT}\n| Symbol | Read @ path | Q4 | Verdict |\n| copyToClip | src/utils/copy.ts | OK reject sibling | reuse(copyToClip) |`
  const brokenTranscript =
    `{"conversation":[{"role":"user","content":"task"},{"role":"assistant","content":"${transcriptConfirm.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"}],"tool_input":{"path":"src/views/Page.vue","old_string":"copyToClip()","new_string":"copyToClip('y')"},"broken":`
  const transcriptAllow = runHookRaw(parseSafeDir, "check-discovery-before-shared-write.mjs", brokenTranscript)
  assert(
    "broken JSON + conversation assistant Confirm → allow",
    transcriptAllow.permission === "allow",
    JSON.stringify(transcriptAllow)
  )

  // batch limit: 6 symbols without Confirm
  const batchDir = parseSafeDir
  const sixImports =
    'import { a, b, c, d, e, f } from "@/utils/batch"\n'
  const batchDeny = runHook(batchDir, {
    tool_input: {
      path: "src/views/Batch.vue",
      content: `<script setup>\n${sixImports}</script>\n`
    }
  })
  assert(
    "6 import symbols without Confirm → deny batch_limit or verdict_not_recorded",
    batchDeny.permission === "deny" &&
      (batchDeny.denyReason === "batch_limit_exceeded" ||
        batchDeny.denyReason === "verdict_not_recorded"),
    JSON.stringify(batchDeny)
  )

  // --- v0.3.18: transcript_path + large stdin partial parse + symbol normalize ---
  const transcriptFixture = path.join(pkgRoot, "scripts/fixtures/transcript-assistant-confirm.jsonl")

  resetAudit(parseSafeDir)
  recordAgentsRead(parseSafeDir)
  recordRead(parseSafeDir, "src/utils/copy.ts")
  const transcriptOnlyPayload = JSON.stringify({
    transcript_path: transcriptFixture,
    tool_input: {
      path: "src/views/Page.vue",
      old_string: "copyToClip()",
      new_string: "copyToClip('x')"
    }
  })
  const transcriptOnlyAllow = runHookRaw(
    parseSafeDir,
    "check-discovery-before-shared-write.mjs",
    transcriptOnlyPayload
  )
  assert(
    "preToolUse transcript_path only + jsonl Confirm → allow",
    transcriptOnlyAllow.permission === "allow",
    JSON.stringify(transcriptOnlyAllow)
  )
  assert(
    "transcript_path allow includes verdict_source transcript",
    transcriptOnlyAllow.confirmSource === "transcript" ||
      transcriptOnlyAllow.verdict_source === "transcript",
    JSON.stringify(transcriptOnlyAllow)
  )

  resetAudit(parseSafeDir)
  recordAgentsRead(parseSafeDir)
  recordRead(parseSafeDir, "src/utils/copy.ts")
  const bigContent = "x".repeat(17000)
  const largeBroken = `{"transcript_path":"${transcriptFixture.replace(/\\/g, "\\\\")}","tool_input":{"path":"src/views/Page.vue","contents":"${bigContent}"},"broken":`
  const largeAllow = runHookRaw(
    parseSafeDir,
    "check-discovery-before-shared-write.mjs",
    largeBroken
  )
  assert(
    "large stdin (>16KB) broken JSON + path + transcript Confirm → allow (not parse_error)",
    largeAllow.permission === "allow" && largeAllow.denyReason !== "parse_error",
    JSON.stringify(largeAllow)
  )

  resetAudit(parseSafeDir)
  const noPathBroken = '{"tool_input":{"contents":"hello"},"broken":'
  const noPathDeny = runHookRaw(
    parseSafeDir,
    "check-discovery-before-shared-write.mjs",
    noPathBroken
  )
  assert(
    "broken JSON + no extractable path → deny parse_error",
    noPathDeny.permission === "deny" && noPathDeny.denyReason === "parse_error",
    JSON.stringify(noPathDeny)
  )

  fs.writeFileSync(
    path.join(parseSafeDir, "src/utils/url.ts"),
    "export class UrlUtils { static replaceIntranetUrl() {} }\n"
  )
  resetAudit(parseSafeDir)
  recordAgentsRead(parseSafeDir)
  recordRead(parseSafeDir, "src/utils/url.ts")
  const urlConfirm = `${SAMPLE_VERDICT}\n| Symbol | Read @ path | Q4 | Verdict |\n| UrlUtils | src/utils/url.ts | OK reject sibling | reuse(UrlUtils.replaceIntranetUrl) |`
  const urlTranscript = path.join(parseSafeDir, "url-transcript.jsonl")
  fs.writeFileSync(urlTranscript, JSON.stringify({ role: "assistant", content: urlConfirm }) + "\n")
  const urlPayload = JSON.stringify({
    transcript_path: urlTranscript,
    tool_input: {
      path: "src/views/UrlPage.vue",
      content: `<script setup>\nimport { UrlUtils } from '@/utils/url'\nUrlUtils.replaceIntranetUrl()\n</script>\n`
    }
  })
  const urlAllow = runHookRaw(parseSafeDir, "check-discovery-before-shared-write.mjs", urlPayload)
  assert(
    "reuse(UrlUtils.method) + import UrlUtils → allow (symbol normalize)",
    urlAllow.permission === "allow",
    JSON.stringify(urlAllow)
  )

  resetAudit(parseSafeDir)
  const vTranscriptOut = runHookRaw(
    parseSafeDir,
    "track-utils-verdict.mjs",
    JSON.stringify({ transcript_path: transcriptFixture })
  )
  assert(
    "track-utils-verdict transcript_path → recorded + verdict_source transcript",
    vTranscriptOut.ok === true &&
      vTranscriptOut.recorded === true &&
      vTranscriptOut.verdict_source === "transcript",
    JSON.stringify(vTranscriptOut)
  )
} finally {
  fs.rmSync(parseSafeDir, { recursive: true, force: true })
}


if (process.exitCode) {
  console.error('\nSome tests failed.')
  process.exit(1)
}
console.log('\nAll hook confirm tests passed.')
