#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { generateUtilsBook } from '../lib/generate-utils-book.mjs'
import { loadConfig } from '../lib/load-config.mjs'
import { printInitSummary, runInit } from '../lib/init.mjs'
import { printStatusSummary, printUpdateSummary, runStatus, runUpdate } from '../lib/update.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_VERSION = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
).version

function parseFlags(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')))
  const positionals = argv.filter((a) => !a.startsWith('--'))
  const cwdIdx = positionals.indexOf('--cwd')
  let cwd = process.cwd()
  if (cwdIdx >= 0 && positionals[cwdIdx + 1]) {
    cwd = path.resolve(positionals[cwdIdx + 1])
  }

  let tag = null
  const tagIdx = positionals.indexOf('--tag')
  if (tagIdx >= 0 && positionals[tagIdx + 1]) {
    tag = positionals[tagIdx + 1]
  }

  return {
    command: positionals[0],
    cwd,
    yes: flags.has('--yes') || flags.has('-y'),
    force: flags.has('--force'),
    forceDocs: flags.has('--force-docs'),
    withExamples: flags.has('--with-examples'),
    check: flags.has('--check'),
    dryRun: flags.has('--dry-run'),
    skipBump: flags.has('--skip-bump'),
    tag
  }
}

function runCheck(cwd) {
  const config = loadConfig(cwd)
  generateUtilsBook(config, { check: false })

  const bookDirRel = path.relative(config.projectRoot, config.bookDir).replace(/\\/g, '/')
  const result = spawnSync('git', ['diff', '--exit-code', `${bookDirRel}/`], {
    cwd: config.projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function printHelp() {
  console.log(`agent-utils-reuse v${PACKAGE_VERSION} — Utils reuse gate for AI coding agents

Usage:
  agent-utils-reuse init [--yes] [--force] [--force-docs] [--with-examples]
  agent-utils-reuse update [--yes] [--tag <ref>] [--dry-run] [--skip-bump] [--force-docs]
  agent-utils-reuse status
  agent-utils-reuse gen [--check]
  agent-utils-reuse check

Commands:
  init    Copy templates, merge AGENTS.md, write .utils-bookrc.json, patch package.json & hooks
  update  Bump dependency, init --force, remove deprecated files, write version stamp
  status  Compare installed version, deprecated files, customized docs
  gen     Scan utilsDir and generate utils-book
  check   Regenerate utils-book and git diff (CI gate)

Options:
  --yes            Non-interactive init/update with defaults
  --force          Overwrite existing template files and refresh AGENTS.md snippet
  --force-docs     Overwrite package-managed docs even when customized
  --with-examples  Copy minimal array utils into utilsDir/array
  --check          Fail gen if JSDoc coverage below 30%
  --tag <ref>      Pin GitHub tag/commit or npm version for update bump
  --dry-run        Report planned update actions without writing files
  --skip-bump      Sync and cleanup only (skip pnpm/npm add)
  --version, -V    Print package version
`)
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--version') || argv.includes('-V')) {
    console.log(PACKAGE_VERSION)
    return
  }

  const { command, cwd, yes, force, forceDocs, withExamples, check, dryRun, skipBump, tag } =
    parseFlags(argv)

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  if (command === 'init') {
    const result = runInit(cwd, { yes, force, withExamples, forceDocs })
    printInitSummary(result)
    return
  }

  if (command === 'update') {
    const result = runUpdate(cwd, { yes, tag, dryRun, skipBump, forceDocs })
    printUpdateSummary(result)
    return
  }

  if (command === 'status') {
    const result = runStatus(cwd)
    printStatusSummary(result)
    return
  }

  if (command === 'gen') {
    const config = loadConfig(cwd)
    generateUtilsBook(config, { check })
    return
  }

  if (command === 'check') {
    runCheck(cwd)
    return
  }

  console.error(`Unknown command: ${command}`)
  printHelp()
  process.exit(1)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
