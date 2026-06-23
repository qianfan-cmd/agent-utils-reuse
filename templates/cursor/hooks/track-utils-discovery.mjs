#!/usr/bin/env node
import {
  extractShellCommand,
  loadHookConfig,
  logHookError,
  recordDiscovery,
  shellCommandIsUtilsSearch,
  toolInputTargetsUtilsDir,
  toolInputTargetsUtilsIndex
} from './read-audit-lib.mjs'

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function extractToolInput(input) {
  const toolInput = input.tool_input ?? input.arguments ?? input
  if (typeof toolInput === 'string') {
    try {
      return JSON.parse(toolInput)
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
    const raw = await readStdin()
    if (!raw.trim()) {
      process.stdout.write(JSON.stringify({ ok: true }))
      return
    }

    const input = JSON.parse(raw)
    const toolInput = extractToolInput(input)

    const shellCmd = extractShellCommand(toolInput)
    if (shellCommandIsUtilsSearch(shellCmd)) {
      recordDiscovery('search', cwd)
    } else if (toolInputTargetsUtilsIndex(toolInput, config)) {
      recordDiscovery('index', cwd)
    } else if (toolInputTargetsUtilsDir(toolInput, config)) {
      recordDiscovery('grep', cwd)
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
