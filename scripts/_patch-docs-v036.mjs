#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const patches = [
  {
    file: 'templates/docs/agent-catalog/README.md',
    replacements: [
      [
        '**强制总闸（v0.3.4）**：`utils-reuse-gate.mdc` + `pre-write-utils-checklist.mdc` — **选中后证明**（§1.6）：每个 util + Local helpers 行须 **分项 Q1–Q4** + Verdict；禁止空泛「Q1–Q5 通过」。`hookMode: confirm` 时 Hook **fail-closed**：会话已 Read util 后对 `remindWritePaths` Write **无 prior Verdict → deny**；异常不再 silent allow。',
        '**强制总闸（v0.3.6）**：`utils-reuse-gate.mdc` + `pre-write-utils-checklist.mdc` — **选中后证明**（§1.6）：每个 util + Local helpers 行须 **分项 Q1–Q4** + Verdict；禁止空泛「Q1–Q5 通过」。默认 **`hookMode: off`**（Rules 约束，不拦 Write）；opt-in **`hookMode: confirm`** 时 Hook **fail-closed** deny Write。'
      ],
      [
        'Cursor 开在**项目根**，`.utils-bookrc.json` 中 `hookMode: confirm`：',
        'Cursor 开在**项目根**。默认 **`hookMode: off`**；需硬门禁时设 `hookMode: confirm`：'
      ]
    ]
  },
  {
    file: 'templates/snippets/project-agent-gate.inject.md',
    replacements: [
      [
        '- Default **`hookMode: confirm` (v0.2.1)**: deny Write until util files Read **and** prior-chat Verdict with **individual Q1–Q4**; new local helpers require Discovery + Local helpers table + substantive Verdict.',
        '- Default **`hookMode: off` (v0.3.6)**: Rules-only Confirm + Verdict; opt-in **`hookMode: confirm`** for hard deny.'
      ]
    ]
  },
  {
    file: 'templates/cursor/skills/reuse-before-create/SKILL.md',
    replacements: [
      [
        '`hookMode: confirm` → deny Write until util files Read + prior Verdict with **individual Q1–Q4**; deny new local helpers without Discovery **and** Local helpers table. See README.',
        'Default **`hookMode: off`** — Rules only. Opt-in **`hookMode: confirm`** → deny Write until Read + Verdict + Discovery + Local helpers table. See README.'
      ]
    ]
  }
]

for (const { file, replacements } of patches) {
  const p = path.join(root, file)
  let s = fs.readFileSync(p, 'utf8')
  for (const [oldS, newS] of replacements) {
    if (!s.includes(oldS)) {
      console.warn('missing in', file, oldS.slice(0, 50))
      continue
    }
    s = s.replace(oldS, newS)
  }
  fs.writeFileSync(p, s)
  console.log('updated', file)
}
