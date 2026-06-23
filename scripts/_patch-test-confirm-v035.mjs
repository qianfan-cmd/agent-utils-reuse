#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const p = path.join(root, 'scripts/test-hook-confirm.mjs')
let s = fs.readFileSync(p, 'utf8')

const bomInsert = `  // v0.3.5: real UTF-8 BOM bytes (EF BB BF) on check-discovery + track-utils-discovery
  const bomBytes = Buffer.from("\\xEF\\xBB\\xBF" + JSON.stringify({ tool_input: { path: "src/utils/bar.ts" } }))
  const readBytes = spawnSync(process.execPath, [hookPath(bomTemp, "track-utils-reads.mjs")], {
    cwd: bomTemp,
    input: bomBytes
  })
  const readBytesOut = JSON.parse((readBytes.stdout || "").trim())
  assert("BOM bytes Read util → ok", readBytesOut.ok === true)

  resetAudit(bomTemp)
  recordRead(bomTemp, "src/utils/copy.ts")
  recordVerdict(bomTemp)
  fs.mkdirSync(path.join(bomTemp, "src", "views"), { recursive: true })
  fs.writeFileSync(
    path.join(bomTemp, "src", "views", "Page.vue"),
    "<template><div>test</div></template>\\n"
  )
  fs.writeFileSync(
    path.join(bomTemp, ".utils-bookrc.json"),
    JSON.stringify(
      { hookMode: "confirm", utilsDir: "src/utils", utilsImportAliases: ["@/utils"], remindWritePaths: ["src/views"] },
      null,
      2
    ) + "\\n"
  )
  const writeBomBytes = Buffer.from(
    "\\xEF\\xBB\\xBF" +
      JSON.stringify({
        tool_input: { path: "src/views/Page.vue", old_string: "test", new_string: "test-updated" }
      })
  )
  const writeBom = spawnSync(process.execPath, [hookScript(bomTemp)], {
    cwd: bomTemp,
    input: writeBomBytes
  })
  const writeBomOut = JSON.parse((writeBom.stdout || "").trim())
  assert(
    "BOM bytes preToolUse Write after Verdict → allow",
    writeBomOut.permission === "allow",
    JSON.stringify(writeBomOut)
  )

  const discoveryBom = Buffer.from(
    "\\xEF\\xBB\\xBF" + JSON.stringify({ tool_input: { pattern: "foo", path: "src/utils" } })
  )
  const discOut = spawnSync(process.execPath, [hookPath(bomTemp, "track-utils-discovery.mjs")], {
    cwd: bomTemp,
    input: discoveryBom
  })
  const discParsed = JSON.parse((discOut.stdout || "").trim())
  assert("BOM bytes track-utils-discovery → ok", discParsed.ok === true)
  const discAudit = JSON.parse(
    fs.readFileSync(path.join(bomTemp, ".cursor", ".utils-gate-discovery.json"), "utf8")
  )
  assert("BOM bytes Discovery recorded", discAudit.recorded === true)`

if (!s.includes('BOM bytes preToolUse Write')) {
  s = s.replace(
    '  assert("BOM stdin Verdict → recorded", vOut.recorded === true)',
    `  assert("BOM stdin Verdict → recorded", vOut.recorded === true)\n\n${bomInsert}`
  )
}

const helperBlock = `
// --- v0.3.5: addsHelper + | Helper | table + CSS-only allow ---
const helperTableVerdict = \`| Helper | utils 候选 | 对照结论 |
| copyText | copyToClip @ copy.ts | reuse(copyToClip) |

Confirm copyToClip: Q1 text Q2 clipboard Q3 DOM Q4 same Q5 no
Verdict（最终）: reuse(copyToClip)\`

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
    ) + "\\n"
  )
  fs.writeFileSync(path.join(helperDir, "src", "utils", "copy.ts"), "export function copyToClip() {}\\n")
  fs.writeFileSync(
    path.join(helperDir, "src", "views", "Page.vue"),
    \`<template><div>test</div></template>
<script setup lang="ts">
// marker
</script>
<style scoped>
.copy-btn { color: red; }
</style>
\`
  )
  resetAudit(helperDir)
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
      new_string: \`function copyText() {}\\n// marker\`
    }
  })
  assert(
    "addsHelper + discovery + | Helper | table + Verdict → allow",
    helperAllow.permission === "allow",
    JSON.stringify(helperAllow)
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
`

if (!s.includes('addsHelper + discovery + | Helper |')) {
  s = s.replace(
    '} finally {\n  fs.rmSync(sameTurnDir, { recursive: true, force: true })\n}\n\nif (process.exitCode)',
    `} finally {\n  fs.rmSync(sameTurnDir, { recursive: true, force: true })\n}${helperBlock}\n\nif (process.exitCode)`
  )
}

fs.writeFileSync(p, s)
console.log('updated', p)
