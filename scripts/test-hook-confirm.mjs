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
      {
        hookMode: 'confirm',
        utilsDir: 'src/utils',
        utilsImportAliases: ['@/utils'],
        remindWritePaths: ['src/views']
      },
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
    'Invalid hook stdin JSON under confirm → deny',
    badParsed?.permission === 'deny',
    badOut
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
  fs.writeFileSync(path.join(bomTemp, ".utils-bookrc.json"), JSON.stringify({ hookMode: "confirm", utilsDir: "src/utils" }, null, 2) + "\n")
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
      { hookMode: "confirm", utilsDir: "src/utils", utilsImportAliases: ["@/utils"], remindWritePaths: ["src/views"] },
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
    JSON.stringify({ hookMode: "confirm", utilsDir: "src/utils", utilsImportAliases: ["@/utils"], remindWritePaths: ["src/views"] }, null, 2) + "\n"
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
        hookMode: "confirm",
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
      { hookMode: "confirm", utilsDir: "src/utils", utilsImportAliases: ["@/utils"], remindWritePaths: ["src/views"] },
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

const templateDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-template-only-"))
try {
  fs.mkdirSync(path.join(templateDir, "src", "views"), { recursive: true })
  fs.writeFileSync(
    path.join(templateDir, ".utils-bookrc.json"),
    JSON.stringify(
      {
        hookMode: "confirm",
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
    JSON.stringify({ hookMode: "confirm", utilsDir: "src/utils", utilsImportAliases: ["@/utils"] }, null, 2) + "\n"
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
    JSON.stringify({ hookMode: "confirm", utilsDir: "src/utils" }, null, 2) + "\n"
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
        hookMode: "confirm",
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
        hookMode: "confirm",
        utilsDir: "src/utils",
        utilsImportAliases: ["@/utils"],
        remindWritePaths: ["src/views"]
      },
      null,
      2
    ) + "\n"
  )
  fs.writeFileSync(path.join(mixedUiDir, "src", "utils", "copy.ts"), "export function copyToClip() {}\n")
  fs.writeFileSync(
    path.join(mixedUiDir, "src", "views", "Mixed.vue"),
    `<template><div class="skeleton">loading</div></template>
<script setup lang="ts">
import { copyToClip } from '@/utils/copy'
import { sortAsc } from '@/utils/array/sortArray'
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
      old_string: "import { sortAsc }",
      new_string: "import { sortAsc, copyToClip } from '@/utils/copy'"
    }
  })
  assert(
    "script patch adding util usage → deny (missing_reads or verdict)",
    mixedDeny.permission === "deny",
    JSON.stringify(mixedDeny)
  )
} finally {
  fs.rmSync(mixedUiDir, { recursive: true, force: true })
}


// --- v0.3.14: Confirm anti-loop — session verdict + empty payload ---
const SESSION_COMPACT = `| Symbol | Read @ path | Q4 | Verdict |
| sortAsc | sortArray.ts | ascending only; reject sortDesc | reuse(sortAsc) |

**Verdict（最终）**：reuse(sortAsc)`

const sessionVerdictDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-session-verdict-"))
try {
  fs.mkdirSync(path.join(sessionVerdictDir, "src", "views"), { recursive: true })
  fs.mkdirSync(path.join(sessionVerdictDir, "src", "utils", "array"), { recursive: true })
  fs.writeFileSync(
    path.join(sessionVerdictDir, ".utils-bookrc.json"),
    JSON.stringify(
      {
        hookMode: "confirm",
        utilsDir: "src/utils",
        utilsImportAliases: ["@/utils"],
        remindWritePaths: ["src/views"]
      },
      null,
      2
    ) + "\n"
  )
  fs.writeFileSync(
    path.join(sessionVerdictDir, "src/utils/array/sortArray.ts"),
    "export function sortAsc() {}\nexport function sortDesc() {}\n"
  )
  fs.writeFileSync(
    path.join(sessionVerdictDir, "src/views/Page.vue"),
    `<script setup lang="ts">
import { sortAsc } from '@/utils/array/sortArray'
</script>
<template><div>test</div></template>
`
  )
  prepareGateSession(sessionVerdictDir)
  recordRead(sessionVerdictDir, "src/utils/array/sortArray.ts")
  recordVerdict(sessionVerdictDir, SESSION_COMPACT)

  const sessionAllowEmptyPayload = runHook(sessionVerdictDir, {
    tool_input: {
      path: "src/views/Page.vue",
      old_string: "test",
      new_string: "test-updated"
    }
  })
  assert(
    "session Verdict recorded + empty payload.text → allow",
    sessionAllowEmptyPayload.permission === "allow",
    JSON.stringify(sessionAllowEmptyPayload)
  )
} finally {
  fs.rmSync(sessionVerdictDir, { recursive: true, force: true })
}

const emptyPayloadDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-empty-payload-"))
try {
  fs.mkdirSync(path.join(emptyPayloadDir, "src", "views"), { recursive: true })
  fs.mkdirSync(path.join(emptyPayloadDir, "src", "utils"), { recursive: true })
  fs.writeFileSync(
    path.join(emptyPayloadDir, ".utils-bookrc.json"),
    JSON.stringify(
      { hookMode: "confirm", utilsDir: "src/utils", utilsImportAliases: ["@/utils"], remindWritePaths: ["src/views"] },
      null,
      2
    ) + "\n"
  )
  fs.writeFileSync(path.join(emptyPayloadDir, "src/utils/copy.ts"), "export function copyToClip() {}\n")
  fs.writeFileSync(
    path.join(emptyPayloadDir, "src/views/Page.vue"),
    `<script setup lang="ts">
import { copyToClip } from '@/utils/copy'
</script>
<template><div>x</div></template>
`
  )
  prepareGateSession(emptyPayloadDir)
  recordRead(emptyPayloadDir, "src/utils/copy.ts")

  const emptyPayloadDeny = runHook(emptyPayloadDir, {
    tool_input: { path: "src/views/Page.vue", old_string: "x", new_string: "y" }
  })
  assert(
    "no session Verdict + empty payload → deny verdict_missing_empty_payload",
    emptyPayloadDeny.permission === "deny" &&
      emptyPayloadDeny.denyReason === "verdict_missing_empty_payload",
    JSON.stringify(emptyPayloadDeny)
  )
} finally {
  fs.rmSync(emptyPayloadDir, { recursive: true, force: true })
}

const nonsubstantiveDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-nonsubstantive-"))
try {
  fs.mkdirSync(path.join(nonsubstantiveDir, "src", "views"), { recursive: true })
  fs.mkdirSync(path.join(nonsubstantiveDir, "src", "utils"), { recursive: true })
  fs.writeFileSync(
    path.join(nonsubstantiveDir, ".utils-bookrc.json"),
    JSON.stringify(
      { hookMode: "confirm", utilsDir: "src/utils", utilsImportAliases: ["@/utils"], remindWritePaths: ["src/views"] },
      null,
      2
    ) + "\n"
  )
  fs.writeFileSync(path.join(nonsubstantiveDir, "src/utils/copy.ts"), "export function copyToClip() {}\n")
  fs.writeFileSync(
    path.join(nonsubstantiveDir, "src/views/Page.vue"),
    `<script setup lang="ts">
import { copyToClip } from '@/utils/copy'
</script>
<template><div>x</div></template>
`
  )
  prepareGateSession(nonsubstantiveDir)
  recordRead(nonsubstantiveDir, "src/utils/copy.ts")

  const badTableNoMarker = `| Symbol | Read @ path | Q4 | Verdict |
| copyToClip | copy.ts | same semantics for clipboard | reuse(copyToClip) |`

  const nonsubstantiveDeny = runHook(nonsubstantiveDir, {
    text: badTableNoMarker,
    tool_input: { path: "src/views/Page.vue", old_string: "x", new_string: "y" }
  })
  assert(
    "payload table without Verdict marker → deny verdict_not_substantive",
    nonsubstantiveDeny.permission === "deny" &&
      nonsubstantiveDeny.denyReason === "verdict_not_substantive",
    JSON.stringify(nonsubstantiveDeny)
  )
} finally {
  fs.rmSync(nonsubstantiveDir, { recursive: true, force: true })
}


if (process.exitCode) {
  console.error('\nSome tests failed.')
  process.exit(1)
}
console.log('\nAll hook confirm tests passed.')
