#!/usr/bin/env node
/** Fail if package.json version drifts from changelog-gate.md latest release. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

const CHANGELOG_CANDIDATES = [
  path.join(root, 'docs/zh-CN/changelog-gate.md'),
  path.join(root, 'docs/en/changelog-gate.md')
]

function readExpectedVersionFromChangelog() {
  for (const changelogPath of CHANGELOG_CANDIDATES) {
    if (!fs.existsSync(changelogPath)) continue
    const match = fs.readFileSync(changelogPath, 'utf8').match(/^## v([\d.]+)\s*$/m)
    if (match) return match[1]
  }
  return null
}

const expected = readExpectedVersionFromChangelog()
if (!expected) {
  console.error('check-package-version: no ## vX.Y.Z heading in docs/*/changelog-gate.md')
  process.exit(1)
}

if (pkg.version !== expected) {
  console.error(`package.json version is ${pkg.version}, changelog expects ${expected}`)
  console.error(`Fix: npm version ${expected} --no-git-tag-version`)
  process.exit(1)
}

console.log(`check-package-version: OK (${pkg.version})`)
