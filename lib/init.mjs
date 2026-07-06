import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONFIG_FILENAME, defaultConfigRaw, resolveConfig } from './load-config.mjs'
import { mergeAgentsMd, injectAgentsWorkflow, writeSnippetReference } from './merge-agents.mjs'
import { mergeProjectAgentCoreRule } from './merge-project-rule.mjs'
import { buildHooksJsonForProject, serializeHooksJson } from './build-hooks-json.mjs'
import { mergePackageScripts } from './merge-json.mjs'
import { GITIGNORE_AUDIT_LINES } from './gitignore-audit.mjs'
import { mergeBookrc, resolveTemplatesRoot, syncPackageFiles } from './sync-package-files.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(__dirname, '..')
const PACKAGE_NAME = 'agent-utils-reuse'

function copyDir(src, dest, { force = false } = {}) {
  if (!fs.existsSync(src)) return { copied: 0, skipped: 0 }
  fs.mkdirSync(dest, { recursive: true })
  let copied = 0
  let skipped = 0

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      const sub = copyDir(from, to, { force })
      copied += sub.copied
      skipped += sub.skipped
    } else {
      if (fs.existsSync(to) && !force) {
        skipped++
        continue
      }
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.copyFileSync(from, to)
      copied++
    }
  }

  return { copied, skipped }
}

export function readNodeModulesPackageVersion(projectRoot) {
  const pkgPath = path.join(projectRoot, 'node_modules', PACKAGE_NAME, 'package.json')
  if (!fs.existsSync(pkgPath)) return null
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version
}

export function patchPackageJson(projectRoot, config) {
  const pkgPath = path.join(projectRoot, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    throw new Error('package.json not found in project root')
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const bookDirRel = config.utilsBookDir.replace(/\\/g, '/')
  const indexRel = config.utilsIndexFile.replace(/\\/g, '/')
  const merged = mergePackageScripts(pkg, {
    'gen:utils-book': 'agent-utils-reuse gen',
    'check:utils-book': `agent-utils-reuse gen && git diff --exit-code ${bookDirRel}/ ${indexRel}`,
    'upgrade:utils-reuse': 'agent-utils-reuse upgrade --yes',
    'update:utils-reuse': 'agent-utils-reuse update --yes'
  })

  fs.writeFileSync(pkgPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8')
  return merged.scripts
}

export function patchHooksJson(projectRoot, templatesRoot, { force = false, hookMode = 'off' } = {}) {
  const hooksPath = path.join(projectRoot, '.cursor', 'hooks.json')
  const hooksDoc = buildHooksJsonForProject(templatesRoot, hookMode)
  fs.mkdirSync(path.dirname(hooksPath), { recursive: true })
  fs.writeFileSync(hooksPath, serializeHooksJson(hooksDoc))
  return hooksPath
}

export function patchGitignore(projectRoot) {
  const gitignorePath = path.join(projectRoot, '.gitignore')
  const lines = GITIGNORE_AUDIT_LINES
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, `${lines.join('\n')}\n`, 'utf8')
    return { written: true, path: gitignorePath }
  }
  let content = fs.readFileSync(gitignorePath, 'utf8')
  let written = false
  for (const line of lines) {
    if (content.includes(line)) continue
    const sep = content.endsWith('\n') ? '' : '\n'
    content = `${content}${sep}${line}\n`
    written = true
  }
  if (written) {
    fs.writeFileSync(gitignorePath, content, 'utf8')
  }
  return { written, path: gitignorePath }
}

function copyExamples(projectRoot, config, templatesRoot, force) {
  const bundled = path.join(templatesRoot, 'example-utils', 'array')
  const fallback = path.join(PACKAGE_ROOT, 'examples', 'minimal', 'src', 'utils', 'array')
  const examplesSrc = fs.existsSync(bundled) ? bundled : fallback
  const dest = path.join(projectRoot, config.utilsDir, 'array')
  if (!fs.existsSync(examplesSrc)) return { copied: 0, skipped: 0, missing: true }
  const result = copyDir(examplesSrc, dest, { force })
  return { ...result, missing: false }
}

export function runInit(cwd, options = {}) {
  const {
    yes = false,
    force = false,
    withExamples = false,
    acceptUpstream = false,
    forceDocs = false
  } = options
  const projectRoot = path.resolve(cwd)

  if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
    throw new Error('Run init from your project root (package.json required)')
  }

  const templatesRoot = resolveTemplatesRoot(projectRoot)
  const raw = defaultConfigRaw()
  const configResult = mergeBookrc(projectRoot, raw, { force })
  const config = resolveConfig(
    JSON.parse(fs.readFileSync(configResult.path, 'utf8')),
    projectRoot
  )

  const accept = acceptUpstream || forceDocs
  const packageSync = syncPackageFiles(templatesRoot, projectRoot, config, {
    acceptUpstream: accept,
    docsMode: accept ? 'reinstall' : 'install'
  })

  const cursorSrc = path.join(templatesRoot, 'cursor')
  const cursorDest = path.join(projectRoot, '.cursor')
  const cursorCopy = copyDir(cursorSrc, cursorDest, { force })

  const scripts = patchPackageJson(projectRoot, config)
  const hooksPath = patchHooksJson(projectRoot, templatesRoot, { force: true, hookMode: config.hookMode })
  const gitignoreResult = patchGitignore(projectRoot)

  let examplesCopy = { copied: 0, skipped: 0 }
  if (withExamples) {
    examplesCopy = copyExamples(projectRoot, config, templatesRoot, force)
  }

  const snippetPath = path.join(templatesRoot, 'snippets', 'AGENTS.utils-reuse.md')
  const snippet = fs.readFileSync(snippetPath, 'utf8')

  const agentsResult = mergeAgentsMd(projectRoot, config.agentsFile, snippet, { force })
  const workflowResult = injectAgentsWorkflow(projectRoot, config.agentsFile, { force })

  const projectGateSnippetPath = path.join(templatesRoot, 'snippets', 'project-agent-gate.inject.md')
  const projectGateSnippet = fs.readFileSync(projectGateSnippetPath, 'utf8')
  const projectRuleResult = mergeProjectAgentCoreRule(
    projectRoot,
    config.projectAgentCoreRule,
    projectGateSnippet,
    { force }
  )

  const snippetRefPath = writeSnippetReference(path.join(projectRoot, config.catalogDir), snippet)

  const version = readNodeModulesPackageVersion(projectRoot)
  if (version) {
    mergeBookrc(projectRoot, { installedPackageVersion: version }, { force: false })
  }

  return {
    projectRoot,
    config,
    configResult,
    packageSync,
    cursorCopy,
    examplesCopy,
    scripts,
    hooksPath,
    gitignoreResult,
    agentsResult,
    workflowResult,
    projectRuleResult,
    snippetRefPath,
    yes,
    withExamples
  }
}

const AGENTS_ACTION_LABEL = {
  created: 'created',
  appended: 'merged (appended)',
  updated: 'updated',
  kept: 'kept (already present)'
}

export function printInitSummary(result) {
  const {
    configResult,
    packageSync,
    cursorCopy,
    examplesCopy,
    scripts,
    hooksPath,
    gitignoreResult,
    agentsResult,
    workflowResult,
    projectRuleResult,
    snippetRefPath,
    withExamples
  } = result

  console.log('')
  console.log('agent-utils-reuse init complete')
  console.log('')
  console.log(`  Config: merged ${configResult.path}`)
  console.log(`  Package sync: refreshed ${packageSync.copied} managed file(s)`)
  if (packageSync.details?.length) {
    for (const d of packageSync.details.slice(0, 8)) {
      console.log(`    - ${d}`)
    }
    if (packageSync.details.length > 8) {
      console.log(`    ... and ${packageSync.details.length - 8} more`)
    }
  }
  const docsSync = packageSync.docs
  if (docsSync?.conflicts?.length) {
    console.log(`  Docs:   ${docsSync.conflicts.length} conflict(s) — see sidecar .utils-reuse-upstream files`)
    for (const c of docsSync.conflicts) {
      console.log(`          - ${c.relPath}`)
    }
  } else {
    console.log(`  Docs:   synced ${docsSync?.copied ?? 0} package-managed file(s)`)
  }
  console.log(`  Cursor: copied ${cursorCopy.copied}, skipped ${cursorCopy.skipped} (existing)`)
  const agentsLabel = AGENTS_ACTION_LABEL[agentsResult.action] ?? agentsResult.action
  console.log(`  AGENTS: ${agentsLabel} ${agentsResult.path}`)
  if (agentsResult.reason) {
    console.log(`          (${agentsResult.reason}; use init --force to refresh snippet)`)
  }
  if (workflowResult.injected) {
    console.log(`  Workflow inject: added Confirm bullet to ${workflowResult.path}`)
  } else if (workflowResult.reason === 'no-workflow-section') {
    console.log(`  Workflow inject: skipped (no Design briefly / §7 section found)`)
  }
  if (projectRuleResult?.action && projectRuleResult.action !== 'skipped') {
    console.log(
      `  Project core rule: ${projectRuleResult.action} ${projectRuleResult.path ?? ''}`
    )
  } else if (projectRuleResult?.reason === 'no-projectAgentCoreRule') {
    console.log(
      '  Project core rule: using project-agent-gate.mdc (set projectAgentCoreRule in .utils-bookrc to merge into your own core rule)'
    )
  }
  console.log(`  Snippet ref: ${snippetRefPath}`)
  if (withExamples) {
    if (examplesCopy.missing) {
      console.log('  Examples: failed (example utils missing in package)')
    } else {
      console.log(`  Examples: copied ${examplesCopy.copied}, skipped ${examplesCopy.skipped} (existing)`)
    }
  }
  console.log(`  Hooks:  ${hooksPath}`)
  if (gitignoreResult?.written) {
    console.log(`  Gitignore: added gate runtime / upstream sidecar patterns`)
  }
  console.log('')
  console.log('  Rules stack (primary gate):')
  console.log('    workspace-agent-gate.mdc  — Read AGENTS.md first (alwaysApply)')
  console.log('    code-before-edit.mdc       — source globs, Confirm before Write')
  console.log('    project-agent-gate.mdc     — alwaysApply checklist (any project)')
  console.log('    utils-reuse-gate.mdc       — Confirm (Q1-Q5) + Verdict mandatory')
  console.log('')
  console.log('  Every init refreshes package-managed rules/hooks/docs (no manual copy needed).')
  console.log('  Use init --force to refresh AGENTS.md snippet and project-core inject block.')
  console.log('')
  console.log('  Hook: off (default) — Rules-only Confirm; no Write deny')
  console.log('  Opt-in hookMode: confirm for acceptance / strict audit; remind for allow + reminder.')
  console.log('')
  console.log('  Open Cursor at this project root so rules/hooks resolve correctly.')
  console.log('')
  console.log('  package.json scripts:')
  for (const [k, v] of Object.entries(scripts)) {
    if (k.includes('utils-book') || k.includes('utils-reuse')) console.log(`    "${k}": "${v}"`)
  }
  console.log('')
  console.log('Next steps:')
  if (withExamples && !examplesCopy.missing && examplesCopy.copied > 0) {
    console.log('  1. Example utils copied to src/utils/array — run: pnpm gen:utils-book')
  } else {
    console.log('  1. Add utils under utilsDir (or re-run init --with-examples), then: pnpm gen:utils-book')
  }
  console.log('  2. Missing @utils-book on existing exports? See docs/agent-catalog/:')
  console.log('       BACKFILL-UTILS-BOOK.zh.md  |  BACKFILL-UTILS-BOOK.en.md')
  console.log('     (Agent prompt to backfill JSDoc — then pnpm gen:utils-book again)')
  console.log('  3. Upgrade package + gate later: pnpm upgrade:utils-reuse')
  console.log('  4. Optional CI: pnpm check:utils-book (commit utils-book + utils-index first)')
  console.log('')
}
