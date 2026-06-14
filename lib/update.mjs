import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import { cleanupDeprecated, scanDeprecated } from './deprecated-files.mjs'
import { loadConfig } from './load-config.mjs'
import { printInitSummary, runInit } from './init.mjs'
import { listCustomizedDocs } from './sync-docs.mjs'
import { mergeBookrc } from './sync-package-files.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(__dirname, '..')
const PACKAGE_NAME = 'agent-utils-reuse'
const TEMPLATES_ROOT = path.join(PACKAGE_ROOT, 'templates')

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
  'projectRoot'
]

const KNOWN_OBSOLETE_BOOKRC_KEYS = [
  'discoveryCachePath',
  'enforceCacheOrdering',
  'gateHeuristics',
  'gateRelaxedPath',
  'readAuditPath',
  'enforceReadAudit',
  'gateTracePath',
  'enforceGateTraceFile',
  'displayAskPatterns',
  'requireAskOnDisplayPatterns',
  'utilsWiringProps'
]

export function detectPackageManager(projectRoot) {
  if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) return 'pnpm'
  if (fs.existsSync(path.join(projectRoot, 'yarn.lock'))) return 'yarn'
  if (fs.existsSync(path.join(projectRoot, 'package-lock.json'))) return 'npm'
  return 'npm'
}

function readProjectPackageJson(projectRoot) {
  const pkgPath = path.join(projectRoot, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    throw new Error('package.json not found in project root')
  }
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
}

function resolveDependencySpec(projectRoot, tag) {
  const pkg = readProjectPackageJson(projectRoot)
  const dep =
    pkg.devDependencies?.[PACKAGE_NAME] ??
    pkg.dependencies?.[PACKAGE_NAME] ??
    null

  if (dep && String(dep).startsWith('github:')) {
    const base = String(dep).split('#')[0]
    if (tag) return `${base}#${tag.replace(/^#/, '')}`
    if (String(dep).includes('#')) return dep
    return `${base}#main`
  }

  if (tag) {
    const versionTag = String(tag).replace(/^#/, '').replace(/^@/, '')
    return `${PACKAGE_NAME}@${versionTag}`
  }

  return `${PACKAGE_NAME}@latest`
}

export function bumpDependency(projectRoot, { tag, dryRun = false } = {}) {
  const pm = detectPackageManager(projectRoot)
  const spec = resolveDependencySpec(projectRoot, tag)
  const args =
    pm === 'yarn'
      ? ['add', '-D', spec]
      : pm === 'pnpm'
        ? ['add', '-D', spec]
        : ['install', '--save-dev', spec]

  if (dryRun) {
    return { pm, spec, command: `${pm} ${args.join(' ')}`, skipped: true }
  }

  const result = spawnSync(pm, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })

  if (result.status !== 0) {
    throw new Error(`${pm} ${args.join(' ')} failed with exit code ${result.status ?? 1}`)
  }

  return { pm, spec, command: `${pm} ${args.join(' ')}`, skipped: false }
}

export function readNodeModulesVersion(projectRoot) {
  const pkgPath = path.join(projectRoot, 'node_modules', PACKAGE_NAME, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    return null
  }
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version
}

export function writeInstalledPackageVersion(projectRoot, version, { dryRun = false } = {}) {
  if (!version) return null
  if (dryRun) {
    return { path: path.join(projectRoot, '.utils-bookrc.json'), version, dryRun: true }
  }
  return mergeBookrc(projectRoot, { installedPackageVersion: version }, { force: false })
}

export function detectUnusedBookrcKeys(projectRoot) {
  const configPath = path.join(projectRoot, '.utils-bookrc.json')
  if (!fs.existsSync(configPath)) return { unused: [], obsolete: [] }

  let raw = {}
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch {
    return { unused: [], obsolete: [] }
  }

  const allowed = new Set([...BOOKRC_KEYS_FROM_PACKAGE, 'projectAgentCoreRule'])
  const unused = []
  const obsolete = []

  for (const key of Object.keys(raw)) {
    if (KNOWN_OBSOLETE_BOOKRC_KEYS.includes(key)) {
      obsolete.push(key)
      continue
    }
    if (!allowed.has(key)) {
      unused.push(key)
    }
  }

  return { unused, obsolete }
}

function readInstalledStamp(projectRoot) {
  const configPath = path.join(projectRoot, '.utils-bookrc.json')
  if (!fs.existsSync(configPath)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    return raw.installedPackageVersion ?? null
  } catch {
    return null
  }
}

export function runUpdate(cwd, options = {}) {
  const {
    yes = false,
    tag = null,
    dryRun = false,
    skipBump = false,
    forceDocs = false
  } = options
  const projectRoot = path.resolve(cwd)

  const previousVersion = readInstalledStamp(projectRoot) ?? readNodeModulesVersion(projectRoot)
  const deprecatedBefore = scanDeprecated(projectRoot)

  let bumpResult = null
  if (!skipBump) {
    bumpResult = bumpDependency(projectRoot, { tag, dryRun })
  }

  const nodeModulesVersion = readNodeModulesVersion(projectRoot)
  const config = loadConfig(projectRoot)
  const customizedDocs = listCustomizedDocs(TEMPLATES_ROOT, projectRoot, config)

  if (dryRun) {
    return {
      projectRoot,
      dryRun: true,
      yes,
      previousVersion,
      nodeModulesVersion,
      bumpResult,
      deprecatedBefore,
      customizedDocs,
      forceDocs
    }
  }

  const initResult = runInit(projectRoot, {
    yes,
    force: true,
    forceDocs
  })

  const cleanupResult = cleanupDeprecated(projectRoot, { dryRun: false })
  const newVersion = readNodeModulesVersion(projectRoot)
  writeInstalledPackageVersion(projectRoot, newVersion)
  const bookrcWarnings = detectUnusedBookrcKeys(projectRoot)

  return {
    projectRoot,
    dryRun: false,
    yes,
    previousVersion,
    newVersion,
    bumpResult,
    initResult,
    cleanupResult,
    bookrcWarnings,
    customizedDocs: initResult.packageSync?.docs?.skippedCustomized ?? []
  }
}

export function printUpdateSummary(result) {
  const {
    dryRun,
    previousVersion,
    newVersion,
    nodeModulesVersion,
    bumpResult,
    deprecatedBefore,
    cleanupResult,
    initResult,
    bookrcWarnings,
    customizedDocs,
    forceDocs
  } = result

  console.log('')
  if (dryRun) {
    console.log('agent-utils-reuse update (dry-run)')
  } else {
    console.log('agent-utils-reuse update complete')
  }
  console.log('')

  if (previousVersion || newVersion || nodeModulesVersion) {
    const target = newVersion ?? nodeModulesVersion ?? '?'
    console.log(`  Version: ${previousVersion ?? '(none recorded)'} → ${target}`)
  }

  if (bumpResult) {
    if (bumpResult.skipped) {
      console.log(`  Bump: would run \`${bumpResult.command}\``)
    } else {
      console.log(`  Bump: ${bumpResult.command}`)
    }
  } else {
    console.log('  Bump: skipped (--skip-bump)')
  }

  if (dryRun) {
    if (deprecatedBefore.present.length) {
      console.log('  Deprecated files to remove:')
      for (const rel of deprecatedBefore.present) {
        console.log(`    - ${rel}`)
      }
    } else {
      console.log('  Deprecated files: none present')
    }

    if (customizedDocs.length && !forceDocs) {
      console.log('  Docs: would skip customized (merge manually):')
      for (const rel of customizedDocs) {
        console.log(`    - ${rel}`)
      }
      console.log(
        `    Hint: diff node_modules/${PACKAGE_NAME}/templates/docs/agent-catalog/ against your copy`
      )
    }

    console.log('')
    console.log('  Re-run without --dry-run to apply.')
    console.log('')
    return
  }

  if (initResult) {
    printInitSummary(initResult)
  }

  if (cleanupResult?.removed?.length) {
    console.log('  Deprecated removed:')
    for (const rel of cleanupResult.removed) {
      console.log(`    - ${rel}`)
    }
    console.log('')
  }

  const skipped = customizedDocs?.length
    ? customizedDocs
    : initResult?.packageSync?.docs?.skippedCustomized ?? []
  if (skipped.length && !forceDocs) {
    console.log('  Docs skipped (customized, merge manually):')
    for (const rel of skipped) {
      console.log(`    - ${rel}`)
    }
    console.log(
      `    Hint: diff node_modules/${PACKAGE_NAME}/templates/docs/agent-catalog/ against your copy`
    )
    console.log('    Use update --force-docs to overwrite package-managed docs.')
    console.log('')
  }

  const { obsolete = [], unused = [] } = bookrcWarnings ?? {}
  if (obsolete.length) {
    console.log(`  Obsolete keys in .utils-bookrc.json (safe to remove): ${obsolete.join(', ')}`)
  }
  if (unused.length) {
    console.log(`  Unrecognized keys in .utils-bookrc.json: ${unused.join(', ')}`)
  }
  if (obsolete.length || unused.length) {
    console.log('')
  }

  console.log('Next steps:')
  console.log('  1. pnpm gen:utils-book  (if utils or JSDoc changed)')
  console.log('  2. pnpm test:hooks      (optional smoke test)')
  console.log('')
}

export function runStatus(cwd) {
  const projectRoot = path.resolve(cwd)
  const stampedVersion = readInstalledStamp(projectRoot)
  const nodeModulesVersion = readNodeModulesVersion(projectRoot)
  const deprecated = scanDeprecated(projectRoot)
  const config = loadConfig(projectRoot)
  const customizedDocs = listCustomizedDocs(TEMPLATES_ROOT, projectRoot, config)
  const bookrcWarnings = detectUnusedBookrcKeys(projectRoot)

  return {
    projectRoot,
    stampedVersion,
    nodeModulesVersion,
    deprecated,
    customizedDocs,
    bookrcWarnings,
    inSync: stampedVersion && nodeModulesVersion && stampedVersion === nodeModulesVersion
  }
}

export function printStatusSummary(result) {
  const {
    stampedVersion,
    nodeModulesVersion,
    deprecated,
    customizedDocs,
    bookrcWarnings,
    inSync
  } = result

  console.log('')
  console.log('agent-utils-reuse status')
  console.log('')
  console.log(`  Recorded version:  ${stampedVersion ?? '(none)'}`)
  console.log(`  node_modules:      ${nodeModulesVersion ?? '(not installed)'}`)

  if (stampedVersion && nodeModulesVersion && stampedVersion !== nodeModulesVersion) {
    console.log('  State: OUT OF DATE — run pnpm update:utils-reuse')
  } else if (!stampedVersion && nodeModulesVersion) {
    console.log('  State: no version stamp — run pnpm update:utils-reuse')
  } else if (inSync) {
    console.log('  State: in sync')
  } else if (!nodeModulesVersion) {
    console.log('  State: package not installed')
  }

  if (deprecated.present.length) {
    console.log('')
    console.log('  Deprecated files still present:')
    for (const rel of deprecated.present) {
      console.log(`    - ${rel}`)
    }
    console.log('  Run: pnpm update:utils-reuse')
  }

  if (customizedDocs.length) {
    console.log('')
    console.log('  Customized package docs (diff from template):')
    for (const rel of customizedDocs) {
      console.log(`    - ${rel}`)
    }
  }

  const { obsolete = [], unused = [] } = bookrcWarnings
  if (obsolete.length || unused.length) {
    console.log('')
    if (obsolete.length) {
      console.log(`  Obsolete .utils-bookrc keys: ${obsolete.join(', ')}`)
    }
    if (unused.length) {
      console.log(`  Unrecognized .utils-bookrc keys: ${unused.join(', ')}`)
    }
  }

  console.log('')
}
