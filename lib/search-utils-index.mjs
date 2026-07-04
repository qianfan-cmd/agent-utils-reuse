import fs from 'node:fs'

import { loadConfig } from './load-config.mjs'

function tokenizeQuery(query) {
  if (!query || typeof query !== 'string') return []
  return query
    .toLowerCase()
    .split(/[\s,，、/|]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

function scoreEntry(name, entry, tokens) {
  if (tokens.length === 0) return 0

  const nameLower = name.toLowerCase()
  const searchLower = (entry.searchText || '').toLowerCase()
  const summaryLower = (entry.summary || '').toLowerCase()
  let score = 0

  for (const token of tokens) {
    if (nameLower === token) score += 10
    else if (nameLower.startsWith(token)) score += 6
    else if (nameLower.includes(token)) score += 4

    if (searchLower.includes(token)) score += 2
    if (summaryLower.includes(token)) score += 1
  }

  return score
}

function flattenSymbols(index) {
  const rows = []
  const symbols = index.symbols ?? {}
  for (const [name, entries] of Object.entries(symbols)) {
    for (const entry of entries) {
      rows.push({ name, ...entry })
    }
  }
  return rows
}

export function loadUtilsIndex(config) {
  const filePath = config.indexFilePath
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `utils-index not found: ${filePath}\nRun: pnpm gen:utils-book (or agent-utils-reuse gen)`
    )
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

export function searchUtilsIndex(index, query, { limit = 8 } = {}) {
  const tokens = tokenizeQuery(query)
  const rows = flattenSymbols(index)

  if (tokens.length === 0) {
    return rows.slice(0, limit).map((r) => ({ ...r, score: 0 }))
  }

  const scored = rows
    .map((row) => ({ ...row, score: scoreEntry(row.name, row, tokens) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))

  return scored.slice(0, limit)
}

export function formatSearchResults(results, { json = false, siblingsByPath = null } = {}) {
  if (json) {
    const sibMap = siblingsByPath ?? {}
    return JSON.stringify(
      results.map(({ name, path, line, summary, chapter, kind, score }) => {
        const siblings = (sibMap[path] ?? []).filter((s) => s !== name)
        return {
          name,
          path,
          line,
          summary,
          chapter,
          kind,
          score,
          ...(siblings.length ? { siblings } : {})
        }
      }),
      null,
      2
    )
  }

  if (results.length === 0) {
    return '(no matches — try different keywords or Grep utilsDir for D2)'
  }

  const sibMap = siblingsByPath ?? {}
  return results
    .map((r) => {
      const summary = (r.summary || '').replace(/\s+/g, ' ').trim()
      const siblings = (sibMap[r.path] ?? []).filter((s) => s !== r.name)
      const sibHint = siblings.length ? ` (siblings: ${siblings.join(', ')})` : ''
      return `${r.name} @ ${r.path}:${r.line} — ${summary}${sibHint}`
    })
    .join('\n')
}

export function runSearch(cwd, query, options = {}) {
  const config = loadConfig(cwd)
  const index = loadUtilsIndex(config)
  const limit = options.limit ?? 8
  const results = searchUtilsIndex(index, query, { limit })
  return formatSearchResults(results, {
    json: options.json,
    siblingsByPath: index.siblingsByPath ?? null
  })
}
