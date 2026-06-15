#!/usr/bin/env node
import {
  hasDiscovery,
  hasRead,
  hasVerdict,
  isUnderUtils,
  loadHookConfig,
  matchesRemindPath,
  normalizeAuditPath,
  patchAddsLocalHelper,
  resolveContentUtilPaths,
  resolveTargetUtilPaths
} from './read-audit-lib.mjs'

const PLACEMENT_SECTION = 'docs/agent-catalog/placement-decision.md section 2'

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

function denyReadMessage(missingPaths) {
  const list = missingPaths.map((p) => `\`${p}\``).join(', ')
  return `Denied: Read util source (${list}) this session, output Confirm (Q1-Q5) + Verdict（最终） in chat, then Write again. WIP/existing import does NOT exempt. Do not write .utils-discovery-cache.json. See ${PLACEMENT_SECTION} and utils-reuse-gate.mdc.`
}

function denyVerdictMessage() {
  return `Denied: Read util source is NOT enough. Output substantive Confirm (Q1-Q5) + Verdict（最终） in chat in a **separate message before Write** (no Write/StrReplace tools in that message). Include Discovery + Local helpers table when adding feature helpers. Obvious reuse / WIP / existing @/utils does NOT exempt. See utils-reuse-gate.mdc.`
}

function denyDiscoveryMessage() {
  return `Denied: Read \`docs/agent-catalog/utils-book/index.md\` (D1) OR Grep/SemanticSearch under configured utilsDir (D2) before adding local function helpers in feature code. Then output Discovery + Local helpers table in Message A. See ${PLACEMENT_SECTION} and utils-reuse-gate.mdc.`
}

function remindUtilsMessage() {
  return `Reminder: Before writing shared utils, Read source, output Confirm (Q1-Q5) + Verdict（最终） in chat. See utils-reuse-gate.mdc.`
}

function remindAppMessage() {
  return `Reminder: Utils gate applies (existing @/utils counts). Read util source, output Confirm + Verdict（最终） in chat before Write. See utils-reuse-gate.mdc.`
}

function collectRequiredReads(normalized, payload, config, cwd) {
  const requiredReads = new Set()
  const isRemind = matchesRemindPath(normalized, config.remindWritePaths)
  const isUtils = isUnderUtils(normalized, config.utilsDir)

  if (isUtils) {
    requiredReads.add(normalized)
  }

  if (isRemind || isUtils) {
    for (const p of resolveTargetUtilPaths(normalized, payload, config, cwd)) {
      requiredReads.add(p)
    }
  }

  // Also scan patch-only imports (new files / import line in diff)
  const patchContent = [
    payload.content,
    payload.new_string,
    payload.newString
  ]
    .filter(Boolean)
    .join('\n')
  for (const p of resolveContentUtilPaths(patchContent, config, cwd)) {
    requiredReads.add(p)
  }

  return { requiredReads, isRemind, isUtils }
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
    const cwd = process.cwd()
    const filePath = extractPath(input)
    if (!filePath) {
      process.stdout.write(JSON.stringify({ permission: 'allow' }))
      return
    }

    const normalized = normalizeAuditPath(filePath)
    const payload = extractWriteContent(input)
    const { requiredReads, isRemind, isUtils } = collectRequiredReads(
      normalized,
      payload,
      config,
      cwd
    )

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
    const addsHelper =
      isRemind && patchAddsLocalHelper(payload) && !isUtils

    if (addsHelper && !hasDiscovery(cwd)) {
      process.stdout.write(
        JSON.stringify({
          permission: 'deny',
          agent_message: denyDiscoveryMessage()
        })
      )
      return
    }

    if (requiredReads.size === 0) {
      process.stdout.write(JSON.stringify({ permission: 'allow' }))
      return
    }

    const missing = [...requiredReads].filter((p) => !hasRead(p, cwd))
    if (missing.length > 0) {
      process.stdout.write(
        JSON.stringify({
          permission: 'deny',
          agent_message: denyReadMessage(missing)
        })
      )
      return
    }

    if (!hasVerdict(cwd)) {
      process.stdout.write(
        JSON.stringify({
          permission: 'deny',
          agent_message: denyVerdictMessage()
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
