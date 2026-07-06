#!/usr/bin/env node
import {
  extractAssistantTextFromHookInput,
  extractTextFromRawHookStdin,
  loadHookConfig,
  logHookError,
  parseHookJsonSafe,
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

    const { input, parseError, partial } = parseHookJsonSafe(raw)
    let text = ''
    if (input) {
      text = extractAssistantTextFromHookInput(input)
    }
    if (!text.trim()) {
      text = extractTextFromRawHookStdin(raw)
    }
    const recorded = text.trim() ? recordVerdict(text, cwd) : false

    process.stdout.write(
      JSON.stringify({
        ok: true,
        recorded,
        partial: partial || Boolean(parseError),
        parseError: parseError ? String(parseError.message) : undefined
      })
    )
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
