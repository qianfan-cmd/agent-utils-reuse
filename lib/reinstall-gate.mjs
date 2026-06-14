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
  mergeBookrc,
  pruneBookrcObsolete,
  resolveTemplatesRoot,
  syncPackageFiles
} from './sync-package-files.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function runGateReinstall(cwd, options = {}) {
  const { dryRun = false, acceptUpstream = false } = options
  const projectRoot = path.resolve(cwd)

  if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
    throw new Error('Run update from your project root (package.json required)')
  }

  const templatesRoot = resolveTemplatesRoot(projectRoot)
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

  let hooksPath = path.join(projectRoot, '.cursor', 'hooks.json')
  let agentsResult = { action: 'skipped' }
  let workflowResult = { injected: false }
  let projectRuleResult = { action: 'skipped' }
  let snippetRefPath = null
  let scripts = {}
  let gitignoreResult = { written: false }

  if (!dryRun) {
    hooksPath = patchHooksJson(projectRoot, templatesRoot, true)
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
  }

  const cleanupResult = cleanupDeprecated(projectRoot, { dryRun })
  const newVersion = readNodeModulesPackageVersion(projectRoot)

  if (!dryRun && newVersion) {
    mergeBookrc(projectRoot, { installedPackageVersion: newVersion }, { force: false })
  }

  const conflicts = packageSync.docs?.conflicts ?? []

  return {
    projectRoot,
    dryRun,
    acceptUpstream,
    templatesRoot,
    config,
    configResult,
    pruneResult,
    packageSync,
    hooksPath,
    gitignoreResult,
    agentsResult,
    workflowResult,
    projectRuleResult,
    snippetRefPath,
    scripts,
    cleanupResult,
    newVersion,
    conflicts,
    exitCode: conflicts.length > 0 && !acceptUpstream ? 1 : 0
  }
}

export function printGateReinstallSummary(result) {
  const {
    dryRun,
    packageSync,
    pruneResult,
    cleanupResult,
    newVersion,
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
  if (conflicts?.length) {
    console.log('  2. Resolve merge conflicts above, then re-run update')
  }
  console.log('')
}
