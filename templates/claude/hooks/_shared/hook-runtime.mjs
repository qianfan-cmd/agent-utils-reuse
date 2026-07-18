/** Per-process hook runtime (cursor | claude | codex). Set before importing read-audit-lib. */

/** @type {'cursor'|'claude'|'codex'} */
let currentRuntime = 'cursor'

const AGENT_DIRS = {
  cursor: '.cursor',
  claude: '.claude',
  codex: '.codex'
}

/**
 * @param {'cursor'|'claude'|'codex'} runtime
 */
export function setHookRuntime(runtime) {
  if (!AGENT_DIRS[runtime]) {
    throw new Error(`Invalid hook runtime: ${runtime}`)
  }
  currentRuntime = runtime
}

export function getHookRuntime() {
  return currentRuntime
}

export function getAgentDir() {
  return AGENT_DIRS[currentRuntime] ?? '.cursor'
}

/**
 * @param {string} cwd
 * @param {string} filename
 */
export function auditFilePath(cwd, filename) {
  return `${getAgentDir()}/${filename}`.replace(/\\/g, '/')
}

/**
 * Unified gate response — Cursor uses full JSON; Claude/Codex map deny to exit 2.
 * @param {object} result
 */
export function emitGateResult(result) {
  if (currentRuntime === 'cursor') {
    emitJson(result)
    return
  }
  if (result?.permission === 'deny') {
    emitDeny(result.agent_message ?? result.permissionDecisionReason ?? 'Denied', result)
    return
  }
  const { permission, ...rest } = result ?? {}
  if (Object.keys(rest).length > 0) {
    emitJson({ ok: true, ...rest })
  }
  process.exitCode = 0
}

/**
 * @param {object} payload
 */
export function emitJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

/**
 * @param {object} [extra]
 */
export function emitAllow(extra = {}) {
  if (currentRuntime === 'cursor') {
    emitJson({ permission: 'allow', ...extra })
    return
  }
  if (Object.keys(extra).length > 0) {
    emitJson({ ok: true, ...extra })
  } else {
    process.exitCode = 0
  }
}

/**
 * @param {string} message
 * @param {object} [extra]
 */
export function emitDeny(message, extra = {}) {
  if (currentRuntime === 'cursor') {
    emitJson({
      permission: 'deny',
      agent_message: message,
      ...extra
    })
    return
  }

  const reason = message
  process.stderr.write(`${reason}\n`)
  if (currentRuntime === 'claude') {
    emitJson({
      hookEventName: extra.hookEventName ?? 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    })
  } else if (currentRuntime === 'codex') {
    emitJson({
      hookEventName: extra.hookEventName ?? 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    })
  }
  process.exit(2)
}

/**
 * @param {Error|string} err
 * @param {string} agentDir
 */
export function hookErrorDenyMessageForRuntime(err, agentDir) {
  const detail = err instanceof Error ? err.message : String(err ?? '')
  const base = `Gate hook error — fix ${agentDir}/hooks or re-run pnpm update:utils-reuse. Write blocked (fail-closed).`
  return detail ? `${base} (${detail})` : base
}

/**
 * Extract write path from hook input (Cursor / Claude / Codex shapes).
 * @param {object} input
 */
export function extractWritePath(input) {
  const toolInput = input?.tool_input ?? input?.arguments ?? input
  if (typeof toolInput === 'string') {
    try {
      const parsed = JSON.parse(toolInput)
      return (
        parsed?.path ??
        parsed?.file_path ??
        parsed?.target_notebook ??
        parsed?.filePath ??
        null
      )
    } catch {
      return null
    }
  }
  if (!toolInput || typeof toolInput !== 'object') return null
  return (
    toolInput.path ??
    toolInput.file_path ??
    toolInput.target_notebook ??
    toolInput.filePath ??
    null
  )
}

/**
 * @param {object} input
 */
export function extractWriteContent(input) {
  const toolInput = input?.tool_input ?? input?.arguments ?? input
  if (typeof toolInput === 'string') {
    try {
      return JSON.parse(toolInput) ?? {}
    } catch {
      return {}
    }
  }
  return toolInput ?? {}
}

/**
 * Extract assistant / agent text from Stop or afterAgentResponse payloads.
 * @param {object} input
 */
export function extractAssistantTextFromStopPayload(input) {
  if (!input || typeof input !== 'object') return ''
  const candidates = [
    input.text,
    input.response,
    input.assistant_message,
    input.message,
    input.content,
    input.transcript
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c
  }
  return ''
}
