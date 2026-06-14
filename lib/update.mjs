import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import { cleanupDeprecated, scanDeprecated } from './deprecated-files.mjs'
import { listPendingConflicts, UPSTREAM_SIDECAR_SUFFIX } from './gate-sync-manifest.mjs'
import { loadConfig } from './load-config.mjs'
import { readNodeModulesPackageVersion } from './init.mjs'
import { printGateReinstallSummary, runGateReinstall } from './reinstall-gate.mjs'
import { listCustomizedDocs } from './sync-docs.mjs'
import {
  buildGateManagedRelPaths,
  MERGEABLE_GATE_DOC_FILES,
  resolveTemplatesRoot
} from './sync-package-files.mjs'

const PACKAGE_NAME = 'agent-utils-reuse'

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

function mergeableRelPaths(config) {
  return MERGEABLE_GATE_DOC_FILES.map(
    (name) => `${config.catalogDir}/${name}`.replace(/\\/g, '/')
  )
}

export function runUpdate(cwd, options = {}) {
  const {
    yes = false,
    tag = null,
    dryRun = false,
    bump = false,
    skipBump = false,
    acceptUpstream = false,
    forceDocs = false
  } = options
  const projectRoot = path.resolve(cwd)

  const accept = acceptUpstream || forceDocs
  const previousVersion = readInstalledStamp(projectRoot)
  const deprecatedBefore = scanDeprecated(projectRoot)

  let bumpResult = null
  if (bump && !skipBump) {
    bumpResult = bumpDependency(projectRoot, { tag, dryRun })
  }

  if (dryRun) {
    const config = loadConfig(projectRoot)
    let templatesRoot
    try {
      templatesRoot = resolveTemplatesRoot(projectRoot)
    } catch {
      templatesRoot = null
    }
    const customizedDocs = templatesRoot
      ? listCustomizedDocs(templatesRoot, projectRoot, config)
      : []
    const pendingConflicts = listPendingConflicts(projectRoot, mergeableRelPaths(config))

    return {
      projectRoot,
      dryRun: true,
      yes,
      previousVersion,
      nodeModulesVersion: readNodeModulesPackageVersion(projectRoot),
      bumpResult,
      deprecatedBefore,
      customizedDocs,
      pendingConflicts,
      acceptUpstream: accept
    }
  }

  const reinstallResult = runGateReinstall(projectRoot, {
    dryRun: false,
    acceptUpstream: accept
  })

  return {
    projectRoot,
    dryRun: false,
    yes,
    previousVersion,
    newVersion: reinstallResult.newVersion,
    bumpResult,
    reinstallResult,
    deprecatedBefore,
    exitCode: reinstallResult.exitCode
  }
}

export function printUpdateSummary(result) {
  if (result.dryRun) {
    printDryRunSummary(result)
    return
  }

  printGateReinstallSummary(result.reinstallResult)

  if (result.bumpResult && !result.bumpResult.skipped) {
    console.log(`  Bump: ${result.bumpResult.command}`)
  }
}

function printDryRunSummary(result) {
  const {
    previousVersion,
    nodeModulesVersion,
    bumpResult,
    deprecatedBefore,
    customizedDocs,
    pendingConflicts,
    acceptUpstream
  } = result

  console.log('')
  console.log('agent-utils-reuse update (dry-run) — gate reinstall only')
  console.log('')
  console.log(`  Version stamp: ${previousVersion ?? '(none)'}`)
  console.log(`  node_modules:  v${nodeModulesVersion ?? '(not installed)'}`)

  if (bumpResult) {
    console.log(`  Bump: would run \`${bumpResult.command}\``)
  } else {
    console.log('  Bump: skipped (use --bump to upgrade package first)')
  }

  if (deprecatedBefore.present.length) {
    console.log('  Deprecated files to remove:')
    for (const rel of deprecatedBefore.present) {
      console.log(`    - ${rel}`)
    }
  }

  if (pendingConflicts?.length) {
    console.log('  Pending merge conflicts (sidecar exists):')
    for (const rel of pendingConflicts) {
      console.log(`    - ${rel}`)
    }
  }

  if (customizedDocs.length && !acceptUpstream) {
    console.log('  Docs may conflict (local differs from template):')
    for (const rel of customizedDocs) {
      console.log(`    - ${rel}`)
    }
  }

  console.log('')
  console.log('  Re-run without --dry-run to reinstall gate files.')
  console.log('')
}

export function runStatus(cwd) {
  const projectRoot = path.resolve(cwd)
  const stampedVersion = readInstalledStamp(projectRoot)
  const nodeModulesVersion = readNodeModulesPackageVersion(projectRoot)
  const deprecated = scanDeprecated(projectRoot)
  const config = loadConfig(projectRoot)

  let customizedDocs = []
  let pendingConflicts = []
  try {
    const templatesRoot = resolveTemplatesRoot(projectRoot)
    customizedDocs = listCustomizedDocs(templatesRoot, projectRoot, config)
    pendingConflicts = listPendingConflicts(projectRoot, mergeableRelPaths(config))
  } catch {
    /* package not installed */
  }

  return {
    projectRoot,
    stampedVersion,
    nodeModulesVersion,
    deprecated,
    customizedDocs,
    pendingConflicts,
    inSync: stampedVersion && nodeModulesVersion && stampedVersion === nodeModulesVersion
  }
}

export function printStatusSummary(result) {
  const {
    stampedVersion,
    nodeModulesVersion,
    deprecated,
    customizedDocs,
    pendingConflicts,
    inSync
  } = result

  console.log('')
  console.log('agent-utils-reuse status')
  console.log('')
  console.log(`  Recorded version:  ${stampedVersion ?? '(none)'}`)
  console.log(`  node_modules:      ${nodeModulesVersion ?? '(not installed)'}`)

  if (stampedVersion && nodeModulesVersion && stampedVersion !== nodeModulesVersion) {
    console.log('  State: package newer than stamp — run: pnpm add -D ... then pnpm update:utils-reuse')
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

  if (pendingConflicts.length) {
    console.log('')
    console.log(`  Pending merge conflicts (${UPSTREAM_SIDECAR_SUFFIX} sidecar):`)
    for (const rel of pendingConflicts) {
      console.log(`    - ${rel}`)
    }
    console.log('  Merge locally or: pnpm update:utils-reuse --accept-upstream')
  }

  if (customizedDocs.length) {
    console.log('')
    console.log('  Docs differ from package template:')
    for (const rel of customizedDocs) {
      console.log(`    - ${rel}`)
    }
  }

  console.log('')
}
