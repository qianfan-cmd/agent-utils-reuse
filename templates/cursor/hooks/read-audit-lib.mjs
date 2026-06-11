#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

export const CONFIG_FILENAME = '.utils-bookrc.json'
export const AUDIT_FILENAME = '.utils-gate-reads.json'
export const VERDICT_AUDIT_FILENAME = '.utils-gate-verdict.json'

const DEFAULT_UTILS_DIR = 'src/utils'
const DEFAULT_ALIASES = ['@/utils']
const DEFAULT_REMIND_PATHS = ['src/feature', 'src/components', 'src/hooks', 'src/views']

export function loadHookConfig(cwd = process.cwd()) {
  const base = {
    utilsDir: DEFAULT_UTILS_DIR,
    utilsImportAliases: [...DEFAULT_ALIASES],
    remindWritePaths: [...DEFAULT_REMIND_PATHS],
    hookMode: 'confirm'
  }
  try {
    const configPath = path.join(cwd, CONFIG_FILENAME)
    if (!fs.existsSync(configPath)) return base
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    if (raw.utilsDir) base.utilsDir = String(raw.utilsDir).replace(/\\/g, '/')
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

export function verdictAuditPath(cwd = process.cwd()) {
  return path.join(cwd, '.cursor', VERDICT_AUDIT_FILENAME)
}

export function loadVerdictAudit(cwd = process.cwd()) {
  const filePath = verdictAuditPath(cwd)
  if (!fs.existsSync(filePath)) return { recorded: false }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return {
      recorded: Boolean(raw.recorded),
      at: raw.at ?? null,
      snippet: raw.snippet ?? null
    }
  } catch {
    return { recorded: false }
  }
}

export function saveVerdictAudit(data, cwd = process.cwd()) {
  const filePath = verdictAuditPath(cwd)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

export function resetVerdictAudit(cwd = process.cwd()) {
  saveVerdictAudit({ recorded: false }, cwd)
}

const VERDICT_MARKER_RES = [
  /Verdict（最终）/,
  /Verdict\s*[:：]/,
  /Verdict（/
]

const VERDICT_SUBSTANCE_RES = [
  /\bQ[1-5]\b/,
  /\breuse\s*\(/i,
  /\bnewUtil\b/i,
  /\bfeatureLocal\b/i,
  /\bConfirm\b/i
]

/**
 * Heuristic: substantive Confirm + Verdict in assistant chat text.
 */
export function textHasVerdict(text) {
  if (!text || typeof text !== 'string') return false
  const hasMarker = VERDICT_MARKER_RES.some((re) => re.test(text))
  const hasSubstance = VERDICT_SUBSTANCE_RES.some((re) => re.test(text))
  return hasMarker && hasSubstance
}

export function recordVerdict(text, cwd = process.cwd()) {
  if (!textHasVerdict(text)) return false
  const snippet = String(text).replace(/\s+/g, ' ').trim().slice(0, 400)
  saveVerdictAudit(
    {
      recorded: true,
      at: new Date().toISOString(),
      snippet
    },
    cwd
  )
  return true
}

export function hasVerdict(cwd = process.cwd()) {
  return loadVerdictAudit(cwd).recorded === true
}

/** Reset read + verdict session audits (sessionStart). */
export function resetSessionAudits(cwd = process.cwd()) {
  resetAudit(cwd)
  resetVerdictAudit(cwd)
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
