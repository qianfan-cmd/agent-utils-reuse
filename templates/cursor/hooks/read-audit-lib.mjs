#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

export const CONFIG_FILENAME = '.utils-bookrc.json'
export const AUDIT_FILENAME = '.utils-gate-reads.json'
export const VERDICT_AUDIT_FILENAME = '.utils-gate-verdict.json'
export const DISCOVERY_AUDIT_FILENAME = '.utils-gate-discovery.json'
export const HOOK_ERROR_LOG = '.utils-gate-hook-error.log'
export const HOOK_DEBUG_LOG = '.utils-gate-hook-debug.log'

const DEFAULT_UTILS_DIR = 'src/utils'
const DEFAULT_UTILS_BOOK_DIR = 'docs/agent-catalog/utils-book'
const DEFAULT_UTILS_INDEX_FILE = 'docs/agent-catalog/utils-index.json'
const DEFAULT_ALIASES = ['@/utils']
const DEFAULT_REMIND_PATHS = ['src/feature', 'src/components', 'src/hooks', 'src/views']

export function loadHookConfig(cwd = process.cwd()) {
  const base = {
    utilsDir: DEFAULT_UTILS_DIR,
    utilsBookDir: DEFAULT_UTILS_BOOK_DIR,
    utilsIndexFile: DEFAULT_UTILS_INDEX_FILE,
    utilsImportAliases: [...DEFAULT_ALIASES],
    remindWritePaths: [...DEFAULT_REMIND_PATHS],
    hookMode: 'confirm'
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
    if (raw.hookMode) {
      const mode = String(raw.hookMode).toLowerCase()
      base.hookMode = mode === 'remind' ? 'remind' : 'confirm'
    }
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

export function extractAssistantTextFromHookInput(input) {
  if (!input || typeof input !== "object") return ""
  for (const key of [
    "text",
    "response",
    "content",
    "agent_message",
    "assistant_message",
    "assistant_message_text",
    "agent_response",
    "assistant_response",
    "message",
    "output"
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
  if (input.hook_input && typeof input.hook_input === 'object') {
    const nested = extractAssistantTextFromHookInput(input.hook_input)
    if (nested.trim()) return nested
  }
  if (input.turn && typeof input.turn === 'object') {
    const nested = extractAssistantTextFromHookInput(input.turn)
    if (nested.trim()) return nested
  }
  return ""
}

export function verdictAuditPath(cwd = process.cwd()) {
  return path.join(cwd, '.cursor', VERDICT_AUDIT_FILENAME)
}

export function loadVerdictAudit(cwd = process.cwd()) {
  const filePath = verdictAuditPath(cwd)
  if (!fs.existsSync(filePath)) return { recorded: false, hasLocalHelpersTable: false }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return {
      recorded: Boolean(raw.recorded),
      at: raw.at ?? null,
      snippet: raw.snippet ?? null,
      hasLocalHelpersTable: Boolean(raw.hasLocalHelpersTable)
    }
  } catch {
    return { recorded: false, hasLocalHelpersTable: false }
  }
}

export function saveVerdictAudit(data, cwd = process.cwd()) {
  const filePath = verdictAuditPath(cwd)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

export function resetVerdictAudit(cwd = process.cwd()) {
  saveVerdictAudit({ recorded: false, hasLocalHelpersTable: false }, cwd)
}

const VERDICT_MARKER_RES = [
  /Verdict（最终）/,
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
  /\bpartialReuse\b/i
]

function hasIndividualQ(text, n) {
  return new RegExp(`\\bQ${n}\\b`).test(text)
}

/**
 * Message A must include individual Q1–Q4 (and Verdict marker + outcome token).
 * Rejects hollow "Q1-Q5 pass" style summaries.
 */
export function textHasSubstantiveConfirm(text) {
  if (!text || typeof text !== 'string') return false

  const hasMarker = VERDICT_MARKER_RES.some((re) => re.test(text))
  if (!hasMarker) return false

  if (HOLLOW_CONFIRM_RES.some((re) => re.test(text))) return false

  if (![1, 2, 3, 4].every((n) => hasIndividualQ(text, n))) return false

  if (!VERDICT_OUTCOME_RES.some((re) => re.test(text))) return false

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
    /\|\s*本地 helper\s*\|/i.test(text)
  if (!hasHeader) return false

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

export function recordVerdict(text, cwd = process.cwd()) {
  if (!textHasSubstantiveConfirm(text)) return false
  const snippet = String(text).replace(/\s+/g, ' ').trim().slice(0, 400)
  saveVerdictAudit(
    {
      recorded: true,
      at: new Date().toISOString(),
      snippet,
      hasLocalHelpersTable: textHasLocalHelpersTable(text)
    },
    cwd
  )
  return true
}

export function hasVerdict(cwd = process.cwd()) {
  return loadVerdictAudit(cwd).recorded === true
}

export function tryEagerRecordVerdict(input, cwd = process.cwd(), context = 'preToolUse') {
  if (hasVerdict(cwd)) return true
  const text = extractAssistantTextFromHookInput(input)
  if (!text) {
    logHookPayloadKeys(input, cwd, context)
    return false
  }
  return recordVerdict(text, cwd)
}

export function hasLocalHelpersTableInVerdict(cwd = process.cwd()) {
  return loadVerdictAudit(cwd).hasLocalHelpersTable === true
}

/** Reset read + verdict + discovery session audits (sessionStart). */
export function resetSessionAudits(cwd = process.cwd()) {
  resetAudit(cwd)
  resetVerdictAudit(cwd)
  resetDiscoveryAudit(cwd)
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
  const audit = loadAudit(cwd)
  if (audit.reads.includes(normalized)) return true
  // Also match if any read path ends with same basename under utils
  const base = path.posix.basename(normalized)
  return audit.reads.some((r) => r === normalized || r.endsWith(`/${base}`))
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
  if (existing.length > 0) return existing.map(normalizeAuditPath)
  return [normalizeAuditPath(candidates[0])]
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
  }

  if (newStr != null) {
    return base ? `${base}\n${String(newStr)}` : String(newStr)
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
  if (!fs.existsSync(filePath)) return { recorded: false, via: null, at: null }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return {
      recorded: Boolean(raw.recorded),
      via: raw.via ?? null,
      at: raw.at ?? null
    }
  } catch {
    return { recorded: false, via: null, at: null }
  }
}

export function saveDiscoveryAudit(data, cwd = process.cwd()) {
  const filePath = discoveryAuditPath(cwd)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

export function resetDiscoveryAudit(cwd = process.cwd()) {
  saveDiscoveryAudit({ recorded: false, via: null, at: null }, cwd)
}

export function recordDiscovery(via, cwd = process.cwd()) {
  saveDiscoveryAudit(
    {
      recorded: true,
      via,
      at: new Date().toISOString()
    },
    cwd
  )
}

export function hasDiscovery(cwd = process.cwd()) {
  return loadDiscoveryAudit(cwd).recorded === true
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

  const candidates = []
  for (const key of ['path', 'glob', 'target_directory', 'targetDirectory']) {
    if (toolInput[key]) candidates.push(String(toolInput[key]))
  }
  if (Array.isArray(toolInput.paths)) {
    candidates.push(...toolInput.paths.map(String))
  }

  return candidates.some((p) => isUtilsIndexPath(p, indexFile, cwd))
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
const NEW_CONST_FN_RE = /(?:^|\n)\s*const\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g

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
  const content = payload.content != null ? String(payload.content) : ''
  const newStr = payload.new_string ?? payload.newString ?? ''
  const oldStr = payload.old_string ?? payload.oldString ?? ''

  if (content) {
    return helperNamesInPatch(content, hint).size > 0
  }

  const added = String(newStr)
  if (!added.trim()) return false

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
