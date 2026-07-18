#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { generateUtilsBook } from '../lib/generate-utils-book.mjs'
import { loadConfig } from '../lib/load-config.mjs'
import { runSearch } from '../lib/search-utils-index.mjs'
import { printInitSummary, runInit } from '../lib/init.mjs'
import { printStatusSummary, printUpdateSummary, printUpgradeSummary, printVerifySummary, runStatus, runUpdate, runUpgrade, runVerify } from '../lib/update.mjs'
import { formatIndexHealthSummary, verifyIndexHealth } from '../lib/index-health.mjs'
import { printUninstallSummary, runUninstall } from '../lib/uninstall-gate.mjs'
import { resolveAgentTargetsFromArgv } from '../lib/resolve-agent-targets.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_VERSION = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
).version

function parseFlags(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')))
  const positionals = argv.filter((a) => !a.startsWith('--'))

  let cwd = process.cwd()
  const cwdFlagIdx = argv.indexOf('--cwd')
  if (cwdFlagIdx >= 0 && argv[cwdFlagIdx + 1]) {
    cwd = path.resolve(argv[cwdFlagIdx + 1])
  }

  let tag = null
  const tagIdx = argv.indexOf('--tag')
  if (tagIdx >= 0 && argv[tagIdx + 1]) {
    tag = argv[tagIdx + 1]
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
    tag,
    json: flags.has('--json'),
    agentTargets: resolveAgentTargetsFromArgv(argv).targets,
    limit: (() => {
      const idx = positionals.indexOf('--limit')
      if (idx >= 0 && positionals[idx + 1]) {
        const n = parseInt(positionals[idx + 1], 10)
        return Number.isFinite(n) && n > 0 ? n : 8
      }
      return 8
    })()
  }
}

function runCheck(cwd) {
  const config = loadConfig(cwd)
  generateUtilsBook(config, { check: false })

  const bookDirRel = path.relative(config.projectRoot, config.bookDir).replace(/\\/g, '/')
  const indexRel = path
    .relative(config.projectRoot, config.indexFilePath)
    .replace(/\\/g, '/')

  for (const rel of [bookDirRel, indexRel]) {
    const result = spawnSync('git', ['diff', '--exit-code', rel], {
      cwd: config.projectRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    })
    if (result.status !== 0) {
      process.exit(result.status ?? 1)
    }
  }
}

function printHelp() {
  console.log(`agent-utils-reuse v${PACKAGE_VERSION} — Utils reuse gate for AI coding agents

Usage:
  agent-utils-reuse init [--yes] [--force] [--accept-upstream] [--with-examples] [--claude] [--codex] [--all]
  agent-utils-reuse upgrade [--yes] [--dry-run] [--tag <ref>] [--accept-upstream] [--claude] [--codex] [--all]
  agent-utils-reuse update [--yes] [--dry-run] [--bump] [--tag <ref>] [--accept-upstream] [--claude] [--codex] [--all]
  agent-utils-reuse status
  agent-utils-reuse verify
  agent-utils-reuse verify-index
  agent-utils-reuse gen [--check]
  agent-utils-reuse search "<query>" [--limit N] [--json]
  agent-utils-reuse verify-index
  agent-utils-reuse check
  agent-utils-reuse uninstall [--yes] [--dry-run] [--claude] [--codex] [--all]

Agent targets (default: cursor only):
  --cursor           Install/sync Cursor (.cursor/) — default when no IDE flag
  --claude           Include Claude Code (.claude/)
  --codex            Include OpenAI Codex (.codex/ + .agents/skills/)
  --all              cursor + claude + codex

Commands:
  init     First-time install — templates, AGENTS.md merge, .utils-bookrc.json, hooks
  upgrade  Recommended — resolve latest version, pnpm add, then sync gate files
  update   Reinstall gate files only (no lockfile churn; use for file: local dev)
  status  Version drift, gate verify, deprecated files, merge conflicts
  verify  Check overwrite-tier gate files match templates
  verify-index  Check utils-index.json exists and has symbols
  gen     Scan utilsDir and generate utils-book + utils-index.json
  search  Keyword search utils-index.json (Agent Discovery D1)
  check   Regenerate utils-book/index and git diff (CI gate)
  uninstall  Remove gate files, catalog, dependency, and merged AGENTS blocks

Options:
  --yes              Non-interactive defaults
  --force            Init: refresh AGENTS.md snippet + project-core inject
  --accept-upstream  Take package version for mergeable docs (skip manual merge)
  --force-docs       Alias for --accept-upstream
  --with-examples    Copy sample array utils into utilsDir/array
  --check            Fail gen if JSDoc coverage below 30%
  --limit <N>        search: max results (default 8)
  --json             search: JSON output
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
    tag,
    json,
    limit,
    agentTargets
  } = parseFlags(argv)

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  if (command === 'init') {
    const result = runInit(cwd, {
      yes,
      force,
      withExamples,
      acceptUpstream,
      forceDocs,
      targets: agentTargets
    })
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
      forceDocs,
      targets: agentTargets
    })
    printUpdateSummary(result)
    if (result.exitCode) {
      process.exit(result.exitCode)
    }
    return
  }

  if (command === 'upgrade') {
    const result = runUpgrade(cwd, {
      yes,
      tag,
      dryRun,
      acceptUpstream,
      forceDocs,
      targets: agentTargets
    })
    printUpgradeSummary(result)
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

  if (command === 'verify') {
    const result = runVerify(cwd, { targets: agentTargets })
    printVerifySummary(result)
    if (!result.verifyResult?.ok) {
      process.exit(1)
    }
    return
  }

  if (command === 'verify-index') {
    const config = loadConfig(cwd)
    const { health, ok } = verifyIndexHealth(config.projectRoot, config)
    for (const line of formatIndexHealthSummary(health)) {
      console.log(line)
    }
    if (!ok) {
      process.exit(1)
    }
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

  if (command === 'uninstall') {
    const result = await runUninstall(cwd, { yes, dryRun, targets: agentTargets })
    printUninstallSummary(result)
    return
  }

  if (command === 'search') {
    const queryParts = process.argv.slice(2).filter((a) => {
      if (a === 'search') return false
      if (a.startsWith('--')) return false
      return true
    })
    const query = queryParts.join(' ').trim()
    if (!query) {
      console.error('Usage: agent-utils-reuse search "<query>" [--limit N] [--json]')
      process.exit(1)
    }
    try {
      console.log(runSearch(cwd, query, { limit, json }))
    } catch (err) {
      console.error(err.message || err)
      process.exit(1)
    }
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
