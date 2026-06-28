#!/usr/bin/env node
import {
  extractAssistantTextFromHookInput,
  getMissingSiblingMentions,
  getStaleVerdictSymbols,
  hasAgentsFileRead,
  hasDiscovery,
  hasLocalHelpersTableInVerdict,
  hasRead,
  hasVerdict,
  hookErrorDenyMessage,
  isUnderUtils,
  loadHookConfig,
  loadVerdictAudit,
  logHookError,
  matchesRemindPath,
  needsDiscoveryOutcomeInChat,
  normalizeAuditPath,
  patchAddsLocalHelper,
  requiredSymbolsFromPatch,
  resolveContentUtilPaths,
  resolveTargetUtilPaths,
  sessionHasUtilReads,
  parseHookJson,
  parseNestedJson,
  readHookStdin,
  shouldRequireSelfUtilRead,
  textHasD1OutcomeDocumented,
  tryEagerRecordVerdict
} from './read-audit-lib.mjs'

const PLACEMENT_SECTION = 'docs/agent-catalog/placement-decision.md §1.6 and §3'

function extractPath(input) {
  const toolInput = input.tool_input ?? input.arguments ?? input
  if (typeof toolInput === 'string') {
    try {
      const parsed = parseNestedJson(toolInput)
      return parsed?.path ?? parsed?.file_path ?? parsed?.target_notebook
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
      return parseNestedJson(toolInput) ?? {}
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
  return `Denied: Run \`agent-utils-reuse search "<keywords>"\` (D1: via cli) OR Grep \`${indexFile}\` (D1: grep-index) before adding local function helpers. Forbidden for Shortlist: Read/Grep utils-book/*.md. D2: Grep/SemanticSearch under utilsDir (via d2-utils-dir). Then output Discovery + Local helpers table + per-symbol Q1-Q4 in Confirm phase (same turn before Write). See ${PLACEMENT_SECTION} and utils-reuse-gate.mdc.`
}

function denyD1OutcomeMessage() {
  return `Denied: Document Discovery in chat — D1 candidates (sym @ path) OR \`D1 "<kw>": 0 candidates → D2: ...\`. Grep index ≡ CLI search. Page comments do not count. See ${PLACEMENT_SECTION}.`
}

function denyAgentsReadMessage(agentsFile) {
  return `Denied: Read \`${agentsFile}\` in full (no limit/offset) this session before Write. See workspace-agent-gate.mdc and AGENTS.md.`
}

function denyStaleVerdictMessage(staleSymbols) {
  const list = staleSymbols.map((s) => `\`${s}\``).join(', ')
  return `Denied: Prior Verdict does not cover util symbol(s) ${list} in this Write. Output Confirm + Verdict（最终） for the new symbol(s), then Write again. See ${PLACEMENT_SECTION}.`
}

function denySiblingQ4Message(missing) {
  const lines = missing.map(
    (m) => `\`${m.symbol}\` @ \`${m.path}\` — Q4 must mention sibling(s): ${m.siblings.map((s) => `\`${s}\``).join(', ')}`
  )
  return `Denied: Same-file multi-export — Q4 must reject or compare sibling export(s). ${lines.join('; ')}. See ${PLACEMENT_SECTION}.`
}

function denyLocalHelpersTableMessage() {
  return `Denied: Confirm phase must include a **Local helpers** table (or | Helper | / | 本地函数 | header) (header + at least one data row) with per-row Confirm (individual Q1-Q4) and Verdict（最终） in chat before Write (same assistant turn OK). See ${PLACEMENT_SECTION}.`
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

  if (isUtils && shouldRequireSelfUtilRead(normalized, config.utilsDir, cwd)) {
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
  if (config.hookMode === 'off' || config.hookMode === 'remind') {
    process.stdout.write(JSON.stringify({ permission: 'allow' }))
    return
  }
  process.stdout.write(
    JSON.stringify({
      permission: 'deny',
      agent_message: hookErrorDenyMessage(err?.message || String(err))
    })
  )
}

function gateNeedsVerdict(isRemind, isUtils, requiredReads, cwd) {
  return (
    isUtils ||
    requiredReads.size > 0 ||
    (isRemind && sessionHasUtilReads(cwd))
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

    if (config.hookMode === 'off' || config.hookMode === 'remind') {
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

    tryEagerRecordVerdict(input, cwd)

    if ((isRemind || isUtils) && !hasAgentsFileRead(cwd)) {
      process.stdout.write(
        JSON.stringify({
          permission: 'deny',
          denyReason: 'missing_agents_read',
          agent_message: denyAgentsReadMessage(config.agentsFile)
        })
      )
      return
    }

    const addsHelper = isRemind && patchAddsLocalHelper(payload, normalized) && !isUtils

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

      if (needsDiscoveryOutcomeInChat(cwd)) {
        const chatText = extractAssistantTextFromHookInput(input) || loadVerdictAudit(cwd).snippet || ''
        if (!textHasD1OutcomeDocumented(chatText)) {
          process.stdout.write(
            JSON.stringify({
              permission: 'deny',
              denyReason: 'd1_outcome_missing',
              agent_message: denyD1OutcomeMessage()
            })
          )
          return
        }
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

    if (isRemind && sessionHasUtilReads(cwd) && !hasVerdict(cwd)) {
      process.stdout.write(
        JSON.stringify({
          permission: 'deny',
          agent_message: denyVerdictMessage()
        })
      )
      return
    }

    const requiredSymbols = requiredSymbolsFromPatch(normalized, payload, config, cwd)

    if (requiredReads.size === 0 && !isUtils && requiredSymbols.length === 0) {
      process.stdout.write(JSON.stringify({ permission: 'allow' }))
      return
    }

    const missing = [...requiredReads].filter((p) => !hasRead(p, cwd))
    if (missing.length > 0) {
      process.stdout.write(
        JSON.stringify({
          permission: 'deny',
          denyReason: 'missing_reads',
          missingReads: missing,
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

    const staleSymbols = getStaleVerdictSymbols(requiredSymbols, cwd)
    if (staleSymbols.length > 0) {
      process.stdout.write(
        JSON.stringify({
          permission: 'deny',
          denyReason: 'verdict_stale_for_symbol',
          staleSymbols,
          agent_message: denyStaleVerdictMessage(staleSymbols)
        })
      )
      return
    }

    const verdictText =
      extractAssistantTextFromHookInput(input) || loadVerdictAudit(cwd).snippet || ''
    const siblingMissing = getMissingSiblingMentions(requiredSymbols, verdictText, cwd, config)
    if (siblingMissing.length > 0) {
      process.stdout.write(
        JSON.stringify({
          permission: 'deny',
          denyReason: 'sibling_q4_missing',
          siblingMissing,
          agent_message: denySiblingQ4Message(siblingMissing)
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
