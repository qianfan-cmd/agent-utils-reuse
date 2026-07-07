import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

import { readHooksFragment, serializeHooksJson } from './build-hooks-json.mjs'
import { DEPRECATED_PATHS } from './deprecated-files.mjs'
import { UPSTREAM_SIDECAR_SUFFIX } from './gate-sync-manifest.mjs'
import { GITIGNORE_AUDIT_LINES } from './gitignore-audit.mjs'
import { CONFIG_FILENAME, loadConfig } from './load-config.mjs'
import {
  AGENTS_BLOCK_END,
  AGENTS_BLOCK_START,
  stripWorkflowInjectBlocks,
  WORKFLOW_INJECT_LINE,
  WORKFLOW_SECTION_SKELETON
} from './merge-agents.mjs'
import {
  PROJECT_GATE_BLOCK_END,
  PROJECT_GATE_BLOCK_START
} from './merge-project-rule.mjs'
import {
  GATE_GENERATED_CATALOG_FILES,
  MERGEABLE_GATE_DOC_FILES,
  resolveTemplatesRoot
} from './sync-package-files.mjs'

const PACKAGE_NAME = 'agent-utils-reuse'

/** Scripts added by init — removed on uninstall only. */
export const GATE_PACKAGE_SCRIPTS = [
  'gen:utils-book',
  'check:utils-book',
  'upgrade:utils-reuse',
  'update:utils-reuse',
  'uninstall:utils-reuse'
]

const SESSION_AUDIT_REL_PATHS = [
  '.cursor/.utils-gate-reads.json',
  '.cursor/.utils-gate-verdict.json',
  '.cursor/.utils-gate-discovery.json',
  '.cursor/.utils-gate-agents-read.json',
  '.cursor/.utils-gate-hook-debug.log'
]

function walkRelFiles(dir, baseDir = dir) {
  const relPaths = []
  if (!fs.existsSync(dir)) return relPaths
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      relPaths.push(...walkRelFiles(abs, baseDir))
    } else {
      relPaths.push(path.relative(baseDir, abs).replace(/\\/g, '/'))
    }
  }
  return relPaths
}

/** Mirror init copyDir(templates/cursor → .cursor) for uninstall. */
export function listGateCursorInstallRelPaths(templatesRoot) {
  const cursorSrc = path.join(templatesRoot, 'cursor')
  const rels = walkRelFiles(cursorSrc, cursorSrc)
  return rels.map((rel) => `.cursor/${rel}`)
}

export function buildUninstallFileList(projectRoot, config, templatesRoot) {
  const relPaths = new Set()

  for (const rel of listGateCursorInstallRelPaths(templatesRoot)) {
    relPaths.add(rel)
  }

  const skillRel = `${config.skillsDir}/reuse-before-create/SKILL.md`.replace(/\\/g, '/')
  relPaths.add(skillRel)

  for (const name of MERGEABLE_GATE_DOC_FILES) {
    relPaths.add(`${config.catalogDir}/${name}`.replace(/\\/g, '/'))
  }

  relPaths.add(`${config.catalogDir}/AGENTS.utils-reuse.snippet.md`.replace(/\\/g, '/'))
  for (const name of GATE_GENERATED_CATALOG_FILES) {
    relPaths.add(`${config.catalogDir}/${name}`.replace(/\\/g, '/'))
  }
  relPaths.add(config.utilsIndexFile.replace(/\\/g, '/'))
  relPaths.add(CONFIG_FILENAME)

  for (const rel of DEPRECATED_PATHS) {
    relPaths.add(rel)
  }

  for (const rel of SESSION_AUDIT_REL_PATHS) {
    relPaths.add(rel)
  }

  const catalogAbs = path.join(projectRoot, config.catalogDir)
  if (fs.existsSync(catalogAbs)) {
    for (const entry of fs.readdirSync(catalogAbs, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(UPSTREAM_SIDECAR_SUFFIX)) {
        relPaths.add(`${config.catalogDir}/${entry.name}`.replace(/\\/g, '/'))
      }
    }
  }

  return [...relPaths].sort()
}

export function stripAgentsGateContent(content) {
  let next = content
  const startIdx = next.indexOf(AGENTS_BLOCK_START)
  const endIdx = next.indexOf(AGENTS_BLOCK_END)
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    next = next.slice(0, startIdx) + next.slice(endIdx + AGENTS_BLOCK_END.length)
  }
  next = stripWorkflowInjectBlocks(next)
  next = next.split(WORKFLOW_SECTION_SKELETON).join('')
  const escapedLine = WORKFLOW_INJECT_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  next = next.replace(new RegExp(`\\s*${escapedLine}\\s*\\n?`, 'g'), '\n')
  return next.replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '\n')
}

/**
 * @returns {{ action: string, path: string, reason?: string }}
 */
export function unmergeAgentsMd(projectRoot, agentsFile, { dryRun = false } = {}) {
  const agentsPath = path.join(projectRoot, agentsFile)
  if (!fs.existsSync(agentsPath)) {
    return { action: 'skipped', path: agentsPath, reason: 'missing-agents' }
  }

  const existing = fs.readFileSync(agentsPath, 'utf8')
  const hadMarker =
    existing.includes(AGENTS_BLOCK_START) ||
    existing.includes(WORKFLOW_INJECT_LINE) ||
    existing.includes(WORKFLOW_SECTION_SKELETON.trim())

  if (!hadMarker) {
    return { action: 'skipped', path: agentsPath, reason: 'no-gate-markers' }
  }

  const stripped = stripAgentsGateContent(existing)
  if (!dryRun) {
    fs.writeFileSync(agentsPath, stripped.endsWith('\n') ? stripped : `${stripped}\n`, 'utf8')
  }
  return { action: 'stripped', path: agentsPath }
}

/**
 * @returns {{ action: string, path: string, reason?: string }}
 */
export function unmergeProjectAgentCoreRule(projectRoot, ruleRelPath, { dryRun = false } = {}) {
  if (!ruleRelPath) {
    return { action: 'skipped', path: '', reason: 'no-projectAgentCoreRule' }
  }

  const rulePath = path.join(projectRoot, ruleRelPath.replace(/\\/g, '/'))
  if (!fs.existsSync(rulePath)) {
    return { action: 'skipped', path: rulePath, reason: 'rule-file-missing' }
  }

  let content = fs.readFileSync(rulePath, 'utf8')
  const startIdx = content.indexOf(PROJECT_GATE_BLOCK_START)
  const endIdx = content.indexOf(PROJECT_GATE_BLOCK_END)
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return { action: 'skipped', path: rulePath, reason: 'no-gate-markers' }
  }

  const before = content.slice(0, startIdx)
  const after = content.slice(endIdx + PROJECT_GATE_BLOCK_END.length)
  content = `${before}${after}`.replace(/\n{3,}/g, '\n\n')
  if (!dryRun) {
    fs.writeFileSync(rulePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
  }
  return { action: 'stripped', path: rulePath }
}

export function stripGateHooksFromHooksJson(existing, fragment) {
  const gateCommands = new Set()
  for (const list of Object.values(fragment.hooks ?? {})) {
    if (!Array.isArray(list)) continue
    for (const entry of list) {
      if (entry?.command) gateCommands.add(entry.command)
    }
  }

  const hookKeys = [
    'sessionStart',
    'preToolUse',
    'postToolUse',
    'afterAgentResponse',
    'afterAgentThought'
  ]

  const base =
    existing && typeof existing === 'object' ? JSON.parse(JSON.stringify(existing)) : { version: 1, hooks: {} }
  if (!base.hooks) base.hooks = {}
  if (!base.version) base.version = 1

  for (const key of hookKeys) {
    const current = Array.isArray(base.hooks[key]) ? base.hooks[key] : []
    const filtered = current.filter((entry) => !gateCommands.has(entry?.command))
    if (filtered.length > 0) {
      base.hooks[key] = filtered
    } else {
      delete base.hooks[key]
    }
  }

  return base
}

export function removeGatePackageScripts(pkg) {
  const next = { ...pkg, scripts: { ...(pkg.scripts ?? {}) } }
  for (const name of GATE_PACKAGE_SCRIPTS) {
    delete next.scripts[name]
  }
  if (Object.keys(next.scripts).length === 0) {
    delete next.scripts
  }
  return next
}

export function removeGateDependency(pkg) {
  const next = { ...pkg }
  if (next.dependencies?.[PACKAGE_NAME]) {
    next.dependencies = { ...next.dependencies }
    delete next.dependencies[PACKAGE_NAME]
    if (Object.keys(next.dependencies).length === 0) delete next.dependencies
  }
  if (next.devDependencies?.[PACKAGE_NAME]) {
    next.devDependencies = { ...next.devDependencies }
    delete next.devDependencies[PACKAGE_NAME]
    if (Object.keys(next.devDependencies).length === 0) delete next.devDependencies
  }
  return next
}

export function unpatchGitignore(projectRoot, { dryRun = false } = {}) {
  const gitignorePath = path.join(projectRoot, '.gitignore')
  if (!fs.existsSync(gitignorePath)) {
    return { modified: false, path: gitignorePath, removed: [] }
  }

  const lines = fs.readFileSync(gitignorePath, 'utf8').split(/\r?\n/)
  const removed = []
  const kept = []
  for (const line of lines) {
    if (GITIGNORE_AUDIT_LINES.includes(line)) {
      removed.push(line)
      continue
    }
    kept.push(line)
  }

  if (removed.length === 0) {
    return { modified: false, path: gitignorePath, removed }
  }

  let content = kept.join('\n')
  if (content.length > 0 && !content.endsWith('\n')) content += '\n'
  if (!dryRun) {
    fs.writeFileSync(gitignorePath, content, 'utf8')
  }
  return { modified: true, path: gitignorePath, removed }
}

function removeFileIfExists(projectRoot, rel, dryRun) {
  const abs = path.join(projectRoot, rel)
  if (!fs.existsSync(abs)) return null
  if (!dryRun) {
    fs.unlinkSync(abs)
  }
  return rel
}

function removeDirIfExists(projectRoot, rel, dryRun) {
  const abs = path.join(projectRoot, rel)
  if (!fs.existsSync(abs)) return null
  if (!dryRun) {
    fs.rmSync(abs, { recursive: true, force: true })
  }
  return rel
}

/** Basenames under catalogDir that uninstall removes (files + utils-book dir). */
export function listCatalogUninstallBasenames(config) {
  const names = new Set()
  for (const name of MERGEABLE_GATE_DOC_FILES) names.add(name)
  names.add('AGENTS.utils-reuse.snippet.md')
  for (const name of GATE_GENERATED_CATALOG_FILES) names.add(name)
  names.add(path.basename(config.utilsIndexFile.replace(/\\/g, '/')))
  names.add(path.basename(config.utilsBookDir.replace(/\\/g, '/')))
  return names
}

async function confirmProceed(summaryLines, yes) {
  if (yes) return true
  console.log('')
  for (const line of summaryLines) {
    console.log(line)
  }
  console.log('')
  const rl = readline.createInterface({ input, output })
  const answer = await rl.question('Proceed with uninstall? [y/N] ')
  rl.close()
  return /^y(es)?$/i.test(answer.trim())
}

export async function runUninstall(cwd, options = {}) {
  const { yes = false, dryRun = false } = options
  const projectRoot = path.resolve(cwd)
  const pkgPath = path.join(projectRoot, 'package.json')

  if (!fs.existsSync(pkgPath)) {
    throw new Error('Run uninstall from your project root (package.json required)')
  }

  let config
  let gateInstalled = fs.existsSync(path.join(projectRoot, CONFIG_FILENAME))
  try {
    config = loadConfig(projectRoot)
  } catch {
    config = {
      projectRoot,
      catalogDir: 'docs/agent-catalog',
      utilsBookDir: 'docs/agent-catalog/utils-book',
      utilsIndexFile: 'docs/agent-catalog/utils-index.json',
      skillsDir: '.cursor/skills',
      agentsFile: 'AGENTS.md',
      projectAgentCoreRule: null
    }
    gateInstalled = false
  }

  const templatesRoot = resolveTemplatesRoot(projectRoot)
  const fileList = buildUninstallFileList(projectRoot, config, templatesRoot)
  const catalogUninstallNames = listCatalogUninstallBasenames(config)
  const bookDirRel = config.utilsBookDir.replace(/\\/g, '/')

  const summaryLines = [
    'agent-utils-reuse uninstall — planned changes:',
    `  Project: ${projectRoot}`,
    dryRun ? '  Mode: dry-run (no writes)' : '  Mode: apply',
    gateInstalled ? '  Gate config: .utils-bookrc.json found' : '  Gate config: not found (will still clean known paths)',
    `  Files/dirs to remove: ${fileList.length} path(s) + utils-book dir`,
    '  package.json: remove agent-utils-reuse dependency + gate scripts',
    '  AGENTS.md / project rule: strip marker blocks only'
  ]

  const proceed = await confirmProceed(summaryLines, yes || dryRun)
  if (!proceed) {
    return { projectRoot, aborted: true, dryRun, gateInstalled }
  }

  const removed = []
  const skipped = []
  const modified = []
  const warnings = []

  for (const rel of fileList) {
    if (rel === bookDirRel) continue
    const abs = path.join(projectRoot, rel)
    if (!fs.existsSync(abs)) continue
    const stat = fs.statSync(abs)
    if (stat.isDirectory()) continue
    const done = removeFileIfExists(projectRoot, rel, dryRun)
    if (done) removed.push(done)
  }

  const bookRemoved = removeDirIfExists(projectRoot, bookDirRel, dryRun)
  if (bookRemoved) removed.push(bookRemoved)

  const catalogAbs = path.join(projectRoot, config.catalogDir)
  if (fs.existsSync(catalogAbs)) {
    const remaining = fs.readdirSync(catalogAbs)
    const unknown = remaining.filter((name) => {
      if (catalogUninstallNames.has(name)) return false
      if (name.endsWith(UPSTREAM_SIDECAR_SUFFIX)) return false
      return true
    })
    if (unknown.length > 0) {
      warnings.push(
        `catalogDir has non-gate files (kept): ${unknown.map((n) => `${config.catalogDir}/${n}`).join(', ')}`
      )
    } else if (!dryRun) {
      try {
        const entries = fs.readdirSync(catalogAbs)
        if (entries.length === 0) {
          fs.rmdirSync(catalogAbs)
          removed.push(config.catalogDir.replace(/\\/g, '/'))
        }
      } catch {
        /* keep catalog dir if not empty */
      }
    }
  }

  const agentsResult = unmergeAgentsMd(projectRoot, config.agentsFile, { dryRun })
  if (agentsResult.action === 'stripped') {
    modified.push(agentsResult.path.replace(/\\/g, '/'))
  } else if (agentsResult.reason === 'no-gate-markers') {
    skipped.push(`${config.agentsFile} (no markers)`)
  }

  const ruleResult = unmergeProjectAgentCoreRule(projectRoot, config.projectAgentCoreRule, { dryRun })
  if (ruleResult.action === 'stripped') {
    modified.push(ruleResult.path.replace(projectRoot, '').replace(/^[/\\]/, '').replace(/\\/g, '/'))
  }

  const hooksPath = path.join(projectRoot, '.cursor', 'hooks.json')
  if (fs.existsSync(hooksPath) && templatesRoot) {
    try {
      const fragment = readHooksFragment(templatesRoot)
      const existing = JSON.parse(fs.readFileSync(hooksPath, 'utf8'))
      const stripped = stripGateHooksFromHooksJson(existing, fragment)
      if (!dryRun) {
        fs.writeFileSync(hooksPath, serializeHooksJson(stripped), 'utf8')
      }
      modified.push('.cursor/hooks.json')
    } catch (err) {
      warnings.push(`hooks.json: ${err.message}`)
    }
  }

  const gitignoreResult = unpatchGitignore(projectRoot, { dryRun })
  if (gitignoreResult.modified) {
    modified.push('.gitignore')
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  let nextPkg = removeGatePackageScripts(pkg)
  nextPkg = removeGateDependency(nextPkg)
  if (!dryRun) {
    fs.writeFileSync(pkgPath, `${JSON.stringify(nextPkg, null, 2)}\n`, 'utf8')
  }
  modified.push('package.json')

  return {
    projectRoot,
    aborted: false,
    dryRun,
    gateInstalled,
    removed,
    modified,
    skipped,
    warnings
  }
}

export function printUninstallSummary(result) {
  if (result.aborted) {
    console.log('')
    console.log('agent-utils-reuse uninstall aborted.')
    return
  }

  console.log('')
  console.log(result.dryRun ? 'agent-utils-reuse uninstall (dry-run) complete' : 'agent-utils-reuse uninstall complete')
  console.log('')

  if (result.removed.length) {
    console.log(`  Removed (${result.removed.length}):`)
    for (const rel of result.removed.slice(0, 20)) {
      console.log(`    - ${rel}`)
    }
    if (result.removed.length > 20) {
      console.log(`    ... and ${result.removed.length - 20} more`)
    }
  } else {
    console.log('  Removed: (none — gate may already be uninstalled)')
  }

  if (result.modified.length) {
    console.log(`  Modified: ${result.modified.join(', ')}`)
  }

  if (result.skipped.length) {
    console.log(`  Skipped: ${result.skipped.join(', ')}`)
  }

  if (result.warnings.length) {
    console.log('  Warnings:')
    for (const w of result.warnings) {
      console.log(`    - ${w}`)
    }
  }

  if (!result.dryRun) {
    console.log('')
    console.log('  Next: run pnpm install (or npm install) to refresh the lockfile.')
    console.log('  src/utils @utils-book JSDoc comments were not removed.')
  }
}
