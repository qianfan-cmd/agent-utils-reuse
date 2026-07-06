#!/usr/bin/env node
/**
 * Ensure templates/docs/agent-catalog/README.md matches docs/agent-catalog/README.md (SSoT drift check).
 * Usage: node scripts/check-doc-ssot.mjs
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const pairs = [
  ['templates/docs/agent-catalog/README.md', 'docs/agent-catalog/README.md']
]

let failed = false

for (const [a, b] of pairs) {
  const pa = path.join(root, a)
  const pb = path.join(root, b)
  if (!fs.existsSync(pa)) {
    console.error(`Missing: ${a}`)
    failed = true
    continue
  }
  if (!fs.existsSync(pb)) {
    console.error(`Missing: ${b} — copy from ${a}`)
    failed = true
    continue
  }
  const ha = crypto.createHash('sha256').update(fs.readFileSync(pa)).digest('hex')
  const hb = crypto.createHash('sha256').update(fs.readFileSync(pb)).digest('hex')
  if (ha !== hb) {
    console.error(`Drift: ${a} ≠ ${b}`)
    console.error(`  Fix: Copy-Item templates/... to docs/agent-catalog/`)
    failed = true
  } else {
    console.log(`OK: ${a} ≡ ${b}`)
  }
}

if (failed) process.exit(1)
console.log('Doc SSoT check passed.')
