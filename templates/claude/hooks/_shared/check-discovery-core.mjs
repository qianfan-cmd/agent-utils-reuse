#!/usr/bin/env node
import {
  buildSymbolConfirmChecklist,
  countReuseSymbols,
  discoverySatisfiesPreferCli,
  extractPathFromHookRaw,
  extractPartialHookMetadataFromRaw,
  extractAssistantTextFromHookInput,
  getBulkRowViolations,
  getConfirmText,
  getDiscoveryPathLabel,
  getMissingSiblingMentions,
  getVerdictCoverage,
  hasDiscovery,
  hasLocalHelpersTableInVerdict,
  hasRead,
  hasVerdict,
  hookErrorDenyMessage,
  isPatchUiOnly,
  isUnderUtils,
  loadDiscoveryAudit,
  loadHookConfig,
  logHookError,
  logHookGateDebug,
  markSameTurnBypass,
  matchesLightGatePath,
  matchesRemindPath,
  needsDiscoveryOutcomeInChat,
  normalizeAuditPath,
  parseHookJsonSafe,
  parseNestedJson,
  readHookStdin,
  satisfiesAgentsReadRequirement,
  shouldRequireSelfUtilRead,
  patchAddsLocalHelper,
  requiredSymbolsFromPatch,
  resolveContentUtilPaths,
  resolvePatchUtilPaths,
  resolveTargetUtilPaths,
  textHasD1OutcomeDocumented,
  tryEagerRecordVerdict,
  turnHasConfirmEvidence
} from './read-audit-lib.mjs'
import {
  emitGateResult,
  extractWriteContent,
  extractWritePath
} from './hook-runtime.mjs'

const PLACEMENT_SECTION = 'docs/agent-catalog/placement-decision.md §1.6 and §3'

function extractPath(input) {
  return extractWritePath(input)
}

function denyReadMessage(missingPaths) {
  const list = missingPaths.map((p) => `\`${p}\``).join(', ')
  return `Denied: Read util source (${list}) this session, output Confirm (Q1-Q5) + Verdict（最终） in chat, then Write again. WIP/existing import does NOT exempt. Do not write .utils-discovery-cache.json. See ${PLACEMENT_SECTION} and utils-reuse-gate.mdc.`
}

function denyVerdictMessage(config, symbols = []) {
  const checklist = buildSymbolConfirmChecklist(symbols, config)
  const strict =
    config?.sameTurnAllow === false
      ? ' Strict mode (`sameTurnAllow: false`): split turns (Confirm first, Write next).'
      : ' sameTurnAllow: Confirm text must appear in this turn chat BEFORE the first Write — Grep/Read/exploration alone do NOT satisfy the gate.'
  return `Denied: ${checklist} Exploration (Grep, Read util) ≠ Confirm — output Bulk table or Verdict（最终） in chat first.${strict} See ${PLACEMENT_SECTION}.`
}

function denyBatchLimitMessage(symbols, config) {
  const max = config.maxImportSymbolsPerTurn ?? 5
  const list = symbols.map((s) => `\`${s}\``).join(', ')
  return `Denied: Write adds ${symbols.length} @/utils symbols (limit ${max}/turn): ${list}. Split into batches (≤${max} per Bulk Confirm + Write) — see docs/maintainer/TEST-RUBRIC-WRITING.zh.md §8-symbol batch. See utils-reuse-gate.mdc.`
}

function remindSameTurnAllowMessage() {
  return `Reminder: same-turn Implement allowed — Confirm + Verdict detected in this turn. See ${PLACEMENT_SECTION}.`
}

function denyDiscoveryMessage(config) {
  const indexFile = config.utilsIndexFile || 'docs/agent-catalog/utils-index.json'
  return `Denied: Run \`agent-utils-reuse search "<keywords>"\` (D1: via cli) OR Grep \`${indexFile}\` (D1: grep-index) before adding local function helpers. Forbidden for Shortlist: Read/Grep utils-book/*.md. D2: Grep/SemanticSearch under utilsDir (via d2-utils-dir). Then output Discovery + Local helpers table + per-symbol Q1-Q4 in Confirm phase (same turn before Write). See ${PLACEMENT_SECTION} and utils-reuse-gate.mdc.`
}

function denyDiscoveryForUtilMessage(config) {
  const indexFile = config.utilsIndexFile || 'docs/agent-catalog/utils-index.json'
  return `Denied: @/utils Write requires Discovery this session — run \`agent-utils-reuse search "<keywords>"\` (D1 cli) OR Grep \`${indexFile}\` (D1 grep-index). D1.5: Grep feature paths under remindWritePaths counts when allowBusinessDiscovery. Document D1 outcome in Confirm chat before Write. See utils-reuse-gate.mdc.`
}

function denyPreferCliSearchMessage(config) {
  const d15 = config.allowBusinessDiscovery
    ? ', or D1.5 business-lookup on feature paths'
    : ''
  return `Denied: preferCliSearch — session Discovery must include agent-utils-reuse search (cli) or Grep utils-index.json (grep-index)${d15}. D2-only Grep utilsDir is not sufficient. See utils-reuse-gate.mdc.`
}

function denyD1OutcomeMessage(discoveryAudit = null, config = null) {
  const base =
    'Denied: Document Discovery in chat — D1 candidates (sym @ path) OR `D1 "<kw>": 0 candidates → D2: ...`. Grep index ≡ CLI search. Page comments do not count.'
  if (discoveryAudit?.recorded) {
    const via = Array.isArray(discoveryAudit.via) ? discoveryAudit.via.join(', ') : ''
    const d15 =
      config?.allowBusinessDiscovery && via.includes('business-lookup')
        ? ' Suggest: `D1.5: Grep <feature-path> "<kw>" → sym @ path`.'
        : ' Suggest: `D1 "kw": N → [sym @ path, …]` with siblings if any.'
    return `${base} Session already has Discovery (${via || 'recorded'}) — add the narrative line to Confirm chat.${d15} See ${PLACEMENT_SECTION}.`
  }
  return `${base} See ${PLACEMENT_SECTION}.`
}

function denyAgentsReadMessage(agentsFile) {
  return `Denied: Read \`${agentsFile}\` in full (no limit/offset) this session before Write. Or set \`agentsReadMode: "session"\` in .utils-bookrc.json. See workspace-agent-gate.mdc and AGENTS.md.`
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

function gateApplies({
  isUtils,
  requiredSymbols,
  requiredReads,
  isRemind,
  payload,
  normalized,
  isLightGate
}) {
  if (isUtils || requiredSymbols.length > 0 || requiredReads.size > 0) return true
  return (
    !isLightGate &&
    isRemind &&
    patchAddsLocalHelper(payload, normalized) &&
    !isUtils
  )
}

function failClosedWrite(config, cwd, err, context, raw = '') {
  logHookError(cwd, context, err)
  if (config.hookMode === 'off' || config.hookMode === 'remind') {
    emitGateResult({ permission: 'allow' })
    return
  }
  const pathFromRaw = extractPathFromHookRaw(raw)
  if (pathFromRaw) {
    logHookGateDebug(cwd, context, {
      parse_error_partial: true,
      path_from_raw: pathFromRaw,
      denyReason: 'parse_error_no_confirm_path_only'
    })
  }
  emitGateResult({
    permission: 'deny',
    denyReason: 'parse_error',
    parseError: true,
    pathExtracted: Boolean(pathFromRaw),
    agent_message: hookErrorDenyMessage(err?.message || String(err))
  })
}

async function main() {
  let config = loadHookConfig(process.cwd())
  const cwd = process.cwd()

  try {
    const raw = await readHookStdin()
    if (!raw.trim()) {
      emitGateResult({ permission: 'allow' })
      return
    }

    const { input: parsedInput, parseError, partial } = parseHookJsonSafe(raw)
    config = loadHookConfig(cwd)

    let input = parsedInput
    if (!input) {
      const pathFromRaw = extractPathFromHookRaw(raw)
      if (pathFromRaw) {
        input = {
          tool_input: { path: pathFromRaw },
          ...extractPartialHookMetadataFromRaw(raw)
        }
      } else {
        failClosedWrite(
          config,
          cwd,
          parseError ?? new Error('Hook JSON parse failed'),
          'check-discovery-before-shared-write',
          raw
        )
        return
      }
    }

    const hadVerdictBefore = hasVerdict(cwd)
    // Eager Confirm from payload / stdin / transcript before gate checks (v0.3.18)
    tryEagerRecordVerdict(input, cwd, 'preToolUse', raw)

    const filePath = extractPath(input)
    if (!filePath) {
      if (config.hookMode === 'confirm' && parseError) {
        failClosedWrite(
          config,
          cwd,
          parseError,
          'check-discovery-before-shared-write',
          raw
        )
        return
      }
      emitGateResult({ permission: 'allow' })
      return
    }

    const normalized = normalizeAuditPath(filePath)
    const payload = extractWriteContent(input)
    const isLightGate = matchesLightGatePath(normalized, config.lightGatePaths)
    const { requiredReads, isRemind, isUtils, uiOnly } = collectRequiredReads(
      normalized,
      payload,
      config,
      cwd
    )

    if (config.hookMode === 'off' || config.hookMode === 'remind') {
      if (isUtils) {
        emitGateResult({ permission: 'allow', agent_message: remindUtilsMessage() })
        return
      }
      if (isRemind) {
        emitGateResult({ permission: 'allow', agent_message: remindAppMessage() })
        return
      }
      emitGateResult({ permission: 'allow' })
      return
    }

    const requiredSymbols = requiredSymbolsFromPatch(normalized, payload, config, cwd)

    if (
      !gateApplies({
        isUtils,
        requiredSymbols,
        requiredReads,
        isRemind,
        payload,
        normalized,
        isLightGate
      })
    ) {
      emitGateResult({ permission: 'allow' })
      return
    }

    if ((isRemind || isUtils) && !satisfiesAgentsReadRequirement(cwd, config)) {
      emitGateResult({
          permission: 'deny',
          denyReason: 'missing_agents_read',
          agent_message: denyAgentsReadMessage(config.agentsFile)
        })
      return
    }

    const missing = [...requiredReads].filter((p) => !hasRead(p, cwd))
    const maxPerTurn = config.maxImportSymbolsPerTurn ?? 5

    if (config.strictBatchLimit && requiredSymbols.length > maxPerTurn) {
      emitGateResult({
          permission: 'deny',
          denyReason: 'batch_limit_exceeded',
          requiredSymbols,
          agent_message: denyBatchLimitMessage(requiredSymbols, config)
        })
      return
    }

    if (config.requireDiscoveryForUtilGate && requiredSymbols.length > 0) {
      const discoveryAudit = loadDiscoveryAudit(cwd)
      if (!discoveryAudit.recorded) {
        emitGateResult({
            permission: 'deny',
            denyReason: 'missing_discovery_for_util',
            agent_message: denyDiscoveryForUtilMessage(config)
          })
        return
      }
      if (!discoverySatisfiesPreferCli(config, discoveryAudit)) {
        emitGateResult({
            permission: 'deny',
            denyReason: 'prefer_cli_search',
            discoveryVia: discoveryAudit.via,
            agent_message: denyPreferCliSearchMessage(config)
          })
        return
      }
      const utilGateConfirm = getConfirmText(cwd, extractAssistantTextFromHookInput(input))
      if (!textHasD1OutcomeDocumented(utilGateConfirm)) {
        emitGateResult({
            permission: 'deny',
            denyReason: 'd1_outcome_missing',
            agent_message: denyD1OutcomeMessage(discoveryAudit, config)
          })
        return
      }
    }

    if (isRemind && uiOnly && missing.length === 0) {
      emitGateResult({ permission: 'allow', uiOnly: true })
      return
    }

    const addsHelper =
      !isLightGate &&
      isRemind &&
      patchAddsLocalHelper(payload, normalized) &&
      !isUtils

    if (addsHelper) {
      if (!hasDiscovery(cwd)) {
        emitGateResult({
            permission: 'deny',
            denyReason: 'missing_discovery',
            agent_message: denyDiscoveryMessage(config)
          })
        return
      }

      if (needsDiscoveryOutcomeInChat(cwd)) {
        const chatText = getConfirmText(cwd, extractAssistantTextFromHookInput(input))
        if (!textHasD1OutcomeDocumented(chatText)) {
          emitGateResult({
              permission: 'deny',
              denyReason: 'd1_outcome_missing',
              agent_message: denyD1OutcomeMessage(loadDiscoveryAudit(cwd), config)
            })
          return
        }
      }

      const helperConfirm = turnHasConfirmEvidence(input, raw, cwd)
      if (!helperConfirm.ok) {
        emitGateResult({
            permission: 'deny',
            denyReason: 'verdict_not_recorded',
            agent_message: denyVerdictMessage(config, requiredSymbols)
          })
        return
      }

      if (!hasLocalHelpersTableInVerdict(cwd)) {
        const confirmText = getConfirmText(cwd, helperConfirm.text)
        if (!confirmText.includes('Local helpers') && !/\|\s*本地函数\s*\|/.test(confirmText) && !/\|\s*Helper\s*\|/i.test(confirmText)) {
          emitGateResult({
              permission: 'deny',
              denyReason: 'local_helpers_table_missing',
              agent_message: denyLocalHelpersTableMessage()
            })
          return
        }
      }
    }

    if (missing.length > 0) {
      emitGateResult({
          permission: 'deny',
          denyReason: 'missing_reads',
          missingReads: missing,
          agent_message: denyReadMessage(missing)
        })
      return
    }

    const coverage = getVerdictCoverage(requiredSymbols, cwd)
    const confirmEvidence = turnHasConfirmEvidence(input, raw, cwd)

    if (
      requiredSymbols.length > maxPerTurn &&
      (coverage.needsConfirm.length > 0 || !confirmEvidence.ok)
    ) {
      emitGateResult({
          permission: 'deny',
          denyReason: 'batch_limit_exceeded',
          requiredSymbols,
          needsConfirm: coverage.needsConfirm.length > 0 ? coverage.needsConfirm : requiredSymbols,
          agent_message: denyBatchLimitMessage(requiredSymbols, config)
        })
      return
    }

    logHookGateDebug(cwd, 'preToolUse', {
      discovery_path: getDiscoveryPathLabel(cwd),
      parse_partial: partial || Boolean(parseError),
      confirm_source: confirmEvidence.source,
      verdict_source: confirmEvidence.source,
      required_symbols: requiredSymbols,
      needs_confirm: coverage.needsConfirm
    })

    if (!confirmEvidence.ok) {
      const eagerText = extractAssistantTextFromHookInput(input) || ''
      emitGateResult({
          permission: 'deny',
          denyReason: 'verdict_not_recorded',
          sessionVerdictRecorded: false,
          payloadHadAssistantText: Boolean(eagerText.trim()),
          parseError: Boolean(parseError),
          needsConfirm: requiredSymbols.length > 0 ? requiredSymbols : coverage.needsConfirm,
          agent_message: denyVerdictMessage(config, requiredSymbols.length > 0 ? requiredSymbols : coverage.needsConfirm)
        })
      return
    }

    if (coverage.needsConfirm.length > 0) {
      emitGateResult({
          permission: 'deny',
          denyReason: 'verdict_stale_for_symbol',
          staleSymbols: coverage.needsConfirm,
          needsConfirm: coverage.needsConfirm,
          alreadyCovered: coverage.alreadyCovered,
          agent_message: denyStaleVerdictMessage(coverage.needsConfirm, coverage.alreadyCovered)
        })
      return
    }

    const eagerText = extractAssistantTextFromHookInput(input) || confirmEvidence.text || ''
    const confirmText = getConfirmText(cwd, eagerText)

    const bulkViolations = getBulkRowViolations(confirmText, cwd, config)
    if (bulkViolations.length > 0) {
      emitGateResult({
          permission: 'deny',
          denyReason: bulkViolations[0].denyReason,
          bulkViolations,
          agent_message: denyBulkRowMessage(bulkViolations)
        })
      return
    }

    const siblingMissing = getMissingSiblingMentions(requiredSymbols, confirmText, cwd, config)
    if (siblingMissing.length > 0) {
      emitGateResult({
          permission: 'deny',
          denyReason: 'sibling_q4_missing',
          siblingMissing,
          agent_message: denySiblingQ4Message(siblingMissing)
        })
      return
    }

    const reuseCount = countReuseSymbols(confirmText)
    const batchRemind = reuseCount > 5 ? remindBatchConfirmMessage(reuseCount) : null
    const baseRemind = isUtils || isRemind ? remindAppMessage() : null
    const sameTurnOk =
      config.sameTurnAllow === true &&
      !hadVerdictBefore &&
      confirmEvidence.ok &&
      (confirmEvidence.source === 'turn_text' ||
        confirmEvidence.source === 'transcript' ||
        confirmEvidence.source === 'payload' ||
        hasVerdict(cwd))
    if (sameTurnOk) markSameTurnBypass(cwd)

    const agentMessage = [
      sameTurnOk ? remindSameTurnAllowMessage() : null,
      baseRemind,
      batchRemind
    ]
      .filter(Boolean)
      .join(' ')

    emitGateResult(
        agentMessage || sameTurnOk
          ? {
              permission: 'allow',
              sameTurnBypass: sameTurnOk || undefined,
              confirmSource: confirmEvidence.source,
              verdict_source: confirmEvidence.source,
              agent_message: agentMessage || remindSameTurnAllowMessage()
            }
          : {
              permission: 'allow',
              confirmSource: confirmEvidence.source,
              verdict_source: confirmEvidence.source
            }
    )

  } catch (err) {
    failClosedWrite(config, cwd, err, 'check-discovery-before-shared-write')
  }
}

main()
