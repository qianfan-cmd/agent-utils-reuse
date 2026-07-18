#!/usr/bin/env node
import {
  extractConfirmTextForGate,
  loadHookConfig,
  logHookError,
  logHookGateDebug,
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
    const { text, source } = extractConfirmTextForGate(input, raw, cwd)
    const recorded = text.trim() ? recordVerdict(text, cwd, source === 'none' ? undefined : source) : false

    if (recorded) {
      logHookGateDebug(cwd, 'track-utils-verdict', { verdict_source: source, recorded: true })
    }

    process.stdout.write(
      JSON.stringify({
        ok: true,
        recorded,
        verdict_source: source,
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
