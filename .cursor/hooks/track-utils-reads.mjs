#!/usr/bin/env node
import {
  isUnderUtils,
  loadHookConfig,
  logHookError,
  normalizeAuditPath,
  parseHookJson,
  readHookStdin,
  recordRead,
  resetSessionAudits
} from './read-audit-lib.mjs'

function extractReadPath(input) {
  const toolInput = input.tool_input ?? input.arguments ?? input
  if (typeof toolInput === 'string') {
    try {
      const parsed = JSON.parse(toolInput)
      return parsed.path ?? parsed.file_path
    } catch {
      return null
    }
  }
  return toolInput.path ?? toolInput.file_path
}

async function main() {
  const cwd = process.cwd()
  const config = loadHookConfig(cwd)

  try {
    if (process.argv.includes('--reset')) {
      resetSessionAudits(cwd)
      process.stdout.write(JSON.stringify({ ok: true }))
      return
    }

    const raw = await readHookStdin()
    if (!raw.trim()) {
      process.stdout.write(JSON.stringify({ ok: true }))
      return
    }

    const input = parseHookJson(raw)
    const filePath = extractReadPath(input)
    if (!filePath) {
      process.stdout.write(JSON.stringify({ ok: true }))
      return
    }

    const normalized = normalizeAuditPath(filePath)
    if (isUnderUtils(normalized, config.utilsDir)) {
      recordRead(normalized, cwd)
    }

    process.stdout.write(JSON.stringify({ ok: true, recorded: normalized }))
  } catch (err) {
    logHookError(cwd, 'track-utils-reads', err)
    if (config.hookMode === 'confirm') {
      process.stdout.write(JSON.stringify({ ok: false, error: String(err?.message || err) }))
    } else {
      process.stdout.write(JSON.stringify({ ok: true }))
    }
  }
}

main()
