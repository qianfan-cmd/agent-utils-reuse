#!/usr/bin/env node
import {
  extractAssistantTextFromHookInput,
  loadHookConfig,
  logHookError,
  parseHookJson,
  readHookStdin,
  recordVerdict,
  resetVerdictAudit
} from './read-audit-lib.mjs'

async function main() {
  const cwd = process.cwd()
  const config = loadHookConfig(cwd)

  try {
    if (process.argv.includes('--reset')) {
      resetVerdictAudit(cwd)
      process.stdout.write(JSON.stringify({ ok: true }))
      return
    }

    const raw = await readHookStdin()
    if (!raw.trim()) {
      process.stdout.write(JSON.stringify({ ok: true }))
      return
    }

    const input = parseHookJson(raw)
    const text = extractAssistantTextFromHookInput(input)
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
