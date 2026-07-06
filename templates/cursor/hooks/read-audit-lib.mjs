#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

export const CONFIG_FILENAME = '.utils-bookrc.json'
export const AUDIT_FILENAME = '.utils-gate-reads.json'
export const VERDICT_AUDIT_FILENAME = '.utils-gate-verdict.json'
export const DISCOVERY_AUDIT_FILENAME = '.utils-gate-discovery.json'
export const AGENTS_READ_AUDIT_FILENAME = '.utils-gate-agents-read.json'
export const HOOK_ERROR_LOG = '.utils-gate-hook-error.log'
export const HOOK_DEBUG_LOG = '.utils-gate-hook-debug.log'

const DEFAULT_UTILS_DIR = 'src/utils'
const DEFAULT_AGENTS_FILE = 'AGENTS.md'
const DEFAULT_UTILS_BOOK_DIR = 'docs/agent-catalog/utils-book'
const DEFAULT_UTILS_INDEX_FILE = 'docs/agent-catalog/utils-index.json'
const DEFAULT_ALIASES = ['@/utils']
const DEFAULT_REMIND_PATHS = ['src/feature', 'src/components', 'src/hooks', 'src/views']

const DEFAULT_MAX_IMPORT_SYMBOLS_PER_TURN = 5
const PARSE_HOOK_LARGE_STDIN_BYTES = 16384

/** Mirrors lib/load-config.mjs resolveConfirmGateFlags for hook runtime. */
function resolveConfirmGateFlags(raw, hookMode) {
  const isConfirm = hookMode === 'confirm'
  const tri = (key, confirmDefault) => {
    if (raw[key] === true) return true
    if (raw[key] === false) return false
    return confirmDefault
  }
  return {
    requireDiscoveryForUtilGate: tri('requireDiscoveryForUtilGate', isConfirm),
    preferCliSearch: tri('preferCliSearch', isConfirm),
    strictBatchLimit: tri('strictBatchLimit', isConfirm),
    allowBusinessDiscovery: tri('allowBusinessDiscovery', true)
  }
}

function resolveTranscriptAbsolutePath(transcriptPath, input, cwd) {
  const p = String(transcriptPath ?? '').trim()
  if (!p) return null
  const normalized = p.replace(/\\/g, '/')
  if (path.isAbsolute(normalized)) return normalized
  const roots = input?.workspace_roots ?? input?.workspaceRoots
  const base =
    Array.isArray(roots) && roots[0] ? path.resolve(String(roots[0])) : path.resolve(cwd)
  return path.resolve(base, normalized)
}

function messageMatchesGeneration(msg, generationId) {
  if (!generationId) return true
  const gid = String(generationId)
  const candidates = [
    msg?.generation_id,
    msg?.generationId,
    msg?.generation,
    msg?.id
  ].filter(Boolean)
  return candidates.some((c) => String(c) === gid)
}

function extractAssistantFromTranscriptContent(content, generationId = null) {
  if (!content || typeof content !== 'string') return ''
  const trimmed = content.trim()
  if (!trimmed) return ''

  const assistantMessages = []

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      const lists = []
      if (Array.isArray(parsed)) lists.push(...parsed)
      else if (Array.isArray(parsed.messages)) lists.push(...parsed.messages)
      else if (Array.isArray(parsed.conversation)) lists.push(...parsed.conversation)
      else if (Array.isArray(parsed.transcript)) lists.push(...parsed.transcript)
      for (const msg of lists) {
        if (!msg || typeof msg !== 'object') continue
        const role = String(msg.role ?? msg.type ?? '').toLowerCase()
        if (role !== 'assistant' && role !== 'agent') continue
        if (!messageMatchesGeneration(msg, generationId)) continue
        const s = messageContentToString(msg.content ?? msg.text ?? msg.message)
        if (s.trim()) assistantMessages.push(s)
      }
    } catch {
      /* fall through to JSONL */
    }
  }

  if (assistantMessages.length === 0) {
    for (const line of trimmed.split('\n')) {
      const row = line.trim()
      if (!row) continue
      try {
        const msg = JSON.parse(row)
        if (!msg || typeof msg !== 'object') continue
        const role = String(msg.role ?? msg.type ?? '').toLowerCase()
        if (role !== 'assistant' && role !== 'agent') continue
        if (!messageMatchesGeneration(msg, generationId)) continue
        const s = messageContentToString(msg.content ?? msg.text ?? msg.message)
        if (s.trim()) assistantMessages.push(s)
      } catch {
        /* skip bad line */
      }
    }
  }

  if (assistantMessages.length === 0) return ''
  return assistantMessages[assistantMessages.length - 1]
}

/** Read assistant Confirm text from Cursor transcript_path (v0.3.18). */
export function readAssistantTextFromTranscript(input, cwd = process.cwd()) {
  if (!input || typeof input !== 'object') return ''
  const transcriptPath = input.transcript_path ?? input.transcriptPath
  if (!transcriptPath) return ''

  const abs = resolveTranscriptAbsolutePath(transcriptPath, input, cwd)
  if (!abs || !fs.existsSync(abs)) {
    logHookGateDebug(cwd, 'transcript_read_failed', {
      reason: 'missing_file',
      transcript_path: String(transcriptPath)
    })
    return ''
  }

  try {
    const content = fs.readFileSync(abs, 'utf8')
    const generationId = input.generation_id ?? input.generationId ?? null
    const text = extractAssistantFromTranscriptContent(content, generationId)
    if (!text.trim()) {
      logHookGateDebug(cwd, 'transcript_read_failed', {
        reason: 'no_assistant_message',
        transcript_path: String(transcriptPath)
      })
    }
    return text
  } catch (err) {
    logHookGateDebug(cwd, 'transcript_read_failed', {
      reason: err instanceof Error ? err.message : String(err),
      transcript_path: String(transcriptPath)
    })
    return ''
  }
}

/** Metadata from broken hook stdin (transcript_path, generation_id). */
export function extractPartialHookMetadataFromRaw(raw) {
  return extractPartialHookMetadata(stripUtf8Bom(String(raw ?? '').trim()))
}

function extractPartialHookMetadata(trimmed) {
  const meta = {}
  const transcriptMatch = trimmed.match(/"transcript_path"\s*:\s*"((?:\\.|[^"\\])*)"/)
  if (transcriptMatch) {
    try {
      meta.transcript_path = JSON.parse(`"${transcriptMatch[1]}"`)
    } catch {
      meta.transcript_path = transcriptMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    }
  }
  const genMatch = trimmed.match(/"generation_id"\s*:\s*"((?:\\.|[^"\\])*)"/)
  if (genMatch) {
    try {
      meta.generation_id = JSON.parse(`"${genMatch[1]}"`)
    } catch {
      meta.generation_id = genMatch[1]
    }
  }
  const toolNameMatch = trimmed.match(/"tool_name"\s*:\s*"((?:\\.|[^"\\])*)"/)
  if (toolNameMatch) {
    try {
      meta.tool_name = JSON.parse(`"${toolNameMatch[1]}"`)
    } catch {
      meta.tool_name = toolNameMatch[1]
    }
  }
  return meta
}

/** Extract file path from broken hook stdin when full JSON parse fails. */
export function extractPathFromHookRaw(raw) {
  const trimmed = stripUtf8Bom(String(raw ?? '').trim())
  if (!trimmed) return null
  const pathMatch = trimmed.match(
    /"(?:path|file_path|target_notebook)"\s*:\s*"((?:\\.|[^"\\])*)"/
  )
  if (!pathMatch) return null
  try {
    return JSON.parse(`"${pathMatch[1]}"`)
  } catch {
    return pathMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
}

/**
 * Unified Confirm text for preToolUse gate (v0.3.18).
 * @returns {{ text: string, source: 'payload'|'transcript'|'none' }}
 */
export function extractConfirmTextForGate(input, raw, cwd = process.cwd()) {
  const fromPayload = extractAssistantTextFromHookInput(input)?.trim()
  if (fromPayload && textHasSubstantiveConfirm(fromPayload)) {
    return { text: fromPayload, source: 'payload' }
  }
  const fromRaw = extractTextFromRawHookStdin(raw)?.trim()
  if (fromRaw && textHasSubstantiveConfirm(fromRaw)) {
    return { text: fromRaw, source: 'payload' }
  }
  const fromTranscript = readAssistantTextFromTranscript(input, cwd)?.trim()
  if (fromTranscript && textHasSubstantiveConfirm(fromTranscript)) {
    return { text: fromTranscript, source: 'transcript' }
  }
  return { text: fromPayload || fromRaw || fromTranscript || '', source: 'none' }
}

export function loadHookConfig(cwd = process.cwd()) {
  const base = {
    utilsDir: DEFAULT_UTILS_DIR,
    utilsBookDir: DEFAULT_UTILS_BOOK_DIR,
    utilsIndexFile: DEFAULT_UTILS_INDEX_FILE,
    utilsImportAliases: [...DEFAULT_ALIASES],
    remindWritePaths: [...DEFAULT_REMIND_PATHS],
    lightGatePaths: [],
    agentsFile: DEFAULT_AGENTS_FILE,
    agentsReadMode: 'tool',
    hookMode: 'off',
    sameTurnAllow: true,
    maxImportSymbolsPerTurn: DEFAULT_MAX_IMPORT_SYMBOLS_PER_TURN,
    requireDiscoveryForUtilGate: false,
    preferCliSearch: false,
    strictBatchLimit: false,
    allowBusinessDiscovery: true
  }
  try {
    const configPath = path.join(cwd, CONFIG_FILENAME)
    if (!fs.existsSync(configPath)) return base
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    if (raw.utilsDir) base.utilsDir = String(raw.utilsDir).replace(/\\/g, '/')
    if (raw.utilsBookDir) base.utilsBookDir = String(raw.utilsBookDir).replace(/\\/g, '/')
    if (raw.utilsIndexFile) base.utilsIndexFile = String(raw.utilsIndexFile).replace(/\\/g, '/')
    if (Array.isArray(raw.utilsImportAliases)) {
      base.utilsImportAliases = raw.utilsImportAliases.map((a) => String(a).replace(/\\/g, '/'))
    }
    if (Array.isArray(raw.remindWritePaths)) {
      base.remindWritePaths = raw.remindWritePaths.map((p) =>
        String(p).replace(/\\/g, '/').replace(/\/+$/, '')
      )
    }
    if (raw.agentsFile) base.agentsFile = String(raw.agentsFile).replace(/\\/g, '/')
    if (raw.hookMode) {
      const mode = String(raw.hookMode).toLowerCase()
      if (mode === 'remind') base.hookMode = 'remind'
      else if (mode === 'confirm') base.hookMode = 'confirm'
      else base.hookMode = 'off'
    }
    if (raw.sameTurnAllow === false) base.sameTurnAllow = false
    if (Array.isArray(raw.lightGatePaths)) {
      base.lightGatePaths = raw.lightGatePaths.map((p) =>
        String(p).replace(/\\/g, '/').replace(/\/+$/, '')
      )
    }
    const agentsMode = String(raw.agentsReadMode ?? 'tool').toLowerCase()
    if (agentsMode === 'session') base.agentsReadMode = 'session'
    const maxSym = parseInt(raw.maxImportSymbolsPerTurn, 10)
    if (Number.isFinite(maxSym) && maxSym > 0) {
      base.maxImportSymbolsPerTurn = maxSym
    }
    const gateFlags = resolveConfirmGateFlags(raw, base.hookMode)
    base.requireDiscoveryForUtilGate = gateFlags.requireDiscoveryForUtilGate
    base.preferCliSearch = gateFlags.preferCliSearch
    base.strictBatchLimit = gateFlags.strictBatchLimit
    base.allowBusinessDiscovery = gateFlags.allowBusinessDiscovery
  } catch {
    /* defaults */
  }
  return base
}

export function auditPath(cwd = process.cwd()) {
  return path.join(cwd, '.cursor', AUDIT_FILENAME)
}

export function loadAudit(cwd = process.cwd()) {
  const filePath = auditPath(cwd)
  if (!fs.existsSync(filePath)) return { reads: [] }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const reads = Array.isArray(raw.reads) ? raw.reads.map(normalizeAuditPath) : []
    return { reads: [...new Set(reads)] }
  } catch {
    return { reads: [] }
  }
}

export function saveAudit(data, cwd = process.cwd()) {
  const filePath = auditPath(cwd)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

export function resetAudit(cwd = process.cwd()) {
  saveAudit({ reads: [] }, cwd)
}

export function logHookError(cwd, context, err) {
  try {
    const filePath = path.join(cwd, '.cursor', HOOK_ERROR_LOG)
    const msg = err instanceof Error ? err.message : String(err ?? 'unknown')
    const line = `[${new Date().toISOString()}] ${context}: ${msg}\n`
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.appendFileSync(filePath, line)
  } catch {
    /* ignore log failures */
  }
}

export function sessionHasUtilReads(cwd = process.cwd()) {
  return loadAudit(cwd).reads.length > 0
}

export function hookErrorDenyMessage(detail) {
  const base =
    'Gate hook error — fix .cursor/hooks or re-run pnpm update:utils-reuse. Write blocked (fail-closed).'
  return detail ? `${base} (${detail})` : base
}

/** Strip UTF-8 BOM bytes before UTF-8 decode. */
export function stripBomBuffer(buf) {
  if (!buf || buf.length === 0) return buf
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3)
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.subarray(2)
  }
  return buf
}

/** Strip UTF-8 BOM char after string decode. */
export function stripUtf8Bom(s) {
  if (!s || typeof s !== 'string') return ''
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

export async function readHookStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const buf = stripBomBuffer(Buffer.concat(chunks))
  return stripUtf8Bom(buf.toString('utf8'))
}

export function parseNestedJson(str) {
  const trimmed = stripUtf8Bom(String(str ?? '').trim())
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch (err) {
    throw new Error(`Hook JSON parse failed: ${err.message}`)
  }
}

export function parseHookJson(raw) {
  const trimmed = stripUtf8Bom(String(raw ?? '').trim())
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch (err) {
    throw new Error(`Hook JSON parse failed: ${err.message}`)
  }
}

/** Extract a JSON object value for `key` using brace counting (tolerates broken outer JSON). */
function extractJsonObjectAtKey(raw, key) {
  const re = new RegExp(`"${key}"\\s*:\\s*`, 'i')
  const match = re.exec(raw)
  if (!match) return null
  let i = match.index + match[0].length
  while (i < raw.length && /\s/.test(raw[i])) i += 1
  if (raw[i] !== '{') return null
  let depth = 0
  let inString = false
  let escape = false
  const start = i
  for (; i < raw.length; i += 1) {
    const c = raw[i]
    if (escape) {
      escape = false
      continue
    }
    if (inString && c === '\\') {
      escape = true
      continue
    }
    if (c === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(raw.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/** Extract a JSON string field value (handles \\n, \\u, etc.). */
function extractJsonStringField(raw, key) {
  const re = new RegExp(`"${key}"\\s*:\\s*"`, 'i')
  const match = re.exec(raw)
  if (!match) return null
  let i = match.index + match[0].length
  let out = ''
  let escape = false
  for (; i < raw.length; i += 1) {
    const c = raw[i]
    if (escape) {
      if (c === 'n') out += '\n'
      else if (c === 't') out += '\t'
      else if (c === 'r') out += '\r'
      else if (c === 'u' && i + 4 < raw.length) {
        const hex = raw.slice(i + 1, i + 5)
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16))
          i += 4
        } else out += c
      } else out += c
      escape = false
      continue
    }
    if (c === '\\') {
      escape = true
      continue
    }
    if (c === '"') return out
    out += c
  }
  return out.length > 0 ? out : null
}

/** Extract a JSON array value for `key` using bracket counting (tolerates broken outer JSON). */
function extractJsonArrayAtKey(raw, key) {
  const re = new RegExp(`"${key}"\\s*:\\s*`, 'i')
  const match = re.exec(raw)
  if (!match) return null
  let i = match.index + match[0].length
  while (i < raw.length && /\s/.test(raw[i])) i += 1
  if (raw[i] !== '[') return null
  let depth = 0
  let inString = false
  let escape = false
  const start = i
  for (; i < raw.length; i += 1) {
    const c = raw[i]
    if (escape) {
      escape = false
      continue
    }
    if (inString && c === '\\') {
      escape = true
      continue
    }
    if (c === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (c === '[') depth += 1
    else if (c === ']') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(raw.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/**
 * Parse hook stdin; on failure extract path / tool_input / text for graceful gate (v0.3.16+).
 * @returns {{ input: object|null, parseError: Error|null, partial: boolean }}
 */
export function parseHookJsonSafe(raw) {
  const trimmed = stripUtf8Bom(String(raw ?? '').trim())
  if (!trimmed) return { input: null, parseError: null, partial: false }
  try {
    return { input: JSON.parse(trimmed), parseError: null, partial: false }
  } catch (err) {
    const input = {}
    const pathMatch = trimmed.match(
      /"(?:path|file_path|target_notebook)"\s*:\s*"((?:\\.|[^"\\])*)"/
    )
    if (pathMatch) {
      try {
        const p = JSON.parse(`"${pathMatch[1]}"`)
        input.tool_input = { path: p }
      } catch {
        input.tool_input = {
          path: pathMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
        }
      }
    }
    const skipHeavyToolInput = trimmed.length > PARSE_HOOK_LARGE_STDIN_BYTES
    if (!skipHeavyToolInput) {
      const toolInput = extractJsonObjectAtKey(trimmed, 'tool_input')
      if (toolInput && typeof toolInput === 'object') {
        input.tool_input = { ...(input.tool_input ?? {}), ...toolInput }
      }
    }
    Object.assign(input, extractPartialHookMetadata(trimmed))
    const text = extractJsonStringField(trimmed, 'text')
    if (text != null) input.text = text
    if (!input.text?.trim()) {
      const assistant = extractLastAssistantFromRawJson(trimmed)
      if (assistant.trim()) input.text = assistant
    }
    if (Object.keys(input).length === 0) {
      return { input: null, parseError: err, partial: true }
    }
    return { input, parseError: err, partial: true }
  }
}

/** Extract assistant Confirm text from raw hook stdin when outer JSON is broken (v0.3.16+). */
export function extractTextFromRawHookStdin(raw) {
  const trimmed = stripUtf8Bom(String(raw ?? '').trim())
  if (!trimmed) return ''
  for (const key of ['text', 'response', 'content', 'assistant_message', 'agent_message']) {
    const s = extractJsonStringField(trimmed, key)
    if (s?.trim()) return s
  }
  return extractLastAssistantFromRawJson(trimmed)
}

/** Whether AGENTS.md read requirement is satisfied for this session. */
export function satisfiesAgentsReadRequirement(cwd = process.cwd(), config = loadHookConfig(cwd)) {
  if (config.agentsReadMode === 'session') return hasAgentsFileRead(cwd)
  return hasAgentsFileRead(cwd)
}

/** Light gate: only audit @/utils imports, skip Local helpers chain. */
export function matchesLightGatePath(filePath, lightGatePaths) {
  if (!Array.isArray(lightGatePaths) || lightGatePaths.length === 0) return false
  const normalized = normalizeAuditPath(filePath)
  return lightGatePaths.some((prefix) => {
    const p = String(prefix).replace(/\\/g, '/').replace(/\/+$/, '')
    return normalized === p || normalized.startsWith(`${p}/`)
  })
}

/** Discovery path label for debug logs (v0.3.17). */
export function getDiscoveryPathLabel(cwd = process.cwd()) {
  const audit = loadDiscoveryAudit(cwd)
  if (!audit.recorded) return 'none'
  if (audit.via.includes('business-lookup')) return 'business-lookup'
  if (audit.d1 && audit.d2) return 'D1+D2'
  if (audit.d1) {
    if (audit.via.includes('cli')) return 'cli'
    return 'grep-index'
  }
  if (audit.d2) return 'D2_only'
  return audit.via[0] ?? 'none'
}

/** Whether session Discovery satisfies preferCliSearch when enabled. */
export function discoverySatisfiesPreferCli(config, audit) {
  if (!config?.preferCliSearch) return true
  const via = audit?.via ?? []
  if (via.includes('cli') || via.includes('grep-index')) return true
  if (config.allowBusinessDiscovery && via.includes('business-lookup')) return true
  return false
}

export function logHookGateDebug(cwd, context, meta = {}) {
  try {
    const filePath = path.join(cwd, '.cursor', HOOK_DEBUG_LOG)
    const line = `[${new Date().toISOString()}] ${context} ${JSON.stringify(meta)}\n`
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.appendFileSync(filePath, line)
  } catch {
    /* ignore */
  }
}

/**
 * Same-turn Confirm evidence: session verdict record or substantive text in this turn (v0.3.18).
 * @returns {{ ok: boolean, source: 'session'|'payload'|'transcript'|'turn_text'|'none', text: string }}
 */
export function turnHasConfirmEvidence(input, raw, cwd = process.cwd()) {
  const config = loadHookConfig(cwd)
  if (hasVerdict(cwd)) {
    const audit = loadVerdictAudit(cwd)
    return {
      ok: true,
      source: audit.verdictSource ?? 'session',
      text: audit.confirmText ?? audit.snippet ?? ''
    }
  }
  if (config.sameTurnAllow === false) {
    return { ok: false, source: 'none', text: '' }
  }
  const { text, source } = extractConfirmTextForGate(input, raw, cwd)
  if (textHasSubstantiveConfirm(text)) {
    return {
      ok: true,
      source: source === 'none' ? 'turn_text' : source,
      text
    }
  }
  return { ok: false, source: 'none', text }
}

/** Import-driven deny checklist for missing Confirm (v0.3.17). */
export function buildSymbolConfirmChecklist(symbols, config = loadHookConfig()) {
  const list = (symbols ?? []).map((s) => `\`${s}\``).join(', ')
  const max = config.maxImportSymbolsPerTurn ?? DEFAULT_MAX_IMPORT_SYMBOLS_PER_TURN
  if (!list) {
    return `Denied: Output substantive Confirm in chat before Write: Bulk table or per-symbol Q1–Q4 + Verdict（最终） (≤${max} symbol/批).`
  }
  return `Denied: 本次 Write 涉及 @/utils import: ${list}.\n请先在同轮 chat 输出 Bulk Confirm 表（≤${max} symbol/批）：\n| Symbol | Read @ path | Q4（替换 + sibling 拒选） | Verdict |\n然后重试 Write。`
}

/** AGENTS read + at least one util Read recorded this session. */
export function sessionReadyForSameTurnBypass(cwd = process.cwd()) {
  const config = loadHookConfig(cwd)
  if (!satisfiesAgentsReadRequirement(cwd, config)) return false
  return loadAudit(cwd).reads.length > 0
}

export function logHookPayloadKeys(input, cwd = process.cwd(), context = 'hook') {
  try {
    if (!input || typeof input !== 'object') return
    const keys = Object.keys(input).sort().join(', ')
    const filePath = path.join(cwd, '.cursor', HOOK_DEBUG_LOG)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.appendFileSync(
      filePath,
      `[${new Date().toISOString()}] ${context} payload keys: ${keys || '(empty)'}\n`
    )
  } catch {
    /* ignore */
  }
}

function messageContentToString(content) {
  if (content == null) return ""
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part
      if (part && typeof part === "object") return part.text ?? part.content ?? ""
      return ""
    }).filter(Boolean).join("\n")
  }
  if (typeof content === "object") return content.text ?? content.content ?? ""
  return String(content)
}

function lastAssistantTextFromMessageList(list) {
  if (!Array.isArray(list)) return ''
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const msg = list[i]
    if (!msg || typeof msg !== 'object') continue
    const role = String(msg.role ?? msg.type ?? '').toLowerCase()
    if (role !== 'assistant' && role !== 'agent') continue
    const s = messageContentToString(msg.content ?? msg.text ?? msg.message)
    if (s.trim()) return s
  }
  return ''
}

export function extractLastAssistantFromRawJson(raw) {
  const trimmed = stripUtf8Bom(String(raw ?? '').trim())
  if (!trimmed) return ''
  for (const key of ['conversation', 'messages', 'transcript', 'turn_content']) {
    const arr = extractJsonArrayAtKey(trimmed, key)
    const s = lastAssistantTextFromMessageList(arr)
    if (s.trim()) return s
  }
  return ''
}

export function extractAssistantTextFromHookInput(input) {
  if (!input || typeof input !== "object") return ""
  for (const key of [
    "text",
    "response",
    "content",
    "agent_message",
    "assistant_message",
    "assistant_message_text",
    "assistantMessage",
    "last_assistant_message",
    "lastAssistantMessage",
    "assistant_visible_message",
    "agent_response",
    "assistant_response",
    "message",
    "output",
    "transcript",
    "turn_content"
  ]) {
    if (input[key] != null) {
      const s = messageContentToString(input[key])
      if (s.trim()) return s
    }
  }
  const lists = []
  if (Array.isArray(input.conversation)) lists.push(...input.conversation)
  if (Array.isArray(input.messages)) lists.push(...input.messages)
  for (let i = lists.length - 1; i >= 0; i--) {
    const msg = lists[i]
    if (!msg || typeof msg !== "object") continue
    const role = String(msg.role ?? msg.type ?? "").toLowerCase()
    if (role !== "assistant" && role !== "agent") continue
    const s = messageContentToString(msg.content ?? msg.text ?? msg.message)
    if (s.trim()) return s
  }
  for (const nestedKey of ["hook_input", "turn", "conversation_turn"]) {
    if (input[nestedKey] && typeof input[nestedKey] === "object") {
      const nested = extractAssistantTextFromHookInput(input[nestedKey])
      if (nested.trim()) return nested
    }
  }
  return ""
}

export function verdictAuditPath(cwd = process.cwd()) {
  return path.join(cwd, '.cursor', VERDICT_AUDIT_FILENAME)
}

export function loadVerdictAudit(cwd = process.cwd()) {
  const filePath = verdictAuditPath(cwd)
  if (!fs.existsSync(filePath)) {
    return { recorded: false, hasLocalHelpersTable: false, symbols: [], confirmText: null, snippet: null }
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const confirmText = raw.confirmText ?? null
    const symbols = Array.isArray(raw.symbols)
      ? raw.symbols.map(String)
      : extractVerdictSymbols(confirmText ?? raw.snippet ?? '')
    return {
      recorded: Boolean(raw.recorded),
      at: raw.at ?? null,
      snippet: raw.snippet ?? null,
      confirmText,
      hasLocalHelpersTable: Boolean(raw.hasLocalHelpersTable),
      symbols,
      verdictSource: raw.verdictSource ?? null
    }
  } catch {
    return { recorded: false, hasLocalHelpersTable: false, symbols: [], confirmText: null, snippet: null }
  }
}

export function saveVerdictAudit(data, cwd = process.cwd()) {
  const filePath = verdictAuditPath(cwd)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

export function resetVerdictAudit(cwd = process.cwd()) {
  saveVerdictAudit({ recorded: false, hasLocalHelpersTable: false, symbols: [], confirmText: null, snippet: null }, cwd)
}

const CONFIRM_TEXT_MAX = 8192
const BULK_Q4_MIN_LEN = 8

const VERDICT_SYMBOL_OUTCOME_RES = [
  /\breuse\s*\(\s*([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)?)\s*\)/gi,
  /\bpartialReuse\s*\(\s*([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)?)\s*\)/gi,
  /\bnewUtil\s*\(\s*([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)?)\s*\)/gi,
  /\bfeatureLocal\s*\(\s*([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)?)\s*\)/gi,
  /\bnoUtil\s*\(\s*([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)?)\s*\)/gi
]

function addVerdictSymbolToSet(symbols, name) {
  if (!name) return
  symbols.add(name)
  if (String(name).includes('.')) {
    symbols.add(String(name).split('.')[0])
  }
}

/** Map verdict symbol to import binding name when Class.method vs import Class. */
export function normalizeVerdictSymbolForImport(verdictSym, importSymbols = []) {
  const sym = String(verdictSym ?? '')
  const imports = [...new Set((importSymbols ?? []).map(String))]
  const exact = imports.find((i) => i.toLowerCase() === sym.toLowerCase())
  if (exact) return exact
  if (sym.includes('.')) {
    const root = sym.split('.')[0]
    const rootMatch = imports.find((i) => i.toLowerCase() === root.toLowerCase())
    if (rootMatch) return rootMatch
  }
  return sym
}

/**
 * Heuristic: symbols named in Verdict outcomes + Local helpers table first column.
 */
export function extractVerdictSymbols(text) {
  if (!text || typeof text !== 'string') return []
  const symbols = new Set()
  for (const re of VERDICT_SYMBOL_OUTCOME_RES) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text)) !== null) {
      addVerdictSymbolToSet(symbols, m[1])
    }
  }
  const lines = text.split('\n').filter((line) => line.includes('|'))
  for (const line of lines) {
    if (/^\s*\|[-:\s|]+\|\s*$/.test(line)) continue
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean)
    if (cells.length >= 2 && !/^(本地函数|Helper|helper|函数|Local helpers|Symbol|Util|symbol|util)$/i.test(cells[0])) {
      const first = cells[0].replace(/\s+@.*$/, '').trim()
      if (/^Gate N\/A/i.test(first)) continue
      if (/^[a-zA-Z_$][\w$]*$/.test(first)) symbols.add(first)
    }
  }
  return [...symbols]
}

/** Symbols with reuse / partialReuse / newUtil outcomes (for sibling + stale checks). */
export function extractReuseSymbols(text) {
  if (!text || typeof text !== 'string') return []
  const symbols = new Set()
  for (const re of [
    /\breuse\s*\(\s*([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)?)\s*\)/gi,
    /\bpartialReuse\s*\(\s*([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)?)\s*\)/gi,
    /\bnewUtil\s*\(\s*([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)?)\s*\)/gi
  ]) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text)) !== null) {
      addVerdictSymbolToSet(symbols, m[1])
    }
  }
  return [...symbols]
}

export function getConfirmText(cwd = process.cwd(), eagerText = '') {
  if (eagerText && String(eagerText).trim()) return String(eagerText)
  const audit = loadVerdictAudit(cwd)
  return audit.confirmText ?? audit.snippet ?? ''
}

export function countReuseSymbols(text) {
  return extractReuseSymbols(text).length
}

export function getStaleVerdictSymbols(requiredSymbols, cwd = process.cwd()) {
  return getVerdictCoverage(requiredSymbols, cwd).needsConfirm
}

/** Split required patch symbols into already Confirm'd vs needing delta Confirm. */
export function getVerdictCoverage(requiredSymbols, cwd = process.cwd()) {
  const audit = loadVerdictAudit(cwd)
  const unique = [...new Set(requiredSymbols ?? [])]
  const covered = new Set()
  for (const s of audit.symbols ?? []) {
    covered.add(String(s).toLowerCase())
    const norm = normalizeVerdictSymbolForImport(s, unique)
    covered.add(String(norm).toLowerCase())
  }
  if (!audit.recorded || covered.size === 0) {
    return { needsConfirm: unique, alreadyCovered: [], recorded: audit.recorded === true }
  }
  const needsConfirm = unique.filter(
    (s) => !covered.has(String(s).toLowerCase()) &&
      !covered.has(String(normalizeVerdictSymbolForImport(s, unique)).toLowerCase())
  )
  const alreadyCovered = unique.filter((s) => !needsConfirm.includes(s))
  return { needsConfirm, alreadyCovered, recorded: true }
}

const UTILS_IMPORT_IN_TEXT_RE = /(?:from\s+['"]|import\s+['"])(@\/utils|@\/utils\/)/

function patchTextMentionsUtilsImport(text, config) {
  if (!text || typeof text !== 'string') return false
  for (const alias of config.utilsImportAliases ?? ['@/utils']) {
    const aliasNorm = String(alias).replace(/\\/g, '/').replace(/\/+$/, '')
    const re = new RegExp(
      `(?:from\\s+['"]|import\\s+['"])${aliasNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:/|['"])`,
      'i'
    )
    if (re.test(text)) return true
  }
  const utilsPrefix = config.utilsDir?.replace(/\\/g, '/')
  if (utilsPrefix && new RegExp(`from\\s+['"]\\.?/?${utilsPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text)) {
    return true
  }
  return UTILS_IMPORT_IN_TEXT_RE.test(text)
}

function looksLikeScriptDelta(text) {
  if (!text || typeof text !== 'string') return false
  return (
    /^\s*(import|export|function|const|let|var|interface|type)\b/m.test(text) ||
    /^\s*\/\//m.test(text) ||
    /from\s+['"]/.test(text)
  )
}

function vuePatchIsTemplateOrStyleOnly(newStr) {
  if (/<template\b/i.test(newStr) || /<style\b/i.test(newStr)) return true
  if (/<[a-z][\w-]*[\s>]/i.test(newStr) && !looksLikeScriptDelta(newStr)) return true
  return false
}

/**
 * StrReplace / Write patch touches only template or style (no script / no new @/utils in delta).
 */
export function isPatchUiOnly(payload, filePath = '', config = loadHookConfig()) {
  if (!payload || typeof payload !== 'object') return false
  const normalized = normalizeAuditPath(filePath || payload.path || payload.file_path || '')
  const newStr = String(payload.new_string ?? payload.newString ?? '')
  const content = payload.content != null ? String(payload.content) : ''

  if (content) {
    if (patchTextMentionsUtilsImport(content, config)) return false
    if (/\.vue$/i.test(normalized) && /<script\b/i.test(content)) return false
    return false
  }

  if (!newStr.trim()) return false
  if (patchTextMentionsUtilsImport(newStr, config)) return false
  if (/\.vue$/i.test(normalized)) {
    if (/<script\b/i.test(newStr) || looksLikeScriptDelta(newStr)) return false
    return vuePatchIsTemplateOrStyleOnly(newStr)
  }
  if (/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(normalized)) return false
  return true
}

export function patchTextForGate(payload) {
  if (!payload || typeof payload !== 'object') return ''
  if (payload.content != null) return String(payload.content)
  return String(payload.new_string ?? payload.newString ?? '')
}

export function requiredSymbolsFromPatchDelta(normalized, payload, config, cwd = process.cwd()) {
  const patchText = patchTextForGate(payload)
  if (!patchText.trim()) return []
  return extractImportedUtilsSymbols(patchText, config)
}

export function resolvePatchUtilPaths(payload, config, cwd = process.cwd()) {
  const patchText = patchTextForGate(payload)
  if (!patchText.trim()) return []
  return resolveContentUtilPaths(patchText, config, cwd)
}

export function requiredSymbolsFromPatch(normalized, payload, config, cwd = process.cwd()) {
  if (isPatchUiOnly(payload, normalized, config)) {
    return requiredSymbolsFromPatchDelta(normalized, payload, config, cwd)
  }
  const patchText = patchTextForGate(payload)
  const merged = mergeWritePayload(normalized, payload, cwd)
  let symbols = extractImportedUtilsSymbols(merged, config)
  if (symbols.length === 0 && !patchText.trim() && hasVerdict(cwd)) {
    const audit = loadVerdictAudit(cwd)
    if (Array.isArray(audit.symbols) && audit.symbols.length > 0) {
      symbols = [...audit.symbols]
    }
  }
  return symbols
}

const VERDICT_MARKER_RES = [
  /Verdict（最终）/,
  /Verdict\s*[（(]\s*最终\s*[）)]/,
  /Verdict\s*[:：]/,
  /Verdict（/
]

const HOLLOW_CONFIRM_RES = [
  /Q1\s*[-–—]\s*Q5\s*(通过|pass|OK|ok)/i,
  /Q1[-–—]Q5\s*(通过|pass|OK|ok)/i,
  /五问\s*通过/,
  /(?:^|\s)五问(?:通过|OK|ok)(?:\s|$)/im
]

const VERDICT_OUTCOME_RES = [
  /\breuse\s*\(/i,
  /\bnewUtil\b/i,
  /\bfeatureLocal\b/i,
  /\bpartialReuse\b/i,
  /\bnoUtil\s*\(/i
]

function hasIndividualQ(text, n) {
  return new RegExp(`\\bQ${n}\\b`).test(text)
}

function rowHasQ1ToQ4(cellsOrLine) {
  const text = Array.isArray(cellsOrLine) ? cellsOrLine.join(' ') : String(cellsOrLine)
  return [1, 2, 3, 4].every((n) => hasIndividualQ(text, n))
}

function splitTableRow(line) {
  const parts = line.split('|').map((c) => c.trim())
  if (parts.length > 2 && parts[0] === '') return parts.slice(1, -1)
  return parts.filter((c) => c.length > 0)
}

function parseBulkTable(text) {
  if (!text || typeof text !== 'string') return null
  const tableLines = text
    .split('\n')
    .filter((line) => line.includes('|'))
    .filter((line) => !/^\s*\|[-:\s|]+\|\s*$/.test(line))
  if (tableLines.length < 2) return null

  const headerCells = splitTableRow(tableLines[0])
  const colIndex = (pred) => headerCells.findIndex(pred)

  const q4Col = colIndex((c) => /^Q4\b/i.test(c))
  const readCol = colIndex((c) => /^Read\b/i.test(c) || /Read\s*@/i.test(c))
  const candidateCol = colIndex((c) => /^候选$/i.test(c) || /^Candidate$/i.test(c))
  const effectiveReadCol = readCol >= 0 ? readCol : candidateCol
  const verdictCol = colIndex((c) => /^Verdict$/i.test(c))
  const symbolCol = colIndex((c) => /^(Symbol|Util|本地函数|Helper|helper|函数)$/i.test(c))
  const headerHasQCols = [1, 2, 3, 4].every((n) =>
    headerCells.some((c) => new RegExp(`^Q${n}$`, 'i').test(c))
  )

  const isCompact = q4Col >= 0 && (effectiveReadCol >= 0 || symbolCol >= 0)
  const explicitReadCol = readCol >= 0
  const isLegacyQ = headerHasQCols

  if (!isCompact && !isLegacyQ) return null

  const dataRows = tableLines.slice(1).filter((line) => {
    const cells = splitTableRow(line)
    const first = cells[0] ?? ''
    if (/^(Symbol|Util|本地函数|Helper|helper|函数)$/i.test(first.trim())) return false
    return !/^Gate N\/A/i.test(first)
  })

  return {
    headerCells,
    dataRows,
    q4Col,
    readCol: effectiveReadCol,
    explicitReadCol,
    verdictCol,
    symbolCol,
    headerHasQCols,
    qIndices: isLegacyQ
      ? [1, 2, 3, 4].map((n) => headerCells.findIndex((c) => new RegExp(`^Q${n}$`, 'i').test(c)))
      : []
  }
}

function parseBulkRow(line, table) {
  const cells = splitTableRow(line)
  if (cells.length === 0) return null
  const symbol = (cells[table.symbolCol >= 0 ? table.symbolCol : 0] ?? '')
    .replace(/\s+@.*$/, '')
    .trim()
  if (!symbol || /^Gate N\/A/i.test(symbol)) return null
  if (!/^[a-zA-Z_$][\w$]*$/.test(symbol)) return null

  let readPath = ''
  let q4 = ''
  let verdictCell = ''

  if (table.headerHasQCols) {
    const symIdx = cells.findIndex((c) => new RegExp(`\\b${symbol}\\b`, 'i').test(c))
    const base = symIdx >= 0 ? symIdx : 0
    readPath = table.readCol >= 0 ? cells[table.readCol] ?? '' : cells[base + 1] ?? ''
    q4 = table.q4Col >= 0 ? cells[table.q4Col] ?? '' : cells[base + 4] ?? ''
    verdictCell = table.verdictCol >= 0 ? cells[table.verdictCol] ?? '' : cells[cells.length - 1] ?? ''
  } else {
    readPath = table.readCol >= 0 ? cells[table.readCol] ?? '' : ''
    q4 = table.q4Col >= 0 ? cells[table.q4Col] ?? '' : ''
    verdictCell = table.verdictCol >= 0 ? cells[table.verdictCol] ?? '' : cells[cells.length - 1] ?? ''
  }

  return { symbol, readPath, q4, verdictCell, cells }
}

export function textHasBulkCompactTable(text) {
  const table = parseBulkTable(text)
  if (!table || table.q4Col < 0) return false
  if (table.dataRows.length === 0) return false
  return table.dataRows.every((line) => {
    const row = parseBulkRow(line, table)
    if (!row) return true
    if (/\bnoUtil\s*\(/i.test(row.verdictCell) || /^Gate N\/A/i.test(row.symbol)) return true
    return row.q4 && row.q4.length >= BULK_Q4_MIN_LEN && row.q4 !== '—' && row.q4 !== '-'
  })
}

/**
 * Bulk Confirm table: legacy Q1–Q4 columns or compact Symbol|Read|Q4|Verdict.
 */
export function textHasBulkConfirmTable(text) {
  if (textHasBulkCompactTable(text)) return true
  const table = parseBulkTable(text)
  if (!table || !table.headerHasQCols) return false
  if (table.dataRows.length === 0) return false
  return table.dataRows.every((line) => {
    const cells = splitTableRow(line)
    return table.qIndices.every((i) => i >= 0 && cells[i] && cells[i] !== '—' && cells[i] !== '-')
  })
}

/** Used by textHasSubstantiveConfirm — bulk table with Q4 column in header. */
export function confirmTableHasQHeader(text) {
  return (
    (/\|\s*Q1\s*\|/i.test(text) && /\|\s*Q4\s*\|/i.test(text)) ||
    (/\|\s*Q4\b/i.test(text) && /\|\s*Read\b/i.test(text))
  )
}

/**
 * Message A must include individual Q1–Q4 (and Verdict marker + outcome token).
 * Accepts legacy prose Confirm or bulk Confirm table (≥1 data row with Q1–Q4 per row).
 * v0.3.13: bulk compact with Verdict-column outcomes may omit separate Verdict（最终） line.
 */
export function textHasSubstantiveConfirm(text) {
  if (!text || typeof text !== 'string') return false

  if (HOLLOW_CONFIRM_RES.some((re) => re.test(text))) return false

  if (!VERDICT_OUTCOME_RES.some((re) => re.test(text))) return false

  if (textHasBulkCompactTable(text)) return true

  const bulkHeader = confirmTableHasQHeader(text)
  if (bulkHeader) return textHasBulkConfirmTable(text)

  if (textHasBulkConfirmTable(text)) return true

  const hasMarker = VERDICT_MARKER_RES.some((re) => re.test(text))
  if (!hasMarker) return false

  if (![1, 2, 3, 4].every((n) => hasIndividualQ(text, n))) return false

  return true
}

/**
 * Local helpers table: header + at least one data row (markdown pipes).
 */
export function textHasLocalHelpersTable(text) {
  if (!text || typeof text !== 'string') return false

  const hasHeader =
    /Local helpers/i.test(text) ||
    /\|\s*本地函数\s*\|/.test(text) ||
    /\|\s*Helper\s*\|/i.test(text) ||
    /\|\s*helper\s*\|/i.test(text) ||
    /\|\s*函数\s*\|/.test(text) ||
    /\|\s*本地 helper\s*\|/i.test(text) ||
    /\|\s*Symbol\s*\|/i.test(text) ||
    /\|\s*Util\s*\|/i.test(text)
  if (!hasHeader && !textHasBulkConfirmTable(text)) return false

  const tableLines = text
    .split('\n')
    .filter((line) => line.includes('|'))
    .filter((line) => !/^\s*\|[-:\s|]+\|\s*$/.test(line))

  return tableLines.length >= 2
}

/** @deprecated alias — use textHasSubstantiveConfirm */
export function textHasVerdict(text) {
  return textHasSubstantiveConfirm(text)
}

export function recordVerdict(text, cwd = process.cwd(), source = undefined) {
  if (!textHasSubstantiveConfirm(text)) return false
  const prior = loadVerdictAudit(cwd)
  const incoming = String(text).slice(0, CONFIRM_TEXT_MAX)
  const confirmText =
    prior.confirmText && prior.confirmText.trim() && !incoming.includes(prior.confirmText.slice(0, 120))
      ? `${prior.confirmText}\n\n${incoming}`.slice(0, CONFIRM_TEXT_MAX)
      : incoming
  const snippet = confirmText.replace(/\s+/g, ' ').trim().slice(0, 400)
  const symbols = [...new Set([...(prior.symbols ?? []), ...extractVerdictSymbols(incoming)])]
  saveVerdictAudit(
    {
      recorded: true,
      at: new Date().toISOString(),
      confirmText,
      snippet,
      hasLocalHelpersTable:
        prior.hasLocalHelpersTable === true ||
        textHasLocalHelpersTable(text) ||
        textHasBulkConfirmTable(text),
      symbols,
      verdictSource: source ?? prior.verdictSource
    },
    cwd
  )
  return true
}

export function hasVerdict(cwd = process.cwd()) {
  return loadVerdictAudit(cwd).recorded === true
}

/** Opt-in same-turn bypass audit flag (v0.3.13). */
export function markSameTurnBypass(cwd = process.cwd()) {
  const prior = loadVerdictAudit(cwd)
  saveVerdictAudit(
    {
      recorded: prior.recorded === true,
      at: prior.at,
      confirmText: prior.confirmText,
      snippet: prior.snippet,
      hasLocalHelpersTable: prior.hasLocalHelpersTable === true,
      symbols: prior.symbols ?? [],
      sameTurnBypass: true,
      sameTurnBypassAt: new Date().toISOString()
    },
    cwd
  )
}

export function tryEagerRecordVerdict(input, cwd = process.cwd(), context = 'preToolUse', raw = '') {
  const config = loadHookConfig(cwd)
  if (config.sameTurnAllow === false) return false
  if (hasVerdict(cwd)) return true
  const { text, source } = extractConfirmTextForGate(input, raw, cwd)
  if (!text.trim()) {
    logHookPayloadKeys(input, cwd, context)
    return false
  }
  const ok = recordVerdict(text, cwd, source === 'none' ? undefined : source)
  if (ok) {
    logHookGateDebug(cwd, context, { verdict_source: source, eagerRecord: true })
  }
  return ok
}

export function hasLocalHelpersTableInVerdict(cwd = process.cwd()) {
  return loadVerdictAudit(cwd).hasLocalHelpersTable === true
}

/** Reset read + verdict + discovery + agents session audits (sessionStart). */
export function resetSessionAudits(cwd = process.cwd()) {
  resetAudit(cwd)
  resetVerdictAudit(cwd)
  resetDiscoveryAudit(cwd)
  resetAgentsReadAudit(cwd)
}

export function normalizeAuditPath(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\/+/, '')
}

export function recordRead(filePath, cwd = process.cwd()) {
  const normalized = normalizeAuditPath(filePath)
  const audit = loadAudit(cwd)
  if (!audit.reads.includes(normalized)) {
    audit.reads.push(normalized)
    saveAudit(audit, cwd)
  }
}

export function hasRead(filePath, cwd = process.cwd()) {
  const normalized = normalizeAuditPath(filePath)
  return loadAudit(cwd).reads.includes(normalized)
}

export function agentsReadAuditPath(cwd = process.cwd()) {
  return path.join(cwd, '.cursor', AGENTS_READ_AUDIT_FILENAME)
}

export function loadAgentsReadAudit(cwd = process.cwd()) {
  const filePath = agentsReadAuditPath(cwd)
  if (!fs.existsSync(filePath)) return { recorded: false, at: null }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return { recorded: Boolean(raw.recorded), at: raw.at ?? null }
  } catch {
    return { recorded: false, at: null }
  }
}

export function saveAgentsReadAudit(data, cwd = process.cwd()) {
  const filePath = agentsReadAuditPath(cwd)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

export function resetAgentsReadAudit(cwd = process.cwd()) {
  saveAgentsReadAudit({ recorded: false, at: null }, cwd)
}

export function recordAgentsRead(cwd = process.cwd()) {
  saveAgentsReadAudit({ recorded: true, at: new Date().toISOString() }, cwd)
}

export function hasAgentsFileRead(cwd = process.cwd()) {
  return loadAgentsReadAudit(cwd).recorded === true
}

export function pathIsAgentsFile(filePath, agentsFile) {
  const normalized = normalizeAuditPath(filePath)
  const agents = normalizeAuditPath(agentsFile)
  return normalized === agents || normalized.endsWith(`/${agents}`)
}

export function readPayloadIsPartial(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return false
  return toolInput.offset != null || toolInput.limit != null
}

/** Skip Read of target util file when creating a new file under utilsDir. */
export function shouldRequireSelfUtilRead(normalized, utilsDir, cwd = process.cwd()) {
  if (!isUnderUtils(normalized, utilsDir)) return true
  return fs.existsSync(path.join(cwd, normalized))
}

export function utilsPathRe(utilsDir) {
  const escaped = utilsDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[/\\\\])${escaped}(?:[/\\\\]|$)`, 'i')
}

export function remindPathRes(prefixes) {
  return prefixes
    .filter(Boolean)
    .map((prefix) => {
      const normalized = prefix.replace(/\\/g, '/').replace(/\/+$/, '')
      const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return new RegExp(`(?:^|[/\\\\])${escaped}(?:[/\\\\]|$)`, 'i')
    })
}

export function isUnderUtils(filePath, utilsDir) {
  return utilsPathRe(utilsDir).test(normalizeAuditPath(filePath))
}

export function matchesRemindPath(filePath, remindWritePaths) {
  const normalized = normalizeAuditPath(filePath)
  return remindPathRes(remindWritePaths).some((re) => re.test(normalized))
}

const IMPORT_RE =
  /(?:import\s+(?:[\w*{}\s,]+)\s+from\s+|import\s+|export\s+[\w*\s{},]+\s+from\s+)['"]([^'"]+)['"]/g

const NAMED_IMPORT_FROM_RE =
  /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g
const DEFAULT_IMPORT_FROM_RE = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g

function isUtilsImportSpec(spec, config) {
  const normalized = spec.replace(/\\/g, '/')
  for (const alias of config.utilsImportAliases) {
    const aliasNorm = alias.replace(/\\/g, '/').replace(/\/+$/, '')
    if (normalized === aliasNorm || normalized.startsWith(`${aliasNorm}/`)) return true
  }
  const utilsPrefix = config.utilsDir.replace(/\\/g, '/')
  return normalized === utilsPrefix || normalized.startsWith(`${utilsPrefix}/`)
}

function parseNamedImportIdentifiers(clause) {
  return clause
    .split(',')
    .map((part) => {
      const trimmed = part.trim()
      if (!trimmed) return null
      const asMatch = trimmed.match(/^([a-zA-Z_$][\w$]*)\s+as\s+([a-zA-Z_$][\w$]*)$/)
      if (asMatch) return asMatch[2]
      const name = trimmed.split(/\s+/)[0]
      return /^[a-zA-Z_$][\w$]*$/.test(name) ? name : null
    })
    .filter(Boolean)
}

/** Imported binding names from @/utils (or configured aliases) in source text. */
export function extractImportedUtilsSymbols(content, config) {
  if (!content || typeof content !== 'string') return []
  const symbols = new Set()
  let m
  NAMED_IMPORT_FROM_RE.lastIndex = 0
  while ((m = NAMED_IMPORT_FROM_RE.exec(content)) !== null) {
    if (!isUtilsImportSpec(m[2], config)) continue
    for (const id of parseNamedImportIdentifiers(m[1])) symbols.add(id)
  }
  DEFAULT_IMPORT_FROM_RE.lastIndex = 0
  while ((m = DEFAULT_IMPORT_FROM_RE.exec(content)) !== null) {
    if (isUtilsImportSpec(m[2], config)) symbols.add(m[1])
  }
  return [...symbols]
}

export function extractUtilsImportSpecifiers(content, config) {
  if (!content || typeof content !== 'string') return []
  const specifiers = new Set()
  let m
  IMPORT_RE.lastIndex = 0
  while ((m = IMPORT_RE.exec(content)) !== null) {
    const spec = m[1].replace(/\\/g, '/')
    for (const alias of config.utilsImportAliases) {
      const aliasNorm = alias.replace(/\\/g, '/').replace(/\/+$/, '')
      if (spec === aliasNorm || spec.startsWith(`${aliasNorm}/`)) {
        specifiers.add(spec)
      }
    }
    const utilsPrefix = config.utilsDir.replace(/\\/g, '/')
    if (spec.startsWith(`${utilsPrefix}/`) || spec === utilsPrefix) {
      specifiers.add(spec)
    }
  }
  return [...specifiers]
}

export function resolveUtilSpecToPaths(spec, config, cwd = process.cwd()) {
  let rel = spec.replace(/\\/g, '/')
  for (const alias of config.utilsImportAliases) {
    const aliasNorm = alias.replace(/\\/g, '/').replace(/\/+$/, '')
    if (rel === aliasNorm) {
      rel = config.utilsDir
    } else if (rel.startsWith(`${aliasNorm}/`)) {
      rel = `${config.utilsDir}/${rel.slice(aliasNorm.length + 1)}`
    }
  }
  rel = rel.replace(/^\.\/+/, '')

  const candidates = []
  const exts = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js']
  if (/\.(ts|tsx|js|jsx|vue|mjs|cjs)$/i.test(rel)) {
    candidates.push(rel)
  } else {
    for (const ext of exts) {
      candidates.push(`${rel}${ext}`)
    }
  }

  const existing = candidates.filter((c) => fs.existsSync(path.join(cwd, c)))
  return existing.map(normalizeAuditPath)
}

export function resolveContentUtilPaths(content, config, cwd = process.cwd()) {
  const specs = extractUtilsImportSpecifiers(content, config)
  const paths = new Set()
  for (const spec of specs) {
    for (const p of resolveUtilSpecToPaths(spec, config, cwd)) {
      paths.add(p)
    }
  }
  return [...paths]
}

/**
 * Merge Write/StrReplace payload with on-disk target file content.
 */
export function mergeWritePayload(filePath, payload, cwd = process.cwd()) {
  const normalized = normalizeAuditPath(filePath)
  const diskPath = path.join(cwd, normalized)
  let base = ''
  if (fs.existsSync(diskPath)) {
    try {
      base = fs.readFileSync(diskPath, 'utf8')
    } catch {
      base = ''
    }
  }

  if (payload.content != null && String(payload.content).length > 0) {
    return String(payload.content)
  }

  const oldStr = payload.old_string ?? payload.oldString
  const newStr = payload.new_string ?? payload.newString
  if (oldStr != null && newStr != null && base) {
    const oldString = String(oldStr)
    const newString = String(newStr)
    if (payload.replace_all || payload.replaceAll) {
      return base.split(oldString).join(newString)
    }
    if (base.includes(oldString)) {
      return base.replace(oldString, newString)
    }
    return base
  }

  return base
}

/**
 * Resolve util paths from merged target file (disk + patch).
 */
export function resolveTargetUtilPaths(filePath, payload, config, cwd = process.cwd()) {
  const merged = mergeWritePayload(filePath, payload, cwd)
  return resolveContentUtilPaths(merged, config, cwd)
}

export function discoveryAuditPath(cwd = process.cwd()) {
  return path.join(cwd, '.cursor', DISCOVERY_AUDIT_FILENAME)
}

export function loadDiscoveryAudit(cwd = process.cwd()) {
  const filePath = discoveryAuditPath(cwd)
  if (!fs.existsSync(filePath)) {
    return { recorded: false, d1: false, d2: false, via: [], at: null }
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const viaList = Array.isArray(raw.via)
      ? raw.via.map(String)
      : raw.via
        ? [String(raw.via)]
        : []
    const d1 = Boolean(raw.d1) || viaList.some((v) => v === 'cli' || v === 'grep-index')
    const d2 = Boolean(raw.d2) || viaList.some((v) => v === 'd2-utils-dir')
    return {
      recorded: Boolean(raw.recorded) || viaList.length > 0,
      d1,
      d2,
      via: viaList,
      at: raw.at ?? null
    }
  } catch {
    return { recorded: false, d1: false, d2: false, via: [], at: null }
  }
}

export function saveDiscoveryAudit(data, cwd = process.cwd()) {
  const filePath = discoveryAuditPath(cwd)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

export function resetDiscoveryAudit(cwd = process.cwd()) {
  saveDiscoveryAudit({ recorded: false, d1: false, d2: false, via: [], at: null }, cwd)
}

export function recordDiscovery(via, cwd = process.cwd()) {
  const prev = loadDiscoveryAudit(cwd)
  const viaList = [...new Set([...prev.via, String(via)])]
  const d1 = prev.d1 || via === 'cli' || via === 'grep-index'
  const d2 = prev.d2 || via === 'd2-utils-dir'
  saveDiscoveryAudit(
    {
      recorded: true,
      d1,
      d2,
      via: viaList,
      at: new Date().toISOString()
    },
    cwd
  )
}

export function hasDiscovery(cwd = process.cwd()) {
  return loadDiscoveryAudit(cwd).recorded === true
}

const D1_ZERO_D2_NARRATIVE_RES = [
  /D1\s*[":].*(?:0\s*candidates?|zero\s*candidates?|无候选|零候选|no\s*candidates?)/i,
  /D1.*(?:0|zero|无|零).*(?:→|->|-\s*>|\u2192).*D2/i,
  /D1.*无候选.*D2/i
]

/** Chat must narrate D1 zero → D2 when session ran D2 after D1 with no util match. */
export function textHasD1ZeroD2Narrative(text) {
  if (!text || typeof text !== 'string') return false
  return D1_ZERO_D2_NARRATIVE_RES.some((re) => re.test(text))
}

/** D1 line documents outcome: candidates listed, or zero → D2 narrative. */
export function textHasD1OutcomeDocumented(text) {
  if (!text || typeof text !== 'string') return false
  if (/\bnoUtil\s*\(/i.test(text)) return true
  if (/0\s*candidates?|无候选|zero candidates?|零候选|no candidates?/i.test(text)) return true
  if (textHasD1ZeroD2Narrative(text)) return true
  const d1Line =
    text.split('\n').find((l) => /\bD1\b/i.test(l) && !/\bD2\b/i.test(l)) ??
    text.split('\n').find((l) => /\bD1\b/i.test(l))
  if (!d1Line) return false
  if (/0\s*candidates?|无候选|zero candidates?|零候选|no candidates?/i.test(d1Line)) {
    return textHasD1ZeroD2Narrative(text)
  }
  return /[@`]|candidates?|候选|sym/i.test(d1Line)
}

export function needsDiscoveryOutcomeInChat(cwd = process.cwd()) {
  const audit = loadDiscoveryAudit(cwd)
  return audit.recorded
}

export function loadUtilsIndex(cwd = process.cwd(), config = loadHookConfig(cwd)) {
  const indexPath = path.join(cwd, config.utilsIndexFile.replace(/\\/g, '/'))
  if (!fs.existsSync(indexPath)) return null
  try {
    return JSON.parse(fs.readFileSync(indexPath, 'utf8'))
  } catch {
    return null
  }
}

export function symbolPathFromIndex(index, symbol) {
  if (!index?.symbols?.[symbol]?.[0]?.path) return null
  return normalizeAuditPath(index.symbols[symbol][0].path)
}

function q4TextForSymbol(text, symbol) {
  if (!text || !symbol) return ''
  const table = parseBulkTable(text)
  if (table) {
    let lastQ4 = ''
    for (const line of table.dataRows) {
      const row = parseBulkRow(line, table)
      if (!row || row.symbol.toLowerCase() !== symbol.toLowerCase()) continue
      if (row.q4) lastQ4 = row.q4
    }
    if (lastQ4) return lastQ4
  }
  const symRe = new RegExp(`\\b${symbol}\\b`, 'i')
  for (const line of text.split('\n')) {
    if (!symRe.test(line)) continue
    if (line.includes('|')) {
      const parsed = parseBulkTable(text)
      if (parsed) {
        const row = parseBulkRow(line, parsed)
        if (row?.q4) return row.q4
      }
    }
    if (/\bQ4\b/i.test(line)) return line
  }
  const blockRe = new RegExp(
    `(?:Confirm[^\\n]*${symbol}|${symbol}[^\\n]*\\n)([\\s\\S]{0,400}?Q4[^\\n]*)`,
    'i'
  )
  const block = text.match(blockRe)
  return block?.[1] ?? text
}

function sessionHasReadForCell(readCell, cwd = process.cwd()) {
  if (!readCell || readCell === '—' || readCell === '-') return false
  const cell = normalizeAuditPath(
    readCell
      .replace(/^Read\s*@\s*/i, '')
      .replace(/\s+@.*$/, '')
      .trim()
  )
  if (!cell || cell === '—') return false
  if (hasRead(cell, cwd)) return true
  const audit = loadAudit(cwd)
  const base = path.basename(cell)
  return audit.reads.some((r) => {
    const norm = normalizeAuditPath(r)
    return norm === cell || norm.endsWith(`/${cell}`) || (base && norm.endsWith(`/${base}`))
  })
}

function rowRequiresRead(verdictCell) {
  return /\b(reuse|partialReuse|newUtil)\s*\(/i.test(verdictCell ?? '')
}

/** noUtil row Q4 must document D1 zero candidates or D2 utilsDir grep (v0.3.12). */
function noUtilQ4Valid(q4) {
  const text = String(q4 ?? '').trim()
  if (text.length < BULK_Q4_MIN_LEN) return false
  return (
    /0\s*candidates?|no candidates?|无候选|零候选/i.test(text) ||
    /\bD2\b.*utils/i.test(text) ||
    /Grep path:.*utils/i.test(text)
  )
}

/**
 * Validate bulk Confirm table rows — Read column + Q4 substance for reuse rows.
 */
export function getBulkRowViolations(confirmText, cwd = process.cwd(), config = loadHookConfig(cwd)) {
  const text = String(confirmText ?? '')
  const table = parseBulkTable(text)
  if (!table) return []

  const violations = []
  for (const line of table.dataRows) {
    const row = parseBulkRow(line, table)
    if (!row) continue
    if (/\bnoUtil\s*\(/i.test(row.verdictCell)) {
      if (!noUtilQ4Valid(row.q4)) {
        violations.push({
          symbol: row.symbol,
          denyReason: 'noutil_q4_invalid',
          reason: 'noUtil row Q4 must document D1 zero candidates or D2 Grep utilsDir'
        })
      }
      continue
    }
    if (/^Gate N\/A/i.test(row.symbol)) continue
    if (!rowRequiresRead(row.verdictCell) && !/\breuse\b/i.test(row.verdictCell)) continue

    const needsRead = rowRequiresRead(row.verdictCell)
    if (needsRead) {
      const readEmpty = !row.readPath || row.readPath === '—' || row.readPath === '-'
      if (table.explicitReadCol && readEmpty) {
        violations.push({
          symbol: row.symbol,
          denyReason: 'bulk_row_invalid',
          reason: 'Read column empty for reuse row'
        })
        continue
      }
      if (table.explicitReadCol && !sessionHasReadForCell(row.readPath, cwd)) {
        violations.push({
          symbol: row.symbol,
          denyReason: 'bulk_read_not_in_session',
          reason: `Read @ ${row.readPath} not in session audit`
        })
      }
    }

    const q4Empty =
      !row.q4 || row.q4 === '—' || row.q4 === '-' || row.q4.length < BULK_Q4_MIN_LEN
    if (needsRead && q4Empty) {
      violations.push({
        symbol: row.symbol,
        denyReason: 'bulk_row_invalid',
        reason: 'Q4 column empty or too short for reuse row'
      })
    }
  }
  return violations
}

export function symbolsForSiblingCheck(requiredSymbols, confirmText) {
  const fromVerdict = extractReuseSymbols(confirmText)
  return [...new Set([...fromVerdict, ...requiredSymbols])]
}

function mentionsSiblingInQ4(q4Text, sibling) {
  if (!q4Text || !sibling) return false
  const s = String(sibling)
  if (new RegExp(`\\b${s}\\b`, 'i').test(q4Text)) return true
  if (new RegExp(`(?:reject|未选|排除|not)\\s+${s}`, 'i').test(q4Text)) return true
  return false
}

/**
 * When reusing symbol S from a multi-export util file, Q4 must mention a sibling export.
 */
export function getMissingSiblingMentions(requiredSymbols, verdictText, cwd = process.cwd(), config = loadHookConfig(cwd)) {
  const index = loadUtilsIndex(cwd, config)
  if (!index) return []

  const siblingsByPath = index.siblingsByPath ?? {}
  const missing = []
  const text = String(verdictText ?? '')
  const symbols = symbolsForSiblingCheck(requiredSymbols, text)

  for (const sym of symbols) {
    const symPath = symbolPathFromIndex(index, sym)
    if (!symPath) continue
    const siblings = siblingsByPath[symPath]
    const crossSiblings = index.crossFileSiblings?.[sym] ?? []
    const allOthers = [
      ...(Array.isArray(siblings) ? siblings.filter((s) => s !== sym) : []),
      ...crossSiblings.filter((s) => s !== sym)
    ]
    const others = [...new Set(allOthers)]
    if (others.length === 0) continue
    const q4 = q4TextForSymbol(text, sym)
    if (others.some((s) => mentionsSiblingInQ4(q4, s))) continue
    missing.push({ symbol: sym, path: symPath, siblings: others })
  }
  return missing
}

export function utilsBookDirRe(utilsBookDir) {
  const escaped = utilsBookDir.replace(/\\/g, '/').replace(/\/+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[/\\\\])${escaped}(?:[/\\\\]|$)`, 'i')
}

export function isUnderUtilsBookDir(filePath, utilsBookDir) {
  return utilsBookDirRe(utilsBookDir).test(normalizeAuditPath(filePath))
}

/** @deprecated v0.3.0 — utils-book md no longer counts as Discovery */
export function isUtilsBookDiscoveryRead() {
  return false
}

export function isUtilsIndexPath(filePath, utilsIndexFile, cwd = process.cwd()) {
  const indexNorm = String(utilsIndexFile).replace(/\\/g, '/').replace(/^\.\/+/, '')
  if (pathMatchesConfiguredDir(filePath, indexNorm, cwd)) return true
  const normalized = normalizeAuditPath(filePath)
  return normalized.endsWith('/utils-index.json')
}

export function toolInputTargetsUtilsIndex(toolInput, config, cwd = process.cwd()) {
  if (!toolInput || typeof toolInput !== 'object') return false
  const indexFile = config.utilsIndexFile.replace(/\\/g, '/')

  if (toolInput.glob && String(toolInput.glob).includes('utils-index.json')) {
    return true
  }

  if (toolInput.pattern && String(toolInput.pattern).includes('utils-index.json')) {
    return true
  }

  const candidates = []
  for (const key of ['path', 'glob', 'target_directory', 'targetDirectory', 'pattern']) {
    if (toolInput[key]) candidates.push(String(toolInput[key]))
  }
  if (Array.isArray(toolInput.paths)) {
    candidates.push(...toolInput.paths.map(String))
  }

  return candidates.some((p) => isUtilsIndexPath(p, indexFile, cwd))
}

/**
 * D1.5: Grep/SemanticSearch on feature paths (remindWritePaths), not utilsDir/index.
 */
export function toolInputTargetsFeatureBusinessLookup(toolInput, config, cwd = process.cwd()) {
  if (!toolInput || typeof toolInput !== 'object') return false
  const utilsDir = config.utilsDir.replace(/\\/g, '/')
  const indexFile = config.utilsIndexFile.replace(/\\/g, '/')
  const candidates = []
  for (const key of ['path', 'glob', 'target_directory', 'targetDirectory', 'pattern']) {
    if (toolInput[key]) candidates.push(String(toolInput[key]))
  }
  if (Array.isArray(toolInput.paths)) {
    candidates.push(...toolInput.paths.map(String))
  }
  return candidates.some((p) => {
    if (!p || typeof p !== 'string') return false
    if (pathMatchesConfiguredDir(p, utilsDir, cwd)) return false
    if (isUtilsIndexPath(p, indexFile, cwd)) return false
    if (String(p).includes('utils-index.json')) return false
    return matchesRemindPath(p, config.remindWritePaths)
  })
}

const UTILS_SEARCH_CMD_RES = [
  /\bagent-utils-reuse(?:\.mjs)?\s+search\b/i,
  /\bcli\.mjs\s+search\b/i,
  /node\s+\S*agent-utils-reuse\S*\s+search\b/i
]

export function shellCommandIsUtilsSearch(command) {
  if (!command || typeof command !== 'string') return false
  const normalized = command.replace(/\s+/g, ' ').trim()
  return UTILS_SEARCH_CMD_RES.some((re) => re.test(normalized))
}

export function extractShellCommand(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return ''
  for (const key of ['command', 'cmd', 'script']) {
    if (toolInput[key]) return String(toolInput[key])
  }
  return ''
}

export function pathMatchesConfiguredDir(filePath, dir, cwd = process.cwd()) {
  let normalized = normalizeAuditPath(filePath)
  const prefix = dir.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+$/, '')
  if (normalized === prefix || normalized.startsWith(`${prefix}/`)) return true

  const root = normalizeAuditPath(cwd).replace(/\/+$/, '')
  if (root && normalized.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
    normalized = normalized.slice(root.length + 1)
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) return true
  }

  const seg = `/${prefix}/`.toLowerCase()
  const lower = normalized.toLowerCase()
  if (lower.includes(seg) || lower.endsWith(`/${prefix.toLowerCase()}`)) return true

  return false
}

/** @deprecated use pathMatchesConfiguredDir */
export function pathUnderConfiguredDir(filePath, dir, cwd = process.cwd()) {
  return pathMatchesConfiguredDir(filePath, dir, cwd)
}

function patchTextForHelperScan(text, filePathHint = '') {
  if (!text || typeof text !== 'string') return ''
  const normalized = normalizeAuditPath(filePathHint)
  if (!/\.vue$/i.test(normalized)) return text
  const scripts = []
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(text)) !== null) {
    scripts.push(m[1])
  }
  return scripts.length > 0 ? scripts.join('\n') : ''
}

const NEW_FN_DECL_RE = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)\s*\(/g
const NEW_CONST_FN_RE =
  /(?:^|\n)\s*const\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|(?:async\s*)?\([^)]*\)\s*=>)/g

function extractFunctionNames(text) {
  const names = new Set()
  if (!text || typeof text !== 'string') return names
  let m
  NEW_FN_DECL_RE.lastIndex = 0
  while ((m = NEW_FN_DECL_RE.exec(text)) !== null) {
    names.add(m[1])
  }
  NEW_CONST_FN_RE.lastIndex = 0
  while ((m = NEW_CONST_FN_RE.exec(text)) !== null) {
    names.add(m[1])
  }
  return names
}

function helperNamesInPatch(text, filePathHint) {
  const scanned = patchTextForHelperScan(text, filePathHint)
  if (/\.vue$/i.test(normalizeAuditPath(filePathHint)) && !scanned.trim()) {
    return new Set()
  }
  return extractFunctionNames(scanned || text)
}

/**
 * Heuristic: Write/StrReplace patch introduces a new local function/helper.
 */
export function patchAddsLocalHelper(payload, filePath = '') {
  if (!payload || typeof payload !== 'object') return false
  const hint = payload.path ?? payload.file_path ?? filePath ?? ''
  const normalizedHint = normalizeAuditPath(hint)
  const content = payload.content != null ? String(payload.content) : ''
  const newStr = payload.new_string ?? payload.newString ?? ''
  const oldStr = payload.old_string ?? payload.oldString ?? ''

  if (content) {
    return helperNamesInPatch(content, hint).size > 0
  }

  const added = String(newStr)
  if (!added.trim()) return false

  // Pure template/CSS StrReplace in .vue — delta has no script block
  if (/\.vue$/i.test(normalizedHint) && !/<script\b/i.test(added)) {
    return false
  }

  const newNames = helperNamesInPatch(added, hint)
  if (newNames.size === 0) return false

  const oldNames = helperNamesInPatch(String(oldStr), hint)
  for (const name of newNames) {
    if (!oldNames.has(name)) return true
  }
  return false
}

/**
 * Grep / SemanticSearch payload targets configured utilsDir (D2).
 */
export function toolInputTargetsUtilsDir(toolInput, config, cwd = process.cwd()) {
  if (!toolInput || typeof toolInput !== 'object') return false
  const utilsDir = config.utilsDir.replace(/\\/g, '/')
  const candidates = []

  for (const key of ['path', 'glob', 'target_directory', 'targetDirectory']) {
    if (toolInput[key]) candidates.push(String(toolInput[key]))
  }
  if (Array.isArray(toolInput.target_directories)) {
    candidates.push(...toolInput.target_directories.map(String))
  }
  if (Array.isArray(toolInput.paths)) {
    candidates.push(...toolInput.paths.map(String))
  }

  return candidates.some((p) => pathMatchesConfiguredDir(p, utilsDir, cwd))
}
