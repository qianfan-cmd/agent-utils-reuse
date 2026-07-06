#!/usr/bin/env node
import {
  extractShellCommand,
  getDiscoveryPathLabel,
  loadHookConfig,
  logHookError,
  logHookGateDebug,
  parseHookJsonSafe,
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

    const { input, parseError, partial } = parseHookJsonSafe(raw)
    if (!input) {
      logHookError(cwd, 'track-utils-discovery', parseError ?? new Error('Hook JSON parse failed'))
      process.stdout.write(
        JSON.stringify({
          ok: false,
          parseError: parseError ? String(parseError.message) : 'no input',
          partial
        })
      )
      return
    }

    const toolInput = extractToolInput(input)

    const shellCmd = extractShellCommand(toolInput)
    if (shellCommandIsUtilsSearch(shellCmd)) {
      recordDiscovery('cli', cwd)
    } else if (toolInputTargetsUtilsIndex(toolInput, config, cwd)) {
      recordDiscovery('grep-index', cwd)
    } else if (toolInputTargetsUtilsDir(toolInput, config, cwd)) {
      recordDiscovery('d2-utils-dir', cwd)
    }

    logHookGateDebug(cwd, 'track-utils-discovery', {
      discovery_path: getDiscoveryPathLabel(cwd),
      parse_partial: partial || Boolean(parseError),
      grep_payload_path: toolInput.path ?? toolInput.pattern ?? toolInput.glob ?? null
    })

    process.stdout.write(
      JSON.stringify({
        ok: true,
        discovery_path: getDiscoveryPathLabel(cwd),
        partial: partial || Boolean(parseError)
      })
    )
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
