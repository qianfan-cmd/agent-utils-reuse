#!/usr/bin/env node
/**
 * Tests for utils-index keyword search.
 * Usage: node scripts/test-search-utils-index.mjs [projectRoot]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateUtilsBook } from '../lib/generate-utils-book.mjs'
import { loadConfig } from '../lib/load-config.mjs'
import { searchUtilsIndex, loadUtilsIndex, runSearch } from '../lib/search-utils-index.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(__dirname, '..')

function resolveProjectRoot(arg) {
  if (arg) return path.resolve(arg)
  return path.resolve(pkgRoot, 'examples/minimal')
}

function assert(name, cond, detail = '') {
  if (!cond) {
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`)
    process.exitCode = 1
    return false
  }
  console.log(`OK: ${name}`)
  return true
}

const projectRoot = resolveProjectRoot(process.argv[2])
console.log(`Project root: ${projectRoot}`)

const config = loadConfig(projectRoot)
generateUtilsBook(config)

const index = loadUtilsIndex(config)
assert('index has symbols', index.symbols && Object.keys(index.symbols).length >= 3)
assert('index version', index.version === 1)

const sortResults = searchUtilsIndex(index, '排序 数组', { limit: 5 })
assert(
  'search 排序 finds sortAsc',
  sortResults.some((r) => r.name === 'sortAsc'),
  JSON.stringify(sortResults.map((r) => r.name))
)

const uniqueResults = searchUtilsIndex(index, 'uniqueByKey 去重', { limit: 5 })
assert(
  'search finds uniqueByKey',
  uniqueResults.some((r) => r.name === 'uniqueByKey'),
  JSON.stringify(uniqueResults.map((r) => r.name))
)

assert('limit respected', searchUtilsIndex(index, 'array', { limit: 1 }).length === 1)

const emptyResults = searchUtilsIndex(index, 'zzznotexist999', { limit: 5 })
assert('no match returns empty', emptyResults.length === 0)

const cliOut = runSearch(projectRoot, 'sortAsc', { limit: 3 })
assert('runSearch includes sortAsc', cliOut.includes('sortAsc'))
assert(
  'runSearch shows siblings hint for sortAsc',
  cliOut.includes('siblings:') && cliOut.includes('sortDesc'),
  cliOut
)

if (process.exitCode) {
  console.error('\nSome search tests failed.')
  process.exit(1)
}
console.log('\nAll search tests passed.')
