import fs from 'node:fs'
import path from 'node:path'

const roots = [
  'templates/shared/hooks/check-discovery-core.mjs',
  'templates/cursor/hooks/_shared/check-discovery-core.mjs',
  'templates/claude/hooks/_shared/check-discovery-core.mjs',
  'templates/codex/hooks/_shared/check-discovery-core.mjs'
]

for (const rel of roots) {
  const p = path.resolve(rel)
  if (!fs.existsSync(p)) continue
  let lines = fs.readFileSync(p, 'utf8').split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    line = line.replace(/emitGateResult\(\{ permission: 'allow' \}\)\)/, "emitGateResult({ permission: 'allow' })")
    line = line.replace(
      /emitGateResult\(\{ permission: 'allow', uiOnly: true \}\)\)/,
      "emitGateResult({ permission: 'allow', uiOnly: true })"
    )
    if (/^\s+\)\s*$/.test(line) && out.length > 0 && out[out.length - 1].trim().endsWith('})')) {
      continue
    }
    if (/^\s+\)\s*$/.test(line) && out.length > 0 && out[out.length - 1].includes('emitGateResult(')) {
      continue
    }
    out.push(line)
  }
  let text = out.join('\n')
  text = text.replace(/emitGateResult\(\s*\n([\s\S]*?)\n\s+\)\s*\n\s+\)/g, 'emitGateResult(\n$1\n    )\n')
  fs.writeFileSync(p, text)
  console.log('fixed', rel)
}
