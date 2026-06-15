import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { readGateFileHashes } from './gate-sync-manifest.mjs'
import { syncMergeableGateDocs } from './sync-docs.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_NAME = 'agent-utils-reuse'

/**
 * Paths (relative to templates/cursor or templates/docs) always refreshed on init
 * so upgrades apply without manual edits. Project-owned rules are NOT listed here.
 */
export const PACKAGE_RULE_FILES = [
  'workspace-agent-gate.mdc',
  'utils-reuse-gate.mdc',
  'code-before-edit.mdc',
  'reuse-first.mdc',
  'project-agent-gate.mdc'
]

export const PACKAGE_HOOK_FILES = [
  'check-discovery-before-shared-write.mjs',
  'read-audit-lib.mjs',
  'track-utils-reads.mjs',
  'track-utils-discovery.mjs',
  'track-utils-verdict.mjs'
]

export const MERGEABLE_GATE_DOC_FILES = ['placement-decision.md', 'MERGE-AGENTS.md', 'README.md']

/** @deprecated alias */
export const PACKAGE_DOC_FILES = MERGEABLE_GATE_DOC_FILES

export const KNOWN_OBSOLETE_BOOKRC_KEYS = [
  'discoveryCachePath',
  'discoveryCacheMaxAgeMinutes',
  'enforceCacheOrdering',
  'gateHeuristics',
  'gateRelaxedPath',
  'gateRelaxedMaxAgeMinutes',
  'readAuditPath',
  'enforceReadAudit',
  'gateTracePath',
  'enforceGateTraceFile',
  'displayAskPatterns',
  'requireAskOnDisplayPatterns',
  'utilsWiringProps',
  'featureDir',
  'gateApplicationCode',
  'gateFeatureDir',
  'gateExemptExtensions',
  'enforceGateTraceFile'
]

const BOOKRC_KEYS_FROM_PACKAGE = [
  'utilsDir',
  'catalogDir',
  'utilsBookDir',
  'skillsDir',
  'agentsFile',
  'jsdocTag',
  'remindWritePaths',
  'utilsImportAliases',
  'hookMode',
  'sourceGlobs',
  'installedPackageVersion',
  'projectRoot',
  'gateFileHashes'
]

export function resolveTemplatesRoot(projectRoot) {
  const fromNodeModules = path.join(projectRoot, 'node_modules', PACKAGE_NAME, 'templates')
  if (fs.existsSync(fromNodeModules)) return fromNodeModules

  const fromPackage = path.resolve(__dirname, '..', 'templates')
  if (fs.existsSync(fromPackage)) return fromPackage

  throw new Error(
    `${PACKAGE_NAME} not found in node_modules. Install first: pnpm add -D ${PACKAGE_NAME}`
  )
}

export function buildGateManagedRelPaths(config) {
  const paths = []
  for (const name of PACKAGE_RULE_FILES) {
    paths.push(`.cursor/rules/${name}`)
  }
  for (const name of PACKAGE_HOOK_FILES) {
    paths.push(`.cursor/hooks/${name}`)
  }
  paths.push(`${config.skillsDir}/reuse-before-create/SKILL.md`.replace(/\\/g, '/'))
  for (const name of MERGEABLE_GATE_DOC_FILES) {
    paths.push(`${config.catalogDir}/${name}`.replace(/\\/g, '/'))
  }
  paths.push('.cursor/hooks.json')
  paths.push('.utils-bookrc.json')
  return paths
}

/** @deprecated use buildGateManagedRelPaths */
export const GATE_MANAGED_REL_PATHS = null

export function pruneBookrcObsolete(projectRoot, { dryRun = false } = {}) {
  const configPath = path.join(projectRoot, '.utils-bookrc.json')
  if (!fs.existsSync(configPath)) return { removed: [], path: configPath }

  let raw = {}
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch {
    return { removed: [], path: configPath }
  }

  const allowed = new Set([...BOOKRC_KEYS_FROM_PACKAGE, 'projectAgentCoreRule'])
  const removed = []

  for (const key of Object.keys(raw)) {
    if (allowed.has(key)) continue
    if (KNOWN_OBSOLETE_BOOKRC_KEYS.includes(key) || !allowed.has(key)) {
      removed.push(key)
      delete raw[key]
    }
  }

  if (removed.length > 0 && !dryRun) {
    fs.writeFileSync(configPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8')
  }

  return { removed, path: configPath }
}

export function syncPackageFiles(templatesRoot, projectRoot, config, options = {}) {
  const {
    acceptUpstream = false,
    dryRun = false,
    docsMode = 'reinstall',
    gateFileHashes = null
  } = options
  let copied = 0
  const details = []

  const rulesDest = path.join(projectRoot, '.cursor', 'rules')
  const rulesSrc = path.join(templatesRoot, 'cursor', 'rules')
  for (const name of PACKAGE_RULE_FILES) {
    const from = path.join(rulesSrc, name)
    const to = path.join(rulesDest, name)
    if (!fs.existsSync(from)) continue
    if (!dryRun) {
      fs.mkdirSync(rulesDest, { recursive: true })
      fs.copyFileSync(from, to)
    }
    copied++
    details.push(`.cursor/rules/${name}`)
  }

  const hooksDest = path.join(projectRoot, '.cursor', 'hooks')
  const hooksSrc = path.join(templatesRoot, 'cursor', 'hooks')
  for (const name of PACKAGE_HOOK_FILES) {
    const from = path.join(hooksSrc, name)
    const to = path.join(hooksDest, name)
    if (!fs.existsSync(from)) continue
    if (!dryRun) {
      fs.mkdirSync(hooksDest, { recursive: true })
      fs.copyFileSync(from, to)
    }
    copied++
    details.push(`.cursor/hooks/${name}`)
  }

  const skillFrom = path.join(templatesRoot, 'cursor', 'skills', 'reuse-before-create', 'SKILL.md')
  const skillTo = path.join(projectRoot, config.skillsDir, 'reuse-before-create', 'SKILL.md')
  if (fs.existsSync(skillFrom)) {
    if (!dryRun) {
      fs.mkdirSync(path.dirname(skillTo), { recursive: true })
      fs.copyFileSync(skillFrom, skillTo)
    }
    copied++
    details.push(`${config.skillsDir}/reuse-before-create/SKILL.md`)
  }

  let hashes = gateFileHashes
  if (!hashes) {
    const configPath = path.join(projectRoot, '.utils-bookrc.json')
    if (fs.existsSync(configPath)) {
      try {
        hashes = readGateFileHashes(JSON.parse(fs.readFileSync(configPath, 'utf8')))
      } catch {
        hashes = {}
      }
    } else {
      hashes = {}
    }
  }

  const docsResult = syncMergeableGateDocs(templatesRoot, projectRoot, config, hashes, {
    mode: docsMode,
    acceptUpstream,
    dryRun
  })
  copied += docsResult.copied
  for (const rel of [...docsResult.created, ...docsResult.refreshed, ...docsResult.accepted]) {
    details.push(rel)
  }

  return {
    copied,
    details,
    docs: docsResult
  }
}

/**
 * Merge package defaults into existing .utils-bookrc.json (preserve project-only keys).
 */
export function mergeBookrc(projectRoot, defaults, { force = false } = {}) {
  const configPath = path.join(projectRoot, '.utils-bookrc.json')
  let existing = {}
  if (fs.existsSync(configPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    } catch {
      existing = {}
    }
  }

  const merged = { ...existing }
  for (const key of BOOKRC_KEYS_FROM_PACKAGE) {
    if (defaults[key] === undefined) continue
    if (force || merged[key] === undefined) {
      merged[key] = defaults[key]
    }
  }
  if (existing.projectAgentCoreRule !== undefined) {
    merged.projectAgentCoreRule = existing.projectAgentCoreRule
  }
  if (existing.gateFileHashes !== undefined && defaults.gateFileHashes === undefined) {
    merged.gateFileHashes = existing.gateFileHashes
  }

  fs.writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8')
  return { path: configPath, merged }
}
