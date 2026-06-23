#!/usr/bin/env node
import {
  hasDiscovery,
  hasLocalHelpersTableInVerdict,
  hasRead,
  hasVerdict,
  hookErrorDenyMessage,
  isUnderUtils,
  loadHookConfig,
  logHookError,
  matchesRemindPath,
  normalizeAuditPath,
  patchAddsLocalHelper,
  resolveContentUtilPaths,
  resolveTargetUtilPaths,
  sessionHasUtilReads,
  parseHookJson,
  readHookStdin,
  tryEagerRecordVerdict
} from './read-audit-lib.mjs'

const PLACEMENT_SECTION = 'docs/agent-catalog/placement-decision.md §1.6 and §3'

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
  return `Denied: Read util / search / gen index do NOT complete the gate. Output substantive Confirm in chat **before** the first Write in this response: **individual Q1, Q2, Q3, Q4** (and Q5) per util and per Local helpers row — forbidden: "Q1-Q5 通过". Include Verdict（最终） with reuse/newUtil/featureLocal/partialReuse. If you already output Verdict, run pnpm update:utils-reuse and check .cursor/.utils-gate-verdict.json. See ${PLACEMENT_SECTION}.`
}

function denyDiscoveryMessage(config) {
  const indexFile = config.utilsIndexFile || 'docs/agent-catalog/utils-index.json'
  return `Denied: Run \`agent-utils-reuse search "<keywords>"\` (D1 preferred) OR Grep \`${indexFile}\` before adding local function helpers. Forbidden for Shortlist: Read/Grep utils-book/*.md. D2: Grep/SemanticSearch under utilsDir. Then output Discovery + Local helpers table + per-symbol Q1-Q4 in Confirm phase (same turn before Write). See ${PLACEMENT_SECTION} and utils-reuse-gate.mdc.`
}

function denyLocalHelpersTableMessage() {
  return `Denied: Message A must include a **Local helpers** table (header + at least one data row) with per-row Confirm (individual Q1-Q4) and Verdict（最终） in chat before Write (same assistant turn OK). See ${PLACEMENT_SECTION}.`
}

function remindUtilsMessage() {
  return `Reminder: Before writing shared utils, Read source, output per-symbol Confirm (Q1-Q4) + Verdict（最终） in chat. See utils-reuse-gate.mdc.`
}

function remindAppMessage() {
  return `Reminder: Utils gate applies (existing @/utils counts). Read util source, output per-symbol Confirm + Verdict（最终） in chat before Write. See utils-reuse-gate.mdc.`
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

  const patchContent = [payload.content, payload.new_string, payload.newString]
    .filter(Boolean)
    .join('\n')
  for (const p of resolveContentUtilPaths(patchContent, config, cwd)) {
    requiredReads.add(p)
  }

  return { requiredReads, isRemind, isUtils }
}

function failClosedWrite(config, cwd, err, context) {
  logHookError(cwd, context, err)
  if (config.hookMode === 'remind') {
    process.stdout.write(JSON.stringify({ permission: 'allow' }))
    return
  }
  process.stdout.write(
    JSON.stringify({
      permission: 'deny',
      agent_message: hookErrorDenyMessage()
    })
  )
}

async function main() {
  let config = loadHookConfig(process.cwd())
  const cwd = process.cwd()

  try {
    const raw = await readHookStdin()
    if (!raw.trim()) {
      process.stdout.write(JSON.stringify({ permission: 'allow' }))
      return
    }

    const input = parseHookJson(raw)
    config = loadHookConfig(cwd)
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

    // hookMode: confirm — same-turn Verdict in hook payload counts
    tryEagerRecordVerdict(input, cwd)

    const addsHelper = isRemind && patchAddsLocalHelper(payload) && !isUtils

    if (addsHelper) {
      if (!hasDiscovery(cwd)) {
        process.stdout.write(
          JSON.stringify({
            permission: 'deny',
            agent_message: denyDiscoveryMessage(config)
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

      if (!hasLocalHelpersTableInVerdict(cwd)) {
        process.stdout.write(
          JSON.stringify({
            permission: 'deny',
            agent_message: denyLocalHelpersTableMessage()
          })
        )
        return
      }
    }

    // Session Read util + Write under remindWritePaths → require prior Verdict
    if (isRemind && sessionHasUtilReads(cwd) && !hasVerdict(cwd)) {
      process.stdout.write(
        JSON.stringify({
          permission: 'deny',
          agent_message: denyVerdictMessage()
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
  } catch (err) {
    failClosedWrite(config, cwd, err, 'check-discovery-before-shared-write')
  }
}

main()
