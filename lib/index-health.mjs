import fs from 'node:fs'
import path from 'node:path'

const EXPORT_FN = /export\s+(?:async\s+)?function\s+(\w+)/g
const EXPORT_CONST = /export\s+(?:async\s+)?const\s+(\w+)/g
const EXPORT_CLASS = /export\s+class\s+(\w+)/g
const EXPORT_NAMED = /export\s*\{\s*([^}]+)\}\s*(?!from)/g

const DEFAULT_GOLDEN_KEYWORDS = ['mention', 'timeout', 'Promise', 'upload', 'base64', 'validate']

function walkTsFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === '__mocks__') continue
      walkTsFiles(full, results)
    } else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      results.push(full)
    }
  }
  return results
}

function countExportsInFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const names = new Set()
  for (const re of [EXPORT_FN, EXPORT_CONST, EXPORT_CLASS]) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(content)) !== null) {
      names.add(m[1])
    }
  }
  EXPORT_NAMED.lastIndex = 0
  let m
  while ((m = EXPORT_NAMED.exec(content)) !== null) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/i).pop()?.trim()
      if (name && /^[\w$]+$/.test(name)) names.add(name)
    }
  }
  return names.size
}

function countExportsInUtilsDir(utilsRoot) {
  const files = walkTsFiles(utilsRoot)
  let total = 0
  for (const file of files) {
    total += countExportsInFile(file)
  }
  return { exportCount: total, fileCount: files.length }
}

function countEmptySearchText(index, jsdocTag) {
  if (!index?.symbols) return { empty: 0, total: 0 }
  const tag = String(jsdocTag ?? '@utils-book').replace(/^@/, '')
  const noSummaryRe = new RegExp(`^\\(无简介|^\\(no summary`, 'i')
  let empty = 0
  let total = 0
  for (const entries of Object.values(index.symbols)) {
    if (!Array.isArray(entries) || entries.length === 0) continue
    total++
    const entry = entries[0]
    const text = String(entry.searchText ?? entry.summary ?? '')
    if (!text || noSummaryRe.test(text) || text.length < 3) empty++
  }
  return { empty, total }
}

/**
 * @param {import('./load-config.mjs').resolveConfig extends (...args: any) => infer R ? R : never} config
 */
export function scanIndexHealth(projectRoot, config) {
  const indexPath = config.indexFilePath
  const indexExists = fs.existsSync(indexPath)
  let symbolCount = 0
  let index = null

  if (indexExists) {
    try {
      index = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
      symbolCount = Object.keys(index.symbols ?? {}).length
    } catch {
      index = null
    }
  }

  const { exportCount, fileCount } = countExportsInUtilsDir(config.utilsRoot)
  const coverageRatio =
    exportCount > 0 ? Math.round((symbolCount / exportCount) * 100) : indexExists && symbolCount > 0 ? 100 : 0

  const warnings = []
  if (!indexExists) {
    warnings.push('missing-index')
  } else if (symbolCount === 0) {
    warnings.push('empty-index')
  }
  if (exportCount > 0 && coverageRatio < 30) {
    warnings.push('low-coverage')
  }
  if (index && exportCount > 0) {
    const { empty, total } = countEmptySearchText(index, config.jsdocTag)
    if (total > 0 && empty / total > 0.5) {
      warnings.push('empty-searchText')
    }
  }
  if (!fs.existsSync(config.utilsRoot)) {
    warnings.push('missing-utilsDir')
  }

  const goldenKeywords = suggestGoldenKeywords(config)
  const goldenMisses = []
  for (const kw of goldenKeywords) {
    if (!indexExists || !index) {
      goldenMisses.push(kw)
      continue
    }
    const hit = Object.values(index.symbols ?? {}).some((entries) => {
      const text = String(entries?.[0]?.searchText ?? '').toLowerCase()
      return text.includes(kw.toLowerCase())
    })
    if (!hit) goldenMisses.push(kw)
  }

  return {
    indexExists,
    symbolCount,
    exportCount,
    fileCount,
    coverageRatio,
    warnings,
    goldenMisses,
    goldenKeywords
  }
}

export function suggestGoldenKeywords(config) {
  const fromSynonyms = Object.keys(config.searchSynonyms ?? {})
  const merged = [...new Set([...DEFAULT_GOLDEN_KEYWORDS, ...fromSynonyms])]
  return merged.slice(0, 12)
}

export function formatIndexHealthSummary(health) {
  const lines = []
  if (!health.indexExists) {
    lines.push('Index health: missing utils-index.json')
    lines.push('WARN: run pnpm gen:utils-book before agent tasks')
    return lines
  }
  const pct = health.exportCount > 0 ? `${health.coverageRatio}%` : 'n/a'
  lines.push(
    `Index health: ${health.symbolCount} symbols / ${health.exportCount} exports (${pct})`
  )
  if (health.warnings.includes('low-coverage')) {
    lines.push('WARN: low index coverage — run pnpm gen:utils-book and backfill @utils-book JSDoc')
  }
  if (health.warnings.includes('empty-searchText')) {
    lines.push('WARN: many symbols lack searchable summaries — see BACKFILL-UTILS-BOOK docs')
  }
  if (health.warnings.includes('empty-index')) {
    lines.push('WARN: utils-index.json has no symbols — run pnpm gen:utils-book')
  }
  if (health.goldenMisses?.length > 0 && health.goldenMisses.length <= 6) {
    lines.push(`WARN: golden keywords not in index: ${health.goldenMisses.join(', ')}`)
  }
  if (health.warnings.length === 0 && health.symbolCount > 0) {
    lines.push('Index health: OK')
  }
  return lines
}

export function verifyIndexHealth(projectRoot, config) {
  const health = scanIndexHealth(projectRoot, config)
  const ok =
    health.indexExists &&
    health.symbolCount > 0 &&
    !health.warnings.includes('missing-index') &&
    !health.warnings.includes('empty-index')
  return { health, ok }
}
