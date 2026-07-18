import fs from 'node:fs'
import path from 'node:path'

import {
  AGENT_TARGETS,
  getAgentTarget,
  PACKAGE_HOOK_WRAPPER_FILES,
  SHARED_HOOK_CORE_FILES
} from './agent-targets.mjs'
import {
  claudeRulesRelPaths,
  generateClaudeRulesFromCursor,
  mergeClaudePointer,
  syncClaudeRules
} from './convert-rules-for-target.mjs'
import { PACKAGE_RULE_FILES } from './sync-package-files.mjs'

function copyFile(from, to, dryRun) {
  if (!fs.existsSync(from)) return false
  if (!dryRun) {
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(from, to)
  }
  return true
}

function copySharedHookCore(templatesRoot, hooksDest, dryRun) {
  const sharedSrc = path.join(templatesRoot, 'shared', 'hooks')
  const sharedDest = path.join(hooksDest, '_shared')
  const copied = []
  for (const name of SHARED_HOOK_CORE_FILES) {
    const from = path.join(sharedSrc, name)
    const to = path.join(sharedDest, name)
    if (copyFile(from, to, dryRun)) {
      copied.push(name)
    }
  }
  return copied
}

/**
 * Sync managed gate files for one agent target.
 */
export function syncPackageFilesForTarget(
  templatesRoot,
  projectRoot,
  config,
  targetId,
  { dryRun = false } = {}
) {
  const target = getAgentTarget(targetId)
  const details = []
  let copied = 0

  if (target.hasRules && targetId === 'cursor') {
    const rulesDest = path.join(projectRoot, target.rulesDir)
    const rulesSrc = path.join(templatesRoot, 'cursor', 'rules')
    for (const name of PACKAGE_RULE_FILES) {
      const from = path.join(rulesSrc, name)
      const to = path.join(rulesDest, name)
      if (copyFile(from, to, dryRun)) {
        copied++
        details.push(`${target.rulesDir}/${name}`)
      }
    }
  }

  if (target.hasRules && targetId === 'claude') {
    const rulePaths = syncClaudeRules(templatesRoot, projectRoot, PACKAGE_RULE_FILES, { dryRun })
    copied += rulePaths.length
    details.push(...rulePaths)
  }

  const hooksDest = path.join(projectRoot, target.agentDir, 'hooks')
  const hooksSrc = path.join(templatesRoot, target.templateSubdir, 'hooks')

  copySharedHookCore(templatesRoot, hooksDest, dryRun)
  for (const name of SHARED_HOOK_CORE_FILES) {
    details.push(`${target.agentDir}/hooks/_shared/${name}`)
    copied++
  }

  for (const name of PACKAGE_HOOK_WRAPPER_FILES) {
    const from = path.join(hooksSrc, name)
    const to = path.join(hooksDest, name)
    if (copyFile(from, to, dryRun)) {
      copied++
      details.push(`${target.agentDir}/hooks/${name}`)
    }
  }

  if (targetId === 'cursor') {
    const reexportFrom = path.join(hooksSrc, 'read-audit-lib.mjs')
    const reexportTo = path.join(hooksDest, 'read-audit-lib.mjs')
    if (copyFile(reexportFrom, reexportTo, dryRun)) {
      copied++
      details.push(`${target.agentDir}/hooks/read-audit-lib.mjs`)
    }
  }

  const skillFrom = path.join(templatesRoot, target.templateSubdir, 'skills', 'reuse-before-create', 'SKILL.md')
  const skillTo = path.join(projectRoot, target.skillsDir, 'reuse-before-create', 'SKILL.md')
  if (fs.existsSync(skillFrom)) {
    if (!dryRun) {
      fs.mkdirSync(path.dirname(skillTo), { recursive: true })
      fs.copyFileSync(skillFrom, skillTo)
    }
    copied++
    details.push(`${target.skillsDir}/reuse-before-create/SKILL.md`)
  }

  return { copied, details, targetId }
}

/**
 * copyDir for optional template extras (snippet rules, etc.)
 */
export function copyTargetTemplateTree(templatesRoot, projectRoot, targetId, { force = false } = {}) {
  const target = getAgentTarget(targetId)
  const src = path.join(templatesRoot, target.templateSubdir)
  const dest = path.join(projectRoot, target.agentDir)
  if (!fs.existsSync(src)) return { copied: 0, skipped: 0 }

  let copied = 0
  let skipped = 0

  function walk(fromDir, toDir) {
    for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
      if (entry.name === 'hooks') continue
      if (entry.name === 'rules' && targetId === 'claude') continue
      const from = path.join(fromDir, entry.name)
      const to = path.join(toDir, entry.name)
      if (entry.isDirectory()) {
        walk(from, to)
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
  }

  walk(src, dest)
  return { copied, skipped }
}

export function ensureTargetTemplateArtifacts(templatesRoot) {
  generateClaudeRulesFromCursor(templatesRoot, PACKAGE_RULE_FILES)

  for (const targetId of ['claude', 'codex']) {
    const target = AGENT_TARGETS[targetId]
    const hooksDir = path.join(templatesRoot, target.templateSubdir, 'hooks')
    fs.mkdirSync(hooksDir, { recursive: true })

    const runtime = targetId
    const wrappers = PACKAGE_HOOK_WRAPPER_FILES
    for (const name of wrappers) {
      const wrapperPath = path.join(hooksDir, name)
      if (!fs.existsSync(wrapperPath)) {
        const content = `#!/usr/bin/env node
import { setHookRuntime } from './_shared/hook-runtime.mjs'

setHookRuntime('${runtime}')
await import('./_shared/${name.replace('.mjs', '').replace('check-discovery-before-shared-write', 'check-discovery-core').replace('track-utils-reads', 'track-utils-reads-core').replace('track-utils-discovery', 'track-utils-discovery-core').replace('track-utils-verdict', 'track-utils-verdict-core')}.mjs')
`
        fs.writeFileSync(wrapperPath, content, 'utf8')
      }
    }

    const sharedDest = path.join(hooksDir, '_shared')
    fs.mkdirSync(sharedDest, { recursive: true })
    const sharedSrc = path.join(templatesRoot, 'shared', 'hooks')
    for (const name of SHARED_HOOK_CORE_FILES) {
      const from = path.join(sharedSrc, name)
      const to = path.join(sharedDest, name)
      if (fs.existsSync(from)) fs.copyFileSync(from, to)
    }
  }

  const claudeSkillSrc = path.join(templatesRoot, 'cursor', 'skills', 'reuse-before-create', 'SKILL.md')
  const claudeSkillDest = path.join(templatesRoot, 'claude', 'skills', 'reuse-before-create', 'SKILL.md')
  if (fs.existsSync(claudeSkillSrc) && !fs.existsSync(claudeSkillDest)) {
    fs.mkdirSync(path.dirname(claudeSkillDest), { recursive: true })
    fs.copyFileSync(claudeSkillSrc, claudeSkillDest)
  }
}

export function installTargetExtras(projectRoot, targetId, { dryRun = false, force = false } = {}) {
  if (targetId === 'claude') {
    return mergeClaudePointer(projectRoot, { dryRun, force })
  }
  return { action: 'skipped', path: '' }
}

export function managedRelPathsForTarget(config, targetId) {
  const target = getAgentTarget(targetId)
  const paths = []

  if (targetId === 'cursor') {
    for (const name of PACKAGE_RULE_FILES) {
      paths.push(`${target.rulesDir}/${name}`)
    }
  }
  if (targetId === 'claude') {
    paths.push(...claudeRulesRelPaths(PACKAGE_RULE_FILES))
  }

  for (const name of PACKAGE_HOOK_WRAPPER_FILES) {
    paths.push(`${target.agentDir}/hooks/${name}`)
  }
  for (const name of SHARED_HOOK_CORE_FILES) {
    paths.push(`${target.agentDir}/hooks/_shared/${name}`)
  }
  if (targetId === 'cursor') {
    paths.push(`${target.agentDir}/hooks/read-audit-lib.mjs`)
  }

  paths.push(`${target.skillsDir}/reuse-before-create/SKILL.md`.replace(/\\/g, '/'))
  paths.push(target.hooksRelPath)
  return paths
}
