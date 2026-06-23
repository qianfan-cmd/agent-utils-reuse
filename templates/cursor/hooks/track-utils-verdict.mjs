#!/usr/bin/env node
import { loadHookConfig, logHookError, recordVerdict, resetVerdictAudit } from './read-audit-lib.mjs'

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
  const cwd = process.cwd()
  const config = loadHookConfig(cwd)

  try {
    if (process.argv.includes('--reset')) {
      resetVerdictAudit(cwd)
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
    const recorded = recordVerdict(text, cwd)

    process.stdout.write(JSON.stringify({ ok: true, recorded }))
  } catch (err) {
    logHookError(cwd, 'track-utils-verdict', err)
    if (config.hookMode === 'confirm') {
      process.stdout.write(JSON.stringify({ ok: false, error: String(err?.message || err) }))
    } else {
      process.stdout.write(JSON.stringify({ ok: true }))
    }
  }
}

main()
