#!/usr/bin/env node
import {
  extractShellCommand,
  loadHookConfig,
  logHookError,
  parseHookJson,
  parseNestedJson,
  readHookStdin,
  recordDiscovery,
  shellCommandIsUtilsSearch,
  toolInputTargetsUtilsDir,
  toolInputTargetsUtilsIndex
} from './read-audit-lib.mjs'

function extractToolInput(input) {
  const toolInput = input.tool_input ?? input.arguments ?? input
  if (typeof toolInput === 'string') {
    try {
      return parseNestedJson(toolInput) ?? {}
    } catch {
      return {}
    }
  }
  return toolInput ?? {}
}

async function main() {
  const cwd = process.cwd()
  const config = loadHookConfig(cwd)

  try {
    const raw = await readHookStdin()
    if (!raw.trim()) {
      process.stdout.write(JSON.stringify({ ok: true }))
      return
    }

    const input = parseHookJson(raw)
    const toolInput = extractToolInput(input)

    const shellCmd = extractShellCommand(toolInput)
    if (shellCommandIsUtilsSearch(shellCmd)) {
      recordDiscovery('cli', cwd)
    } else if (toolInputTargetsUtilsIndex(toolInput, config, cwd)) {
      recordDiscovery('grep-index', cwd)
    } else if (toolInputTargetsUtilsDir(toolInput, config, cwd)) {
      recordDiscovery('d2-utils-dir', cwd)
    }

    process.stdout.write(JSON.stringify({ ok: true }))
  } catch (err) {
    logHookError(cwd, 'track-utils-discovery', err)
    if (config.hookMode === 'confirm') {
      process.stdout.write(JSON.stringify({ ok: false, error: String(err?.message || err) }))
    } else {
      process.stdout.write(JSON.stringify({ ok: true }))
    }
  }
}

main()
