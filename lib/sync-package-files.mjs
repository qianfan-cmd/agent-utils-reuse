import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { readGateFileHashes } from './gate-sync-manifest.mjs'
import { syncMergeableGateDocs } from './sync-docs.mjs'
import { syncPackageFilesForTarget } from './install-agent-target.mjs'
import { PACKAGE_HOOK_WRAPPER_FILES, SHARED_HOOK_CORE_FILES } from './agent-targets.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_NAME = 'agent-utils-reuse'

/**
 * Paths (relative to templates/cursor or templates/docs) always refreshed on init
 * so upgrades apply without manual edits. Project-owned rules are NOT listed here.
 */
export const PACKAGE_RULE_FILES = [
  'workspace-agent-gate.mdc',
  'utils-reuse-gate.mdc',
  'pre-write-utils-checklist.mdc',
  'code-before-edit.mdc',
  'reuse-first.mdc',
  'project-agent-gate.mdc'
]

export const PACKAGE_HOOK_FILES = [
  ...PACKAGE_HOOK_WRAPPER_FILES,
  'read-audit-lib.mjs',
  ...SHARED_HOOK_CORE_FILES.map((n) => `_shared/${n}`)
]

export const MERGEABLE_GATE_DOC_FILES = [
  'placement-decision.md',
  'MERGE-AGENTS.md',
  'README.md',
  'BACKFILL-UTILS-BOOK.zh.md',
  'BACKFILL-UTILS-BOOK.en.md'
]

/** Written by `gen` — removed on uninstall with index/book. */
export const GATE_GENERATED_CATALOG_FILES = ['skills.md']

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
  'utilsIndexFile',
  'skillsDir',
  'agentsFile',
  'jsdocTag',
  'remindWritePaths',
  'utilsImportAliases',
  'hookMode',
  'sameTurnAllow',
  'maxImportSymbolsPerTurn',
  'agentsReadMode',
  'lightGatePaths',
  'searchSynonyms',
  'crossFileSiblingGroups',
  'requireDiscoveryForUtilGate',
  'preferCliSearch',
  'strictBatchLimit',
  'allowBusinessDiscovery',
  'sourceGlobs',
  'installedPackageVersion',
  'projectRoot',
  'gateFileHashes',
  'gateOverwriteHashes',
  'installedAgentTargets'
]

export function readDependencySpec(projectRoot) {
  const pkgPath = path.join(projectRoot, 'package.json')
  if (!fs.existsSync(pkgPath)) return null
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    return pkg.devDependencies?.[PACKAGE_NAME] ?? pkg.dependencies?.[PACKAGE_NAME] ?? null
  } catch {
    return null
  }
}

export function resolveLinkedPackageRoot(projectRoot, depSpec = null) {
  const spec = depSpec ?? readDependencySpec(projectRoot)
  if (!spec || !String(spec).startsWith('file:')) return null
  return path.resolve(projectRoot, String(spec).slice('file:'.length))
}

export function compareSemver(a, b) {
  const parse = (v) =>
    String(v ?? '0.0.0')
      .replace(/^v/, '')
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0)
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

function readPackageVersion(packageRoot) {
  const pkgPath = path.join(packageRoot, 'package.json')
  if (!fs.existsSync(pkgPath)) return null
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version ?? null
  } catch {
    return null
  }
}

/**
 * Resolve templates directory for gate sync.
 * @returns {{ templatesRoot: string, source: 'node_modules'|'file-link'|'package-dev', linkedVersion?: string|null, nodeModulesVersion?: string|null }}
 */
export function resolveTemplatesRootInfo(projectRoot) {
  const fromNodeModules = path.join(projectRoot, 'node_modules', PACKAGE_NAME, 'templates')
  const nodeModulesRoot = path.join(projectRoot, 'node_modules', PACKAGE_NAME)
  const nodeModulesVersion = fs.existsSync(nodeModulesRoot)
    ? readPackageVersion(nodeModulesRoot)
    : null

  const depSpec = readDependencySpec(projectRoot)
  const linkedRoot = resolveLinkedPackageRoot(projectRoot, depSpec)
  if (linkedRoot) {
    const linkedTemplates = path.join(linkedRoot, 'templates')
    const linkedVersion = readPackageVersion(linkedRoot)
    if (fs.existsSync(linkedTemplates)) {
      if (
        linkedVersion &&
        nodeModulesVersion &&
        compareSemver(linkedVersion, nodeModulesVersion) > 0
      ) {
        return {
          templatesRoot: linkedTemplates,
          source: 'file-link',
          linkedVersion,
          nodeModulesVersion
        }
      }
      if (linkedVersion && !nodeModulesVersion) {
        return {
          templatesRoot: linkedTemplates,
          source: 'file-link',
          linkedVersion,
          nodeModulesVersion: null
        }
      }
    }
  }

  if (fs.existsSync(fromNodeModules)) {
    return {
      templatesRoot: fromNodeModules,
      source: 'node_modules',
      linkedVersion: linkedRoot ? readPackageVersion(linkedRoot) : null,
      nodeModulesVersion
    }
  }

  const fromPackage = path.resolve(__dirname, '..', 'templates')
  if (fs.existsSync(fromPackage)) {
    return {
      templatesRoot: fromPackage,
      source: 'package-dev',
      linkedVersion: null,
      nodeModulesVersion
    }
  }

  throw new Error(
    `${PACKAGE_NAME} not found in node_modules. Install first: pnpm add -D ${PACKAGE_NAME}`
  )
}

export function resolveTemplatesRoot(projectRoot) {
  return resolveTemplatesRootInfo(projectRoot).templatesRoot
}

export function pruneOrphanHookFiles(projectRoot, targetId = 'cursor', { dryRun = false } = {}) {
  const agentDir = targetId === 'claude' ? '.claude' : targetId === 'codex' ? '.codex' : '.cursor'
  const hooksDir = path.join(projectRoot, agentDir, 'hooks')
  const removed = []
  if (!fs.existsSync(hooksDir)) return { removed }

  const allowed = new Set([...PACKAGE_HOOK_WRAPPER_FILES, 'read-audit-lib.mjs'])
  for (const name of SHARED_HOOK_CORE_FILES) {
    allowed.add(`_shared/${name}`)
  }
  const deprecatedHookNames = new Set(
    [
      '.cursor/hooks/discovery-cache-lib.mjs',
      '.cursor/hooks/record-utils-gate-audit.mjs'
    ].map((p) => path.basename(p))
  )

  for (const entry of fs.readdirSync(hooksDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue
    if (allowed.has(entry.name)) continue
    if (!deprecatedHookNames.has(entry.name)) continue
    const abs = path.join(hooksDir, entry.name)
    if (!dryRun) fs.unlinkSync(abs)
    removed.push(`${agentDir}/hooks/${entry.name}`)
  }

  return { removed }
}

export function buildGateManagedRelPaths(config, targets = ['cursor']) {
  const paths = []
  for (const targetId of targets) {
    if (targetId === 'cursor') {
      for (const name of PACKAGE_RULE_FILES) {
        paths.push(`.cursor/rules/${name}`)
      }
      for (const name of PACKAGE_HOOK_WRAPPER_FILES) {
        paths.push(`.cursor/hooks/${name}`)
      }
      for (const name of SHARED_HOOK_CORE_FILES) {
        paths.push(`.cursor/hooks/_shared/${name}`)
      }
      paths.push('.cursor/hooks/read-audit-lib.mjs')
      paths.push(`${config.skillsDir}/reuse-before-create/SKILL.md`.replace(/\\/g, '/'))
      paths.push('.cursor/hooks.json')
    }
    if (targetId === 'claude') {
      for (const name of PACKAGE_RULE_FILES) {
        paths.push(`.claude/rules/${name.replace(/\.mdc$/, '.md')}`)
      }
      for (const name of PACKAGE_HOOK_WRAPPER_FILES) {
        paths.push(`.claude/hooks/${name}`)
      }
      for (const name of SHARED_HOOK_CORE_FILES) {
        paths.push(`.claude/hooks/_shared/${name}`)
      }
      paths.push('.claude/skills/reuse-before-create/SKILL.md')
      paths.push('.claude/settings.json')
    }
    if (targetId === 'codex') {
      for (const name of PACKAGE_HOOK_WRAPPER_FILES) {
        paths.push(`.codex/hooks/${name}`)
      }
      for (const name of SHARED_HOOK_CORE_FILES) {
        paths.push(`.codex/hooks/_shared/${name}`)
      }
      paths.push('.agents/skills/reuse-before-create/SKILL.md')
      paths.push('.codex/hooks.json')
    }
  }
  for (const name of MERGEABLE_GATE_DOC_FILES) {
    paths.push(`${config.catalogDir}/${name}`.replace(/\\/g, '/'))
  }
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
    gateFileHashes = null,
    targets = ['cursor']
  } = options
  let copied = 0
  const details = []
  const targetResults = {}

  for (const targetId of targets) {
    const result = syncPackageFilesForTarget(templatesRoot, projectRoot, config, targetId, {
      dryRun
    })
    targetResults[targetId] = result
    copied += result.copied
    details.push(...result.details)
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
    docs: docsResult,
    targetResults
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
    // Preserve explicit hookMode across updates (opt-in confirm/remind).
    if (key === 'hookMode' && merged[key] !== undefined) continue
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
  if (existing.installedAgentTargets !== undefined && defaults.installedAgentTargets === undefined) {
    merged.installedAgentTargets = existing.installedAgentTargets
  }
  if (existing.gateOverwriteHashes !== undefined && defaults.gateOverwriteHashes === undefined) {
    merged.gateOverwriteHashes = existing.gateOverwriteHashes
  }

  fs.writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8')
  return { path: configPath, merged }
}
