#!/usr/bin/env node
import { recordVerdict, resetVerdictAudit } from './read-audit-lib.mjs'

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function extractAssistantText(input) {
  if (input.text != null) return String(input.text)
  if (input.response != null) return String(input.response)
  if (input.content != null) return String(input.content)
  return ''
}

async function main() {
  try {
    if (process.argv.includes('--reset')) {
      resetVerdictAudit(process.cwd())
      process.stdout.write(JSON.stringify({ ok: true }))
      return
    }

    const raw = await readStdin()
    if (!raw.trim()) {
      process.stdout.write(JSON.stringify({ ok: true }))
      return
    }

    const input = JSON.parse(raw)
    const text = extractAssistantText(input)
    const recorded = recordVerdict(text, process.cwd())

    process.stdout.write(JSON.stringify({ ok: true, recorded }))
  } catch {
    process.stdout.write(JSON.stringify({ ok: true }))
  }
}

main()
