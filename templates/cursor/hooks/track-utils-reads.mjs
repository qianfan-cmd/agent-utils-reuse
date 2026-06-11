#!/usr/bin/env node
import {
  isUnderUtils,
  loadHookConfig,
  normalizeAuditPath,
  recordRead,
  resetSessionAudits
} from './read-audit-lib.mjs'

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

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
  try {
    if (process.argv.includes('--reset')) {
      resetSessionAudits(process.cwd())
      process.stdout.write(JSON.stringify({ ok: true }))
      return
    }

    const raw = await readStdin()
    if (!raw.trim()) {
      process.stdout.write(JSON.stringify({ ok: true }))
      return
    }

    const input = JSON.parse(raw)
    const filePath = extractReadPath(input)
    if (!filePath) {
      process.stdout.write(JSON.stringify({ ok: true }))
      return
    }

    const config = loadHookConfig(process.cwd())
    const normalized = normalizeAuditPath(filePath)
    if (isUnderUtils(normalized, config.utilsDir)) {
      recordRead(normalized, process.cwd())
    }

    process.stdout.write(JSON.stringify({ ok: true, recorded: normalized }))
  } catch {
    process.stdout.write(JSON.stringify({ ok: true }))
  }
}

main()
