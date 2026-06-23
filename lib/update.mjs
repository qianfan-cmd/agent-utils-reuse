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
  compareSemver,
  MERGEABLE_GATE_DOC_FILES,
  readDependencySpec,
  resolveLinkedPackageRoot,
  resolveTemplatesRootInfo
} from './sync-package-files.mjs'
import { resolveUpgradeSpec } from './resolve-upgrade-spec.mjs'
import { verifyGateSync } from './verify-gate-sync.mjs'

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

export function bumpDependency(projectRoot, { tag, spec: directSpec, dryRun = false } = {}) {
  const pm = detectPackageManager(projectRoot)
  const spec = directSpec ?? resolveDependencySpec(projectRoot, tag)
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

export function runUpgrade(cwd, options = {}) {
  const {
    yes = false,
    tag = null,
    dryRun = false,
    acceptUpstream = false,
    forceDocs = false
  } = options
  const projectRoot = path.resolve(cwd)
  const accept = acceptUpstream || forceDocs
  const previousVersion = readInstalledStamp(projectRoot)
  const previousNodeModulesVersion = readNodeModulesPackageVersion(projectRoot)

  const upgradeSpecResult = resolveUpgradeSpec(projectRoot, { tag })

  let bumpResult = null
  if (!dryRun) {
    bumpResult = bumpDependency(projectRoot, { spec: upgradeSpecResult.spec, dryRun: false })
  } else {
    const pm = detectPackageManager(projectRoot)
    bumpResult = {
      pm,
      spec: upgradeSpecResult.spec,
      command: `${pm} add -D ${upgradeSpecResult.spec}`,
      skipped: true
    }
  }

  if (dryRun) {
    const updateDryRun = runUpdate(projectRoot, {
      yes,
      dryRun: true,
      acceptUpstream: accept,
      forceDocs
    })
    return {
      ...updateDryRun,
      mode: 'upgrade',
      previousNodeModulesVersion,
      upgradeSpecResult,
      bumpResult
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
    mode: 'upgrade',
    previousVersion,
    previousNodeModulesVersion,
    newVersion: reinstallResult.newVersion,
    upgradeSpecResult,
    bumpResult,
    reinstallResult,
    exitCode: reinstallResult.exitCode
  }
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
    let templatesInfo = null
    let verifyResult = null
    try {
      templatesInfo = resolveTemplatesRootInfo(projectRoot)
      verifyResult = verifyGateSync(templatesInfo.templatesRoot, projectRoot, config)
    } catch {
      templatesInfo = null
    }
    const customizedDocs = templatesInfo
      ? listCustomizedDocs(templatesInfo.templatesRoot, projectRoot, config)
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
      acceptUpstream: accept,
      templatesInfo,
      verifyResult
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

export function printUpgradeSummary(result) {
  if (result.dryRun) {
    printUpgradeDryRunSummary(result)
    return
  }

  const {
    previousVersion,
    previousNodeModulesVersion,
    newVersion,
    upgradeSpecResult,
    bumpResult,
    reinstallResult
  } = result

  console.log('')
  console.log('agent-utils-reuse upgrade — done')
  console.log('')

  const fromVer = previousNodeModulesVersion ?? previousVersion ?? '(unknown)'
  const toVer = newVersion ?? readNodeModulesPackageVersion(result.projectRoot) ?? '(unknown)'
  console.log(`  Package:  v${fromVer} → v${toVer}  (${upgradeSpecResult?.spec ?? bumpResult?.spec ?? ''})`)

  if (upgradeSpecResult?.warning) {
    console.log(`  Warning:  ${upgradeSpecResult.warning}`)
  }

  const verifyResult = reinstallResult?.verifyResult
  if (verifyResult?.ok) {
    console.log(`  Gate:     OK (${verifyResult.checkedCount} overwrite files)`)
  } else if (reinstallResult?.exitCode) {
    console.log('  Gate:     FAILED — see details below')
  }

  const conflicts = reinstallResult?.packageSync?.docs?.conflicts
  if (conflicts?.length) {
    console.log(`  Docs:     ${conflicts.length} merge conflict(s) — resolve sidecar files`)
  } else if (reinstallResult?.packageSync?.docs?.merged?.length) {
    console.log('  Docs:     merged from package template')
  } else {
    console.log('  Docs:     up-to-date or merge-tier unchanged')
  }

  if (bumpResult && !bumpResult.skipped) {
    console.log(`  Ran:      ${bumpResult.command}`)
  }

  if (reinstallResult?.exitCode) {
    printGateReinstallSummary(reinstallResult)
  }

  console.log('  Next (if needed):')
  console.log('    pnpm gen:utils-book')
  console.log('')
}

function printUpgradeDryRunSummary(result) {
  const { bumpResult, upgradeSpecResult, previousNodeModulesVersion } = result

  console.log('')
  console.log('agent-utils-reuse upgrade (dry-run)')
  console.log('')
  console.log(`  node_modules:  v${previousNodeModulesVersion ?? '(not installed)'}`)
  console.log(`  Current dep:   ${upgradeSpecResult?.previousDep ?? '(unknown)'}`)
  if (upgradeSpecResult?.resolvedTag) {
    console.log(`  Resolved tag:  ${upgradeSpecResult.resolvedTag}`)
  }
  if (upgradeSpecResult?.warning) {
    console.log(`  Warning:       ${upgradeSpecResult.warning}`)
  }
  console.log(`  Bump: would run \`${bumpResult?.command ?? '(none)'}\``)
  console.log('  Gate: would reinstall from node_modules after bump')
  console.log('')
}

function printDryRunSummary(result) {
  const {
    previousVersion,
    nodeModulesVersion,
    bumpResult,
    deprecatedBefore,
    customizedDocs,
    pendingConflicts,
    acceptUpstream,
    templatesInfo,
    verifyResult
  } = result

  console.log('')
  console.log('agent-utils-reuse update (dry-run) — gate reinstall only')
  console.log('')
  console.log(`  Version stamp: ${previousVersion ?? '(none)'}`)
  console.log(`  node_modules:  v${nodeModulesVersion ?? '(not installed)'}`)
  if (templatesInfo?.source === 'file-link') {
    console.log(
      `  Templates:     file-link v${templatesInfo.linkedVersion ?? '?'} (node_modules v${templatesInfo.nodeModulesVersion ?? '?'})`
    )
  }

  if (verifyResult) {
    if (verifyResult.ok) {
      console.log(`  Gate verify:   OK (${verifyResult.checkedCount} overwrite files)`)
    } else {
      console.log('  Gate verify:   DRIFT (will refresh on update)')
      if (verifyResult.missing?.length) {
        console.log(`    Missing: ${verifyResult.missing.join(', ')}`)
      }
      if (verifyResult.stale?.length) {
        console.log(`    Stale: ${verifyResult.stale.join(', ')}`)
      }
    }
  }

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

export function runVerify(cwd) {
  const projectRoot = path.resolve(cwd)
  const config = loadConfig(projectRoot)
  const templatesInfo = resolveTemplatesRootInfo(projectRoot)
  const verifyResult = verifyGateSync(templatesInfo.templatesRoot, projectRoot, config)
  const depSpec = readDependencySpec(projectRoot)
  const linkedRoot = resolveLinkedPackageRoot(projectRoot, depSpec)

  return {
    projectRoot,
    templatesInfo,
    verifyResult,
    linkedRoot,
    packageStale:
      linkedRoot &&
      templatesInfo.linkedVersion &&
      templatesInfo.nodeModulesVersion &&
      compareSemver(templatesInfo.linkedVersion, templatesInfo.nodeModulesVersion) > 0
  }
}

export function printVerifySummary(result) {
  const { verifyResult, templatesInfo, packageStale } = result

  console.log('')
  console.log('agent-utils-reuse verify')
  console.log('')

  if (templatesInfo?.source === 'file-link') {
    console.log(
      `  Templates: file-link v${templatesInfo.linkedVersion ?? '?'} (node_modules v${templatesInfo.nodeModulesVersion ?? '?'})`
    )
  } else {
    console.log(`  Templates source: ${templatesInfo?.source ?? 'unknown'}`)
  }

  if (verifyResult.templateVersion) {
    console.log(`  Template version: v${verifyResult.templateVersion}`)
  }

  if (verifyResult.ok) {
    console.log(`  Gate verify: OK (${verifyResult.checkedCount} overwrite files)`)
  } else {
    console.log('  Gate verify: FAILED')
    if (verifyResult.missing?.length) {
      console.log('  Missing:')
      for (const rel of verifyResult.missing) {
        console.log(`    - ${rel}`)
      }
    }
    if (verifyResult.stale?.length) {
      console.log('  Stale:')
      for (const rel of verifyResult.stale) {
        console.log(`    - ${rel}`)
      }
    }
    if (verifyResult.gitignoreMissing?.length) {
      console.log(`  .gitignore missing: ${verifyResult.gitignoreMissing.join(', ')}`)
    }
    console.log('')
    console.log('  Run: pnpm upgrade:utils-reuse  (or pnpm update:utils-reuse for gate-only sync)')
  }

  if (packageStale) {
    console.log('')
    console.log('  file: link is newer than node_modules — gate may match link after update.')
    console.log('  To refresh node_modules: pnpm add -D <your file: or github spec>')
  }

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
  let verifyResult = null
  let templatesInfo = null
  let packageStale = false

  try {
    templatesInfo = resolveTemplatesRootInfo(projectRoot)
    customizedDocs = listCustomizedDocs(templatesInfo.templatesRoot, projectRoot, config)
    pendingConflicts = listPendingConflicts(projectRoot, mergeableRelPaths(config))
    verifyResult = verifyGateSync(templatesInfo.templatesRoot, projectRoot, config)
    packageStale =
      templatesInfo.source === 'file-link' &&
      templatesInfo.linkedVersion &&
      templatesInfo.nodeModulesVersion &&
      compareSemver(templatesInfo.linkedVersion, templatesInfo.nodeModulesVersion) > 0
  } catch {
    /* package not installed */
  }

  const gateDrift = verifyResult ? !verifyResult.ok : null
  const inSync =
    stampedVersion &&
    nodeModulesVersion &&
    stampedVersion === nodeModulesVersion &&
    gateDrift === false

  return {
    projectRoot,
    stampedVersion,
    nodeModulesVersion,
    deprecated,
    customizedDocs,
    pendingConflicts,
    verifyResult,
    templatesInfo,
    gateDrift,
    packageStale,
    inSync
  }
}

export function printStatusSummary(result) {
  const {
    stampedVersion,
    nodeModulesVersion,
    deprecated,
    customizedDocs,
    pendingConflicts,
    verifyResult,
    templatesInfo,
    gateDrift,
    packageStale,
    inSync
  } = result

  console.log('')
  console.log('agent-utils-reuse status')
  console.log('')
  console.log(`  Recorded version:  ${stampedVersion ?? '(none)'}`)
  console.log(`  node_modules:      ${nodeModulesVersion ?? '(not installed)'}`)
  if (verifyResult?.templateVersion) {
    console.log(`  Template version:  v${verifyResult.templateVersion}`)
  }
  if (templatesInfo?.source === 'file-link') {
    console.log(
      `  Templates source:  file-link (linked v${templatesInfo.linkedVersion ?? '?'}, nm v${templatesInfo.nodeModulesVersion ?? '?'})`
    )
  }

  if (gateDrift === true) {
    console.log('  State: gate drift — overwrite files differ from template')
    console.log('  Run: pnpm upgrade:utils-reuse  (or pnpm update:utils-reuse for gate-only sync)')
    if (verifyResult?.stale?.length) {
      console.log(`    Stale: ${verifyResult.stale.slice(0, 5).join(', ')}${verifyResult.stale.length > 5 ? '...' : ''}`)
    }
    if (verifyResult?.missing?.length) {
      console.log(`    Missing: ${verifyResult.missing.join(', ')}`)
    }
  } else if (packageStale) {
    console.log('  State: file: link newer than node_modules')
    console.log('  Gate may sync from link on update; run pnpm add -D <spec> to refresh node_modules')
  } else if (
    stampedVersion &&
    nodeModulesVersion &&
    compareSemver(stampedVersion, nodeModulesVersion) > 0 &&
    gateDrift === false
  ) {
    console.log('  State: gate OK; stamp reflects synced templates (node_modules package.json is older)')
    console.log('  Optional: pnpm add -D <your file: or github spec> to align node_modules')
  } else if (
    stampedVersion &&
    nodeModulesVersion &&
    compareSemver(nodeModulesVersion, stampedVersion) > 0
  ) {
    console.log('  State: node_modules newer than stamp — run: pnpm upgrade:utils-reuse')
  } else if (stampedVersion && nodeModulesVersion && stampedVersion !== nodeModulesVersion) {
    console.log('  State: version stamp differs from node_modules — run: pnpm upgrade:utils-reuse')
  } else if (!stampedVersion && nodeModulesVersion) {
    console.log('  State: no version stamp — run pnpm upgrade:utils-reuse')
  } else if (inSync) {
    console.log('  State: in sync (version stamp + gate verify OK)')
  } else if (gateDrift === false && stampedVersion && nodeModulesVersion) {
    console.log('  State: gate OK; version stamp matches node_modules')
  } else if (!nodeModulesVersion) {
    console.log('  State: package not installed')
  }

  if (deprecated.present.length) {
    console.log('')
    console.log('  Deprecated files still present:')
    for (const rel of deprecated.present) {
      console.log(`    - ${rel}`)
    }
    console.log('  Run: pnpm upgrade:utils-reuse')
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
  console.log('  Tip: pnpm upgrade:utils-reuse — latest package + gate sync')
  console.log('       pnpm update:utils-reuse — gate-only (file: local dev)')
  console.log('       agent-utils-reuse verify — detailed gate file check')
  console.log('')
}
