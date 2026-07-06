#!/usr/bin/env node
import {
  countReuseSymbols,
  extractAssistantTextFromHookInput,
  getBulkRowViolations,
  getConfirmText,
  getMissingSiblingMentions,
  getVerdictCoverage,
  hasAgentsFileRead,
  hasDiscovery,
  hasLocalHelpersTableInVerdict,
  hasRead,
  hasVerdict,
  hookErrorDenyMessage,
  isPatchUiOnly,
  isUnderUtils,
  loadHookConfig,
  logHookError,
  markSameTurnBypass,
  matchesRemindPath,
  needsDiscoveryOutcomeInChat,
  normalizeAuditPath,
  parseHookJsonSafe,
  parseNestedJson,
  readHookStdin,
  sessionReadyForSameTurnBypass,
  shouldRequireSelfUtilRead,
  patchAddsLocalHelper,
  requiredSymbolsFromPatch,
  resolveContentUtilPaths,
  resolvePatchUtilPaths,
  resolveTargetUtilPaths,
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

function denyVerdictMessage(config) {
  const strict =
    config?.sameTurnAllow === false
      ? ' Strict mode (`sameTurnAllow: false`): split turns (Confirm first, Write next) or ensure preToolUse payload includes assistant text.'
      : ' Default sameTurnAllow allows same-turn Write when Reads + AGENTS are satisfied — Confirm must still be in chat before Write.'
  return `Denied: Read util / search / gen index do NOT complete the gate. Output substantive Confirm in chat **before** the first Write in this response: **individual Q1, Q2, Q3, Q4** (and Q5) per util and per Local helpers row — forbidden: "Q1-Q5 通过". Include Verdict（最终） with reuse/newUtil/featureLocal/partialReuse.${strict} Check .cursor/.utils-gate-verdict.json and .cursor/.utils-gate-hook-debug.log. See ${PLACEMENT_SECTION}.`
}

function remindSameTurnAllowMessage() {
  return `Reminder: same-turn Implement allowed (default sameTurnAllow). Confirm + Verdict must already be in chat before Write; Hook enforces Read util + AGENTS.md this session. See ${PLACEMENT_SECTION}.`
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

function denyStaleVerdictMessage(staleSymbols, alreadyCovered = []) {
  const list = staleSymbols.map((s) => `\`${s}\``).join(', ')
  const delta =
    alreadyCovered.length > 0
      ? ` Delta Confirm only — already covered: ${alreadyCovered.map((s) => `\`${s}\``).join(', ')}.`
      : ''
  return `Denied: Prior Verdict does not cover util symbol(s) ${list} in this Write. Output Confirm + Verdict（最终） for the new symbol(s) only (delta rows), then Write again.${delta} See ${PLACEMENT_SECTION}.`
}

function denySiblingQ4Message(missing) {
  const lines = missing.map(
    (m) => `\`${m.symbol}\` @ \`${m.path}\` — Q4 must mention sibling(s): ${m.siblings.map((s) => `\`${s}\``).join(', ')}`
  )
  return `Denied: Same-file multi-export — Q4 must reject or compare sibling export(s). ${lines.join('; ')}. See ${PLACEMENT_SECTION}.`
}

function denyBulkRowMessage(violations) {
  const lines = violations.map(
    (v) => `\`${v.symbol}\`: ${v.reason} (${v.denyReason})`
  )
  return `Denied: Bulk Confirm table row invalid — each reuse row needs Read @ path (session Read) and Q4 ≥ 8 chars. ${lines.join('; ')}. See ${PLACEMENT_SECTION}.`
}

function remindBatchConfirmMessage(count) {
  return `Reminder: Confirm lists ${count} reuse symbols (>5). Prefer splitting into batches (≤5 symbols per Confirm table + Write). See utils-reuse-gate.mdc.`
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
  const uiOnly = isPatchUiOnly(payload, normalized, config)

  if (isUtils && shouldRequireSelfUtilRead(normalized, config.utilsDir, cwd)) {
    requiredReads.add(normalized)
  }

  if (isRemind || isUtils) {
    const utilPaths = uiOnly
      ? resolvePatchUtilPaths(payload, config, cwd)
      : resolveTargetUtilPaths(normalized, payload, config, cwd)
    for (const p of utilPaths) {
      requiredReads.add(p)
    }
  }

  if (!uiOnly) {
    const patchContent = [payload.content, payload.new_string, payload.newString]
      .filter(Boolean)
      .join('\n')
    for (const p of resolveContentUtilPaths(patchContent, config, cwd)) {
      requiredReads.add(p)
    }
  }

  return { requiredReads, isRemind, isUtils, uiOnly }
}

function writeSameTurnBypassResponse(extra = {}) {
  markSameTurnBypass(process.cwd())
  process.stdout.write(
    JSON.stringify({
      permission: 'allow',
      sameTurnBypass: true,
      sessionVerdictRecorded: false,
      agent_message: remindSameTurnAllowMessage(),
      ...extra
    })
  )
}

function shouldEarlySameTurnBypass(config, cwd, { missing, isRemind, isUtils }) {
  if (config.sameTurnAllow !== true) return false
  if (!sessionReadyForSameTurnBypass(cwd)) return false
  if (hasVerdict(cwd)) return false
  if (missing.length > 0) return false
  if (!isRemind && !isUtils) return false
  return true
}

function failClosedWrite(config, cwd, err, context) {
  logHookError(cwd, context, err)
  if (config.hookMode === 'off' || config.hookMode === 'remind') {
    process.stdout.write(JSON.stringify({ permission: 'allow' }))
    return
  }
  if (config.sameTurnAllow === true && sessionReadyForSameTurnBypass(cwd)) {
    writeSameTurnBypassResponse({
      denyReason: 'parse_fallback',
      parseError: true,
      parsePartial: true
    })
    return
  }
  process.stdout.write(
    JSON.stringify({
      permission: 'deny',
      denyReason: 'parse_error',
      parseError: true,
      agent_message: hookErrorDenyMessage(err?.message || String(err))
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

    const { input, parseError, partial } = parseHookJsonSafe(raw)
    config = loadHookConfig(cwd)

    if (!input) {
      failClosedWrite(config, cwd, parseError ?? new Error('Hook JSON parse failed'), 'check-discovery-before-shared-write')
      return
    }

    const filePath = extractPath(input)
    if (!filePath) {
      process.stdout.write(JSON.stringify({ permission: 'allow' }))
      return
    }

    const normalized = normalizeAuditPath(filePath)
    const payload = extractWriteContent(input)
    const { requiredReads, isRemind, isUtils, uiOnly } = collectRequiredReads(
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

    const missing = [...requiredReads].filter((p) => !hasRead(p, cwd))

    if (isRemind && uiOnly && missing.length === 0) {
      process.stdout.write(JSON.stringify({ permission: 'allow', uiOnly: true }))
      return
    }

    if (shouldEarlySameTurnBypass(config, cwd, { missing, isRemind, isUtils })) {
      writeSameTurnBypassResponse(
        partial || parseError
          ? { parsePartial: true, denyReason: partial ? 'parse_partial' : undefined }
          : {}
      )
      return
    }

    const addsHelper =
      config.sameTurnAllow !== true &&
      isRemind &&
      patchAddsLocalHelper(payload, normalized) &&
      !isUtils

    if (addsHelper) {
      if (!hasDiscovery(cwd)) {
        process.stdout.write(
          JSON.stringify({
            permission: 'deny',
            denyReason: 'missing_discovery',
            agent_message: denyDiscoveryMessage(config)
          })
        )
        return
      }

      if (needsDiscoveryOutcomeInChat(cwd)) {
        const chatText = getConfirmText(cwd, extractAssistantTextFromHookInput(input))
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
            denyReason: 'verdict_not_recorded',
            agent_message: denyVerdictMessage(config)
          })
        )
        return
      }

      if (!hasLocalHelpersTableInVerdict(cwd)) {
        process.stdout.write(
          JSON.stringify({
            permission: 'deny',
            denyReason: 'local_helpers_table_missing',
            agent_message: denyLocalHelpersTableMessage()
          })
        )
        return
      }
    }

    const requiredSymbols = requiredSymbolsFromPatch(normalized, payload, config, cwd)

    if (requiredReads.size === 0 && !isUtils && requiredSymbols.length === 0) {
      process.stdout.write(JSON.stringify({ permission: 'allow' }))
      return
    }

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

    const coverage = getVerdictCoverage(requiredSymbols, cwd)
    const sessionCoversPatch =
      coverage.recorded === true &&
      coverage.needsConfirm.length === 0 &&
      requiredSymbols.length > 0

    const eagerText = extractAssistantTextFromHookInput(input) || ''
    const payloadHadAssistantText = Boolean(eagerText.trim())

    const sameTurnBypass =
      config.sameTurnAllow === true &&
      !hasVerdict(cwd) &&
      !sessionCoversPatch &&
      sessionReadyForSameTurnBypass(cwd) &&
      missing.length === 0 &&
      (isRemind || isUtils)

    if (sameTurnBypass) {
      writeSameTurnBypassResponse({
        payloadHadAssistantText,
        parsePartial: partial || Boolean(parseError)
      })
      return
    }

    if (!sessionCoversPatch && !hasVerdict(cwd)) {
      process.stdout.write(
        JSON.stringify({
          permission: 'deny',
          denyReason: 'verdict_not_recorded',
          sessionVerdictRecorded: false,
          payloadHadAssistantText,
          parseError: Boolean(parseError),
          agent_message: denyVerdictMessage(config)
        })
      )
      return
    }

    if (coverage.needsConfirm.length > 0) {
      process.stdout.write(
        JSON.stringify({
          permission: 'deny',
          denyReason: 'verdict_stale_for_symbol',
          staleSymbols: coverage.needsConfirm,
          needsConfirm: coverage.needsConfirm,
          alreadyCovered: coverage.alreadyCovered,
          agent_message: denyStaleVerdictMessage(coverage.needsConfirm, coverage.alreadyCovered)
        })
      )
      return
    }

    const confirmText = getConfirmText(cwd, eagerText)

    const bulkViolations = getBulkRowViolations(confirmText, cwd, config)
    if (bulkViolations.length > 0) {
      process.stdout.write(
        JSON.stringify({
          permission: 'deny',
          denyReason: bulkViolations[0].denyReason,
          bulkViolations,
          agent_message: denyBulkRowMessage(bulkViolations)
        })
      )
      return
    }

    const siblingMissing = getMissingSiblingMentions(requiredSymbols, confirmText, cwd, config)
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

    const reuseCount = countReuseSymbols(confirmText)
    const batchRemind = reuseCount > 5 ? remindBatchConfirmMessage(reuseCount) : null
    const baseRemind = isUtils || isRemind ? remindAppMessage() : null
    const agentMessage = [baseRemind, batchRemind].filter(Boolean).join(' ')

    process.stdout.write(
      JSON.stringify(
        agentMessage
          ? { permission: 'allow', agent_message: agentMessage }
          : { permission: 'allow' }
      )
    )
  } catch (err) {
    failClosedWrite(config, cwd, err, 'check-discovery-before-shared-write')
  }
}

main()
