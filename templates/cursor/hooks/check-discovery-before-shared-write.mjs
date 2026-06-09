#!/usr/bin/env node
import fs from 'node:fs'
import {
  hasRead,
  isUnderUtils,
  loadAudit,
  loadHookConfig,
  matchesRemindPath,
  normalizeAuditPath,
  resolveContentUtilPaths
} from './read-audit-lib.mjs'

const PLACEMENT_SECTION = 'docs/agent-catalog/placement-decision.md section 3'

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function extractPath(input) {
  const toolInput = input.tool_input ?? input.arguments ?? input
  if (typeof toolInput === 'string') {
    try {
      const parsed = JSON.parse(toolInput)
      return parsed.path ?? parsed.file_path ?? parsed.target_notebook
    } catch {
      return null
    }
  }
  return toolInput.path ?? toolInput.file_path ?? toolInput.target_notebook
}

function extractWriteContent(input) {
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

function getContentPayload(payload) {
  const parts = []
  if (payload.content) parts.push(String(payload.content))
  if (payload.new_string) parts.push(String(payload.new_string))
  if (payload.newString) parts.push(String(payload.newString))
  return parts.join('\n')
}

function denyMessage(missingPaths) {
  const list = missingPaths.map((p) => `\`${p}\``).join(', ')
  return `Denied: Read util source (${list}) this session, output Confirm (Q1-Q5) + Verdict（最终） in chat, then Write again. Do not write .utils-discovery-cache.json. See ${PLACEMENT_SECTION} and utils-reuse-gate.mdc.`
}

function remindUtilsMessage() {
  return `Reminder: Before writing shared utils, Read source, output Confirm (Q1-Q5) + Verdict in chat. See ${PLACEMENT_SECTION}.`
}

function remindAppMessage() {
  return `Reminder: Read util source, output Confirm + Verdict in chat before Write. hookMode confirm requires Read audit. See utils-reuse-gate.mdc.`
}

async function main() {
  try {
    const raw = await readStdin()
    if (!raw.trim()) {
      process.stdout.write(JSON.stringify({ permission: 'allow' }))
      return
    }

    const input = JSON.parse(raw)
    const config = loadHookConfig(process.cwd())
    const filePath = extractPath(input)
    if (!filePath) {
      process.stdout.write(JSON.stringify({ permission: 'allow' }))
      return
    }

    const normalized = normalizeAuditPath(filePath)
    const payload = extractWriteContent(input)
    const content = getContentPayload(payload)
    const isRemind = matchesRemindPath(normalized, config.remindWritePaths)
    const isUtils = isUnderUtils(normalized, config.utilsDir)

    if (config.hookMode === 'remind') {
      if (isUtils) {
        process.stdout.write(
          JSON.stringify({ permission: 'allow', agent_message: remindUtilsMessage() })
        )
        return
      }
      if (isRemind) {
        process.stdout.write(
          JSON.stringify({ permission: 'allow', agent_message: remindAppMessage() })
        )
        return
      }
      process.stdout.write(JSON.stringify({ permission: 'allow' }))
      return
    }

    // hookMode: confirm
    const utilPathsFromContent = resolveContentUtilPaths(content, config, process.cwd())
    const requiredReads = new Set(utilPathsFromContent)

    if (isUtils) {
      requiredReads.add(normalized)
    }

    if (requiredReads.size === 0) {
      if (isUtils) {
        process.stdout.write(
          JSON.stringify({ permission: 'allow', agent_message: remindUtilsMessage() })
        )
        return
      }
      if (isRemind) {
        process.stdout.write(JSON.stringify({ permission: 'allow' }))
        return
      }
      process.stdout.write(JSON.stringify({ permission: 'allow' }))
      return
    }

    const missing = [...requiredReads].filter((p) => !hasRead(p, process.cwd()))
    if (missing.length > 0) {
      process.stdout.write(
        JSON.stringify({
          permission: 'deny',
          agent_message: denyMessage(missing)
        })
      )
      return
    }

    process.stdout.write(
      JSON.stringify(
        isUtils || isRemind
          ? { permission: 'allow', agent_message: remindAppMessage() }
          : { permission: 'allow' }
      )
    )
  } catch {
    process.stdout.write(JSON.stringify({ permission: 'allow' }))
  }
}

main()
