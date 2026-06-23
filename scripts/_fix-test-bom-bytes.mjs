#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const p = path.join(path.dirname(fileURLToPath(import.meta.url)), 'test-hook-confirm.mjs')
let s = fs.readFileSync(p, 'utf8')

s = s.replace(
  `  const bomBytes = Buffer.from("\\xEF\\xBB\\xBF" + JSON.stringify({ tool_input: { path: "src/utils/bar.ts" } }))`,
  `  const bomBytes = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(JSON.stringify({ tool_input: { path: "src/utils/bar.ts" } }), "utf8")
  ])`
)

s = s.replace(
  `  const writeBomBytes = Buffer.from(
    "\\xEF\\xBB\\xBF" +
      JSON.stringify({
        tool_input: { path: "src/views/Page.vue", old_string: "test", new_string: "test-updated" }
      })
  )`,
  `  const writeBomBytes = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(
      JSON.stringify({
        tool_input: { path: "src/views/Page.vue", old_string: "test", new_string: "test-updated" }
      }),
      "utf8"
    )
  ])`
)

s = s.replace(
  `  const discoveryBom = Buffer.from(
    "\\xEF\\xBB\\xBF" + JSON.stringify({ tool_input: { pattern: "foo", path: "src/utils" } })
  )`,
  `  const discoveryBom = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(JSON.stringify({ tool_input: { pattern: "foo", path: "src/utils" } }), "utf8")
  ])`
)

fs.writeFileSync(p, s)
console.log('fixed BOM byte buffers in', p)
