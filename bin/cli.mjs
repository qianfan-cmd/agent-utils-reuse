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

  const acceptUpstream = flags.has('--accept-upstream') || flags.has('--force-docs')

  return {
    command: positionals[0],
    cwd,
    yes: flags.has('--yes') || flags.has('-y'),
    force: flags.has('--force'),
    acceptUpstream,
    forceDocs: flags.has('--force-docs'),
    withExamples: flags.has('--with-examples'),
    check: flags.has('--check'),
    dryRun: flags.has('--dry-run'),
    bump: flags.has('--bump'),
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
  agent-utils-reuse init [--yes] [--force] [--accept-upstream] [--with-examples]
  agent-utils-reuse update [--yes] [--dry-run] [--bump] [--tag <ref>] [--accept-upstream]
  agent-utils-reuse status
  agent-utils-reuse gen [--check]
  agent-utils-reuse check

Commands:
  init    First-time install — templates, AGENTS.md merge, .utils-bookrc.json, hooks
  update  Reinstall gate files from node_modules (no lockfile churn by default)
  status  Version drift, deprecated files, merge conflicts
  gen     Scan utilsDir and generate utils-book
  check   Regenerate utils-book and git diff (CI gate)

Options:
  --yes              Non-interactive defaults
  --force            Init: refresh AGENTS.md snippet + project-core inject
  --accept-upstream  Take package version for mergeable docs (skip manual merge)
  --force-docs       Alias for --accept-upstream
  --with-examples    Copy sample array utils into utilsDir/array
  --check            Fail gen if JSDoc coverage below 30%
  --bump             Run pnpm/npm add before gate reinstall (optional)
  --tag <ref>        Pin version when using --bump
  --dry-run          Report planned gate reinstall without writing
  --skip-bump        No-op (bump is already off by default; kept for compatibility)
  --version, -V      Print package version
`)
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--version') || argv.includes('-V')) {
    console.log(PACKAGE_VERSION)
    return
  }

  const {
    command,
    cwd,
    yes,
    force,
    acceptUpstream,
    forceDocs,
    withExamples,
    check,
    dryRun,
    bump,
    skipBump,
    tag
  } = parseFlags(argv)

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  if (command === 'init') {
    const result = runInit(cwd, { yes, force, withExamples, acceptUpstream, forceDocs })
    printInitSummary(result)
    return
  }

  if (command === 'update') {
    const result = runUpdate(cwd, {
      yes,
      tag,
      dryRun,
      bump,
      skipBump,
      acceptUpstream,
      forceDocs
    })
    printUpdateSummary(result)
    if (result.exitCode) {
      process.exit(result.exitCode)
    }
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
