import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { cleanupDeprecated } from './deprecated-files.mjs'
import { defaultConfigRaw, resolveConfig } from './load-config.mjs'
import { mergeAgentsMd, injectAgentsWorkflow, writeSnippetReference } from './merge-agents.mjs'
import { mergeProjectAgentCoreRule } from './merge-project-rule.mjs'
import {
  patchGitignore,
  patchHooksJson,
  patchPackageJson,
  readNodeModulesPackageVersion
} from './init.mjs'
import {
  compareSemver,
  mergeBookrc,
  pruneBookrcObsolete,
  pruneOrphanHookFiles,
  resolveTemplatesRootInfo,
  syncPackageFiles
} from './sync-package-files.mjs'
import { persistGateOverwriteHashes, verifyGateSync } from './verify-gate-sync.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function runGateReinstall(cwd, options = {}) {
  const { dryRun = false, acceptUpstream = false } = options
  const projectRoot = path.resolve(cwd)

  if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
    throw new Error('Run update from your project root (package.json required)')
  }

  const templatesInfo = resolveTemplatesRootInfo(projectRoot)
  const templatesRoot = templatesInfo.templatesRoot
  const raw = defaultConfigRaw()
  let configResult = null
  let pruneResult = { removed: [] }

  if (!dryRun) {
    configResult = mergeBookrc(projectRoot, raw, { force: true })
    pruneResult = pruneBookrcObsolete(projectRoot, { dryRun: false })
  }

  const configPath = path.join(projectRoot, '.utils-bookrc.json')
  let configRaw = defaultConfigRaw()
  if (fs.existsSync(configPath)) {
    configRaw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  }
  const config = resolveConfig(configRaw, projectRoot)

  const packageSync = syncPackageFiles(templatesRoot, projectRoot, config, {
    acceptUpstream,
    dryRun,
    docsMode: 'reinstall'
  })

  let orphanHooksResult = { removed: [] }

  let hooksPath = path.join(projectRoot, '.cursor', 'hooks.json')
  let agentsResult = { action: 'skipped' }
  let workflowResult = { injected: false }
  let projectRuleResult = { action: 'skipped' }
  let snippetRefPath = null
  let scripts = {}
  let gitignoreResult = { written: false }

  if (!dryRun) {
    hooksPath = patchHooksJson(projectRoot, templatesRoot, { force: true, hookMode: config.hookMode })
    gitignoreResult = patchGitignore(projectRoot)
    scripts = patchPackageJson(projectRoot, config)

    const snippetPath = path.join(templatesRoot, 'snippets', 'AGENTS.utils-reuse.md')
    const snippet = fs.readFileSync(snippetPath, 'utf8')

    agentsResult = mergeAgentsMd(projectRoot, config.agentsFile, snippet, { force: true })
    workflowResult = injectAgentsWorkflow(projectRoot, config.agentsFile, { force: true })

    const projectGateSnippetPath = path.join(templatesRoot, 'snippets', 'project-agent-gate.inject.md')
    const projectGateSnippet = fs.readFileSync(projectGateSnippetPath, 'utf8')
    projectRuleResult = mergeProjectAgentCoreRule(
      projectRoot,
      config.projectAgentCoreRule,
      projectGateSnippet,
      { force: true }
    )

    snippetRefPath = writeSnippetReference(path.join(projectRoot, config.catalogDir), snippet)
    orphanHooksResult = pruneOrphanHookFiles(projectRoot, { dryRun: false })
  }

  const cleanupResult = cleanupDeprecated(projectRoot, { dryRun })
  const newVersion = readNodeModulesPackageVersion(projectRoot)

  let verifyResult = { ok: true, stale: [], missing: [], checkedCount: 0, templateVersion: null }
  if (!dryRun) {
    verifyResult = verifyGateSync(templatesRoot, projectRoot, config)
    if (verifyResult.ok && verifyResult.overwriteHashes) {
      persistGateOverwriteHashes(projectRoot, verifyResult.overwriteHashes)
    }

    const stampVersion =
      templatesInfo.source === 'file-link' &&
      templatesInfo.linkedVersion &&
      templatesInfo.nodeModulesVersion &&
      compareSemver(templatesInfo.linkedVersion, templatesInfo.nodeModulesVersion) > 0
        ? templatesInfo.linkedVersion
        : verifyResult.templateVersion ?? newVersion

    if (stampVersion) {
      mergeBookrc(projectRoot, { installedPackageVersion: stampVersion }, { force: false })
    }
  }

  const conflicts = packageSync.docs?.conflicts ?? []

  let exitCode = 0
  if (conflicts.length > 0 && !acceptUpstream) {
    exitCode = 1
  } else if (!dryRun && !verifyResult.ok) {
    exitCode = 1
  }

  return {
    projectRoot,
    dryRun,
    acceptUpstream,
    templatesRoot,
    templatesInfo,
    config,
    configResult,
    pruneResult,
    packageSync,
    orphanHooksResult,
    hooksPath,
    gitignoreResult,
    agentsResult,
    workflowResult,
    projectRuleResult,
    snippetRefPath,
    scripts,
    cleanupResult,
    newVersion,
    verifyResult,
    conflicts,
    exitCode
  }
}

export function printGateReinstallSummary(result) {
  const {
    dryRun,
    packageSync,
    pruneResult,
    cleanupResult,
    orphanHooksResult,
    newVersion,
    verifyResult,
    templatesInfo,
    conflicts,
    agentsResult,
    hooksPath
  } = result

  console.log('')
  if (dryRun) {
    console.log('agent-utils-reuse update (dry-run) — gate reinstall only')
  } else if (conflicts?.length) {
    console.log(`agent-utils-reuse update complete (${conflicts.length} conflict(s))`)
  } else {
    console.log('agent-utils-reuse update complete — gate reinstalled')
  }
  console.log('')

  if (newVersion) {
    console.log(`  Package (node_modules): v${newVersion}`)
  }
  if (templatesInfo?.source === 'file-link') {
    console.log(
      `  Templates source: file-link (linked v${templatesInfo.linkedVersion ?? '?'}, node_modules v${templatesInfo.nodeModulesVersion ?? '?'})`
    )
  } else if (templatesInfo?.source) {
    console.log(`  Templates source: ${templatesInfo.source}`)
  }
  if (verifyResult?.templateVersion) {
    console.log(`  Templates version: v${verifyResult.templateVersion}`)
  }

  console.log(`  Gate files refreshed: ${packageSync?.copied ?? 0}`)
  if (packageSync?.details?.length) {
    for (const d of packageSync.details.slice(0, 10)) {
      console.log(`    - ${d}`)
    }
    if (packageSync.details.length > 10) {
      console.log(`    ... and ${packageSync.details.length - 10} more`)
    }
  }

  const docs = packageSync?.docs
  if (docs?.upToDate?.length) {
    console.log(`  Docs up-to-date: ${docs.upToDate.join(', ')}`)
  }

  if (conflicts?.length) {
    console.log('')
    console.log('  Conflicts (manual merge required):')
    for (const c of conflicts) {
      console.log(`    - ${c.relPath}`)
      console.log(`      upstream: ${c.sidecar}`)
      const base = path.basename(c.relPath)
      console.log(`      diff:     diff ${base} ${base}.utils-reuse-upstream`)
    }
    console.log('')
    console.log('  After merge: edit the file, delete .utils-reuse-upstream, run pnpm update:utils-reuse')
    console.log('  Or take package version: pnpm update:utils-reuse --accept-upstream')
  }

  if (pruneResult?.removed?.length) {
    console.log('')
    console.log(`  Pruned .utils-bookrc keys: ${pruneResult.removed.join(', ')}`)
  }

  if (cleanupResult?.removed?.length) {
    console.log('')
    console.log('  Deprecated removed:')
    for (const rel of cleanupResult.removed) {
      console.log(`    - ${rel}`)
    }
  }

  if (orphanHooksResult?.removed?.length) {
    console.log('')
    console.log('  Orphan hooks removed:')
    for (const rel of orphanHooksResult.removed) {
      console.log(`    - ${rel}`)
    }
  }

  if (!dryRun && verifyResult) {
    console.log('')
    if (verifyResult.ok) {
      console.log(`  Gate verify: OK (${verifyResult.checkedCount} overwrite files)`)
      if (
        templatesInfo?.linkedVersion &&
        templatesInfo?.nodeModulesVersion &&
        compareSemver(templatesInfo.linkedVersion, templatesInfo.nodeModulesVersion) > 0
      ) {
        console.log(
          '  Note: gate synced from file: link (newer than node_modules). Run pnpm add -D file:... when ready to refresh node_modules.'
        )
      }
    } else {
      console.log('  Gate verify: FAILED')
      if (verifyResult.missing?.length) {
        console.log(`    Missing: ${verifyResult.missing.join(', ')}`)
      }
      if (verifyResult.stale?.length) {
        console.log(`    Stale: ${verifyResult.stale.join(', ')}`)
      }
      if (verifyResult.gitignoreMissing?.length) {
        console.log(`    .gitignore missing: ${verifyResult.gitignoreMissing.join(', ')}`)
      }
      console.log('  Re-run: pnpm update:utils-reuse')
    }
  }

  if (!dryRun) {
    console.log('')
    console.log(`  Hooks:  ${hooksPath}`)
    if (agentsResult?.action) {
      console.log(`  AGENTS: ${agentsResult.action} ${agentsResult.path ?? ''}`)
    }
  }

  console.log('')
  console.log('Next steps:')
  console.log('  1. pnpm test:hooks      (optional smoke test)')
  console.log('  2. pnpm test:hook-discovery  (v0.2.0+ discovery gate)')
  if (conflicts?.length) {
    console.log('  3. Resolve merge conflicts above, then re-run update')
  } else if (verifyResult && !verifyResult.ok) {
    console.log('  3. Fix gate verify failures above, then re-run update')
  }
  console.log('')
}
