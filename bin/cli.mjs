#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateUtilsBook } from '../lib/generate-utils-book.mjs'
import { loadConfig } from '../lib/load-config.mjs'
import { printInitSummary, runInit } from '../lib/init.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function parseFlags(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')))
  const positionals = argv.filter((a) => !a.startsWith('--'))
  const cwdIdx = positionals.indexOf('--cwd')
  let cwd = process.cwd()
  if (cwdIdx >= 0 && positionals[cwdIdx + 1]) {
    cwd = path.resolve(positionals[cwdIdx + 1])
  }
  return {
    command: positionals[0],
    cwd,
    yes: flags.has('--yes') || flags.has('-y'),
    force: flags.has('--force'),
    withExamples: flags.has('--with-examples'),
    check: flags.has('--check')
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
  console.log(`agent-utils-reuse — Utils reuse gate for AI coding agents

Usage:
  agent-utils-reuse init [--yes] [--force] [--with-examples]
  agent-utils-reuse gen [--check]
  agent-utils-reuse check

Commands:
  init   Copy templates, write .utils-bookrc.json, patch package.json & hooks
  gen    Scan utilsDir and generate utils-book
  check  Regenerate utils-book and git diff (CI gate)

Options:
  --yes            Non-interactive init with defaults
  --force          Overwrite existing template files
  --with-examples  Copy minimal array utils into utilsDir/array/
  --check          Fail gen if JSDoc coverage below 30%
`)
}

async function main() {
  const { command, cwd, yes, force, withExamples, check } = parseFlags(process.argv.slice(2))

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  if (command === 'init') {
    const result = runInit(cwd, { yes, force, withExamples })
    printInitSummary(result)
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
