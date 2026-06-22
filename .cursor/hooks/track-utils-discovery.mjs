#!/usr/bin/env node
import {
  extractShellCommand,
  loadHookConfig,
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
  try {
    const raw = await readStdin()
    if (!raw.trim()) {
      process.stdout.write(JSON.stringify({ ok: true }))
      return
    }

    const input = JSON.parse(raw)
    const toolInput = extractToolInput(input)
    const config = loadHookConfig(process.cwd())
    const cwd = process.cwd()

    const shellCmd = extractShellCommand(toolInput)
    if (shellCommandIsUtilsSearch(shellCmd)) {
      recordDiscovery('search', cwd)
    } else if (toolInputTargetsUtilsIndex(toolInput, config)) {
      recordDiscovery('index', cwd)
    } else if (toolInputTargetsUtilsDir(toolInput, config)) {
      recordDiscovery('grep', cwd)
    }

    process.stdout.write(JSON.stringify({ ok: true }))
  } catch {
    process.stdout.write(JSON.stringify({ ok: true }))
  }
}

main()
