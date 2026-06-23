#!/usr/bin/env node
/**
 * Apply v0.3.5 hook + test + doc patches (package-dev script).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function write(rel, content) {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content, 'utf8')
  console.log('wrote', rel)
}

// --- read-audit-lib.mjs: surgical replacements via full sections ---

const readAuditLib = fs.readFileSync(path.join(root, 'templates/cursor/hooks/read-audit-lib.mjs'), 'utf8')

const bomSection = `export const HOOK_ERROR_LOG = '.utils-gate-hook-error.log'
export const HOOK_DEBUG_LOG = '.utils-gate-hook-debug.log'`

if (!readAuditLib.includes('HOOK_DEBUG_LOG')) {
  write(
    'templates/cursor/hooks/read-audit-lib.mjs',
    readAuditLib.replace(
      "export const HOOK_ERROR_LOG = '.utils-gate-hook-error.log'",
      bomSection
    )
  )
}

let lib = fs.readFileSync(path.join(root, 'templates/cursor/hooks/read-audit-lib.mjs'), 'utf8')

if (!lib.includes('stripBomBuffer')) {
  lib = lib.replace(
    `export function hookErrorDenyMessage() {
  return 'Gate hook error — fix .cursor/hooks or re-run pnpm update:utils-reuse. Write blocked (fail-closed).'
}

/** Strip UTF-8 BOM Cursor may prefix on hook stdin JSON. */
export function stripUtf8Bom(s) {
  if (!s || typeof s !== "string") return ""
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

export async function readHookStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return stripUtf8Bom(Buffer.concat(chunks).toString("utf8"))
}

export function parseHookJson(raw) {
  const trimmed = stripUtf8Bom(String(raw ?? "").trim())
  if (!trimmed) return null
  return JSON.parse(trimmed)
}`,
    `export function hookErrorDenyMessage(detail) {
  const base =
    'Gate hook error — fix .cursor/hooks or re-run pnpm update:utils-reuse. Write blocked (fail-closed).'
  return detail ? \`\${base} (\${detail})\` : base
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
    throw new Error(\`Hook JSON parse failed: \${err.message}\`)
  }
}

export function parseHookJson(raw) {
  const trimmed = stripUtf8Bom(String(raw ?? '').trim())
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch (err) {
    throw new Error(\`Hook JSON parse failed: \${err.message}\`)
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
      \`[\${new Date().toISOString()}] \${context} payload keys: \${keys || '(empty)'}\\n\`
    )
  } catch {
    /* ignore */
  }
}`
  )
}

lib = fs.readFileSync(path.join(root, 'templates/cursor/hooks/read-audit-lib.mjs'), 'utf8')

if (!lib.includes('assistant_message_text')) {
  lib = lib.replace(
    `export function extractAssistantTextFromHookInput(input) {
  if (!input || typeof input !== "object") return ""
  for (const key of ["text", "response", "content", "agent_message", "assistant_message"]) {`,
    `export function extractAssistantTextFromHookInput(input) {
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
  ]) {`
  )
  lib = lib.replace(
    `    if (s.trim()) return s
  }
  return ""
}`,
    `    if (s.trim()) return s
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
}`
  )
}

if (!lib.includes('Helper |')) {
  lib = lib.replace(
    `  const hasHeader = /Local helpers/i.test(text) || /\\|\\s*本地函数\\s*\\|/.test(text)`,
    `  const hasHeader =
    /Local helpers/i.test(text) ||
    /\\|\\s*本地函数\\s*\\|/.test(text) ||
    /\\|\\s*Helper\\s*\\|/i.test(text) ||
    /\\|\\s*helper\\s*\\|/i.test(text) ||
    /\\|\\s*函数\\s*\\|/.test(text) ||
    /\\|\\s*本地 helper\\s*\\|/i.test(text)`
  )
}

if (!lib.includes('tryEagerRecordVerdict(input, cwd, context')) {
  lib = lib.replace(
    `export function tryEagerRecordVerdict(input, cwd = process.cwd()) {
  if (hasVerdict(cwd)) return true
  const text = extractAssistantTextFromHookInput(input)
  if (!text) return false
  return recordVerdict(text, cwd)
}`,
    `export function tryEagerRecordVerdict(input, cwd = process.cwd(), context = 'preToolUse') {
  if (hasVerdict(cwd)) return true
  const text = extractAssistantTextFromHookInput(input)
  if (!text) {
    logHookPayloadKeys(input, cwd, context)
    return false
  }
  return recordVerdict(text, cwd)
}`
  )
}

if (!lib.includes('pathMatchesConfiguredDir')) {
  lib = lib.replace(
    `export function pathUnderConfiguredDir(filePath, dir) {
  const normalized = normalizeAuditPath(filePath)
  const prefix = dir.replace(/\\\\/g, '/').replace(/\\/+$/, '')
  return normalized === prefix || normalized.startsWith(\`\${prefix}/\`)
}`,
    `export function pathMatchesConfiguredDir(filePath, dir, cwd = process.cwd()) {
  let normalized = normalizeAuditPath(filePath)
  const prefix = dir.replace(/\\\\/g, '/').replace(/^\\.\\/+/, '').replace(/\\/+$/, '')
  if (normalized === prefix || normalized.startsWith(\`\${prefix}/\`)) return true

  const root = normalizeAuditPath(cwd).replace(/\\/+$/, '')
  if (root && normalized.toLowerCase().startsWith(\`\${root.toLowerCase()}/\`)) {
    normalized = normalized.slice(root.length + 1)
    if (normalized === prefix || normalized.startsWith(\`\${prefix}/\`)) return true
  }

  const seg = \`/\${prefix}/\`.toLowerCase()
  const lower = normalized.toLowerCase()
  if (lower.includes(seg) || lower.endsWith(\`/\${prefix.toLowerCase()}\`)) return true

  return false
}

/** @deprecated use pathMatchesConfiguredDir */
export function pathUnderConfiguredDir(filePath, dir, cwd = process.cwd()) {
  return pathMatchesConfiguredDir(filePath, dir, cwd)
}`
  )
}

if (!lib.includes('patchTextForHelperScan')) {
  lib = lib.replace(
    `const NEW_FN_DECL_RE = /(?:^|\\n)\\s*(?:export\\s+)?(?:async\\s+)?function\\s+([a-zA-Z_$][\\w$]*)\\s*\\(/g`,
    `function patchTextForHelperScan(text, filePathHint = '') {
  if (!text || typeof text !== 'string') return ''
  const normalized = normalizeAuditPath(filePathHint)
  if (!/\\.vue$/i.test(normalized)) return text
  const scripts = []
  const re = /<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi
  let m
  while ((m = re.exec(text)) !== null) {
    scripts.push(m[1])
  }
  return scripts.length > 0 ? scripts.join('\\n') : ''
}

const NEW_FN_DECL_RE = /(?:^|\\n)\\s*(?:export\\s+)?(?:async\\s+)?function\\s+([a-zA-Z_$][\\w$]*)\\s*\\(/g`
  )

  lib = lib.replace(
    `export function patchAddsLocalHelper(payload) {
  if (!payload || typeof payload !== 'object') return false
  const content = payload.content != null ? String(payload.content) : ''
  const newStr = payload.new_string ?? payload.newString ?? ''
  const oldStr = payload.old_string ?? payload.oldString ?? ''

  if (content) {
    return extractFunctionNames(content).size > 0
  }

  const added = String(newStr)
  if (!added.trim()) return false

  const newNames = extractFunctionNames(added)
  if (newNames.size === 0) return false

  const oldNames = extractFunctionNames(String(oldStr))
  for (const name of newNames) {
    if (!oldNames.has(name)) return true
  }
  return false
}`,
    `function helperNamesInPatch(text, filePathHint) {
  const scanned = patchTextForHelperScan(text, filePathHint)
  if (/\\.vue$/i.test(normalizeAuditPath(filePathHint)) && !scanned.trim()) {
    return new Set()
  }
  return extractFunctionNames(scanned || text)
}

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
}`
  )
}

if (!lib.includes('toolInputTargetsUtilsDir(toolInput, config, cwd')) {
  lib = lib.replace(
    `export function isUtilsIndexPath(filePath, utilsIndexFile) {
  const normalized = normalizeAuditPath(filePath)
  const indexNorm = String(utilsIndexFile).replace(/\\\\/g, '/').replace(/^\\.\\/+/, '')
  return (
    normalized === indexNorm ||
    normalized.endsWith(\`/\${indexNorm}\`) ||
    normalized.endsWith('/utils-index.json')
  )
}

export function toolInputTargetsUtilsIndex(toolInput, config) {
  if (!toolInput || typeof toolInput !== 'object') return false
  const indexFile = config.utilsIndexFile.replace(/\\\\/g, '/')

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

  return candidates.some((p) => isUtilsIndexPath(p, indexFile))
}`,
    `export function isUtilsIndexPath(filePath, utilsIndexFile, cwd = process.cwd()) {
  const indexNorm = String(utilsIndexFile).replace(/\\\\/g, '/').replace(/^\\.\\/+/, '')
  if (pathMatchesConfiguredDir(filePath, indexNorm, cwd)) return true
  const normalized = normalizeAuditPath(filePath)
  return normalized.endsWith('/utils-index.json')
}

export function toolInputTargetsUtilsIndex(toolInput, config, cwd = process.cwd()) {
  if (!toolInput || typeof toolInput !== 'object') return false
  const indexFile = config.utilsIndexFile.replace(/\\\\/g, '/')

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
}`
  )

  lib = lib.replace(
    `export function toolInputTargetsUtilsDir(toolInput, config) {
  if (!toolInput || typeof toolInput !== 'object') return false
  const utilsDir = config.utilsDir.replace(/\\\\/g, '/')
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

  return candidates.some((p) => pathUnderConfiguredDir(p, utilsDir))
}`,
    `export function toolInputTargetsUtilsDir(toolInput, config, cwd = process.cwd()) {
  if (!toolInput || typeof toolInput !== 'object') return false
  const utilsDir = config.utilsDir.replace(/\\\\/g, '/')
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
}`
  )
}

write('templates/cursor/hooks/read-audit-lib.mjs', lib)

// --- check-discovery-before-shared-write.mjs ---
let check = fs.readFileSync(
  path.join(root, 'templates/cursor/hooks/check-discovery-before-shared-write.mjs'),
  'utf8'
)

if (!check.includes('parseNestedJson')) {
  check = check.replace(
    `  parseHookJson,
  readHookStdin,
  tryEagerRecordVerdict
} from './read-audit-lib.mjs'`,
    `  parseHookJson,
  parseNestedJson,
  readHookStdin,
  tryEagerRecordVerdict
} from './read-audit-lib.mjs'`
  )
  check = check.replace(
    `      const parsed = JSON.parse(toolInput)
      return parsed.path ?? parsed.file_path ?? parsed.target_notebook`,
    `      const parsed = parseNestedJson(toolInput)
      return parsed?.path ?? parsed?.file_path ?? parsed?.target_notebook`
  )
  check = check.replace(
    `      return JSON.parse(toolInput)
    } catch {
      return {}
    }
  }
  return toolInput ?? {}
}`,
    `      return parseNestedJson(toolInput) ?? {}
    } catch {
      return {}
    }
  }
  return toolInput ?? {}
}`
  )
  check = check.replace(
    `      agent_message: hookErrorDenyMessage()
    })
  )
}`,
    `      agent_message: hookErrorDenyMessage(err?.message || String(err))
    })
  )
}`
  )
  check = check.replace(
    `    const addsHelper = isRemind && patchAddsLocalHelper(payload) && !isUtils`,
    `    const addsHelper = isRemind && patchAddsLocalHelper(payload, normalized) && !isUtils`
  )
  check = check.replace(
    `Denied: Message A must include a **Local helpers** table`,
    `Denied: Confirm phase must include a **Local helpers** table (or | Helper | / | 本地函数 | header)`
  )
}

write('templates/cursor/hooks/check-discovery-before-shared-write.mjs', check)

// --- track-utils-discovery.mjs ---
write(
  'templates/cursor/hooks/track-utils-discovery.mjs',
  `#!/usr/bin/env node
import {
  extractShellCommand,
  loadHookConfig,
  logHookError,
  parseHookJson,
  parseNestedJson,
  readHookStdin,
  recordDiscovery,
  shellCommandIsUtilsSearch,
  toolInputTargetsUtilsDir,
  toolInputTargetsUtilsIndex
} from './read-audit-lib.mjs'

function extractToolInput(input) {
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

async function main() {
  const cwd = process.cwd()
  const config = loadHookConfig(cwd)

  try {
    const raw = await readHookStdin()
    if (!raw.trim()) {
      process.stdout.write(JSON.stringify({ ok: true }))
      return
    }

    const input = parseHookJson(raw)
    const toolInput = extractToolInput(input)

    const shellCmd = extractShellCommand(toolInput)
    if (shellCommandIsUtilsSearch(shellCmd)) {
      recordDiscovery('search', cwd)
    } else if (toolInputTargetsUtilsIndex(toolInput, config, cwd)) {
      recordDiscovery('index', cwd)
    } else if (toolInputTargetsUtilsDir(toolInput, config, cwd)) {
      recordDiscovery('grep', cwd)
    }

    process.stdout.write(JSON.stringify({ ok: true }))
  } catch (err) {
    logHookError(cwd, 'track-utils-discovery', err)
    if (config.hookMode === 'confirm') {
      process.stdout.write(JSON.stringify({ ok: false, error: String(err?.message || err) }))
    } else {
      process.stdout.write(JSON.stringify({ ok: true }))
    }
  }
}

main()
`
)

// --- track-utils-reads.mjs ---
write(
  'templates/cursor/hooks/track-utils-reads.mjs',
  `#!/usr/bin/env node
import {
  isUnderUtils,
  loadHookConfig,
  logHookError,
  normalizeAuditPath,
  parseHookJson,
  parseNestedJson,
  readHookStdin,
  recordRead,
  resetSessionAudits
} from './read-audit-lib.mjs'

function extractReadPath(input) {
  const toolInput = input.tool_input ?? input.arguments ?? input
  if (typeof toolInput === 'string') {
    try {
      const parsed = parseNestedJson(toolInput)
      return parsed?.path ?? parsed?.file_path
    } catch {
      return null
    }
  }
  return toolInput.path ?? toolInput.file_path
}

async function main() {
  const cwd = process.cwd()
  const config = loadHookConfig(cwd)

  try {
    if (process.argv.includes('--reset')) {
      resetSessionAudits(cwd)
      process.stdout.write(JSON.stringify({ ok: true }))
      return
    }

    const raw = await readHookStdin()
    if (!raw.trim()) {
      process.stdout.write(JSON.stringify({ ok: true }))
      return
    }

    const input = parseHookJson(raw)
    const filePath = extractReadPath(input)
    if (!filePath) {
      process.stdout.write(JSON.stringify({ ok: true }))
      return
    }

    const normalized = normalizeAuditPath(filePath)
    if (isUnderUtils(normalized, config.utilsDir)) {
      recordRead(normalized, cwd)
    }

    process.stdout.write(JSON.stringify({ ok: true, recorded: normalized }))
  } catch (err) {
    logHookError(cwd, 'track-utils-reads', err)
    if (config.hookMode === 'confirm') {
      process.stdout.write(JSON.stringify({ ok: false, error: String(err?.message || err) }))
    } else {
      process.stdout.write(JSON.stringify({ ok: true }))
    }
  }
}

main()
`
)

// --- track-utils-verdict.mjs ---
write(
  'templates/cursor/hooks/track-utils-verdict.mjs',
  `#!/usr/bin/env node
import {
  extractAssistantTextFromHookInput,
  loadHookConfig,
  logHookError,
  parseHookJson,
  readHookStdin,
  recordVerdict,
  resetVerdictAudit
} from './read-audit-lib.mjs'

async function main() {
  const cwd = process.cwd()
  const config = loadHookConfig(cwd)

  try {
    if (process.argv.includes('--reset')) {
      resetVerdictAudit(cwd)
      process.stdout.write(JSON.stringify({ ok: true }))
      return
    }

    const raw = await readHookStdin()
    if (!raw.trim()) {
      process.stdout.write(JSON.stringify({ ok: true }))
      return
    }

    const input = parseHookJson(raw)
    const text = extractAssistantTextFromHookInput(input)
    const recorded = recordVerdict(text, cwd)

    process.stdout.write(JSON.stringify({ ok: true, recorded }))
  } catch (err) {
    logHookError(cwd, 'track-utils-verdict', err)
    if (config.hookMode === 'confirm') {
      process.stdout.write(JSON.stringify({ ok: false, error: String(err?.message || err) }))
    } else {
      process.stdout.write(JSON.stringify({ ok: true }))
    }
  }
}

main()
`
)

console.log('v0.3.5 hooks apply done')
