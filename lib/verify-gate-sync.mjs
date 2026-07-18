import fs from 'node:fs'
import path from 'node:path'

import { getAgentTarget, PACKAGE_HOOK_WRAPPER_FILES, SHARED_HOOK_CORE_FILES } from './agent-targets.mjs'
import { readNodeModulesPackageVersion } from './init.mjs'
import { GITIGNORE_AUDIT_LINES } from './gitignore-audit.mjs'
import { hashContent, normalizeContent } from './gate-sync-manifest.mjs'
import { expectedHooksFileContent } from './build-hooks-json.mjs'
import { claudeRulesRelPaths, generateClaudeRulesFromCursor } from './convert-rules-for-target.mjs'
import { PACKAGE_RULE_FILES } from './sync-package-files.mjs'

export { GITIGNORE_AUDIT_LINES } from './gitignore-audit.mjs'

function readPackageVersionFromTemplatesRoot(templatesRoot) {
  const pkgPath = path.join(templatesRoot, '..', 'package.json')
  if (!fs.existsSync(pkgPath)) return null
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version ?? null
  } catch {
    return null
  }
}

function compareFileToTemplate(relPath, templatePath, localPath, stale, missing) {
  if (!fs.existsSync(templatePath)) return null
  if (!fs.existsSync(localPath)) {
    missing.push(relPath)
    return null
  }
  const templateHash = hashContent(fs.readFileSync(templatePath, 'utf8'))
  const localHash = hashContent(fs.readFileSync(localPath, 'utf8'))
  if (templateHash !== localHash) {
    stale.push(relPath)
  }
  return templateHash
}

function verifyGitignore(projectRoot) {
  const gitignorePath = path.join(projectRoot, '.gitignore')
  if (!fs.existsSync(gitignorePath)) {
    return { ok: false, missingLines: [...GITIGNORE_AUDIT_LINES] }
  }
  const content = fs.readFileSync(gitignorePath, 'utf8')
  const missingLines = GITIGNORE_AUDIT_LINES.filter((line) => !content.includes(line))
  return { ok: missingLines.length === 0, missingLines }
}

function verifyTarget(templatesRoot, projectRoot, config, targetId, stale, missing, overwriteHashes) {
  const target = getAgentTarget(targetId)
  let checkedCount = 0

  if (targetId === 'cursor') {
    const rulesSrc = path.join(templatesRoot, 'cursor', 'rules')
    const rulesDest = path.join(projectRoot, target.rulesDir)
    for (const name of PACKAGE_RULE_FILES) {
      const rel = `${target.rulesDir}/${name}`
      const hash = compareFileToTemplate(
        rel,
        path.join(rulesSrc, name),
        path.join(rulesDest, name),
        stale,
        missing
      )
      if (hash) {
        overwriteHashes[rel] = hash
        checkedCount++
      }
    }
  }

  if (targetId === 'claude') {
    generateClaudeRulesFromCursor(templatesRoot, PACKAGE_RULE_FILES)
    const claudeRulesDir = path.join(templatesRoot, 'claude', 'rules')
    for (const rel of claudeRulesRelPaths(PACKAGE_RULE_FILES)) {
      const name = path.basename(rel)
      const hash = compareFileToTemplate(
        rel,
        path.join(claudeRulesDir, name),
        path.join(projectRoot, rel),
        stale,
        missing
      )
      if (hash) {
        overwriteHashes[rel] = hash
        checkedCount++
      }
    }
  }

  const hooksSrc = path.join(templatesRoot, target.templateSubdir, 'hooks')
  const hooksDest = path.join(projectRoot, target.agentDir, 'hooks')

  for (const name of PACKAGE_HOOK_WRAPPER_FILES) {
    const rel = `${target.agentDir}/hooks/${name}`
    const hash = compareFileToTemplate(
      rel,
      path.join(hooksSrc, name),
      path.join(hooksDest, name),
      stale,
      missing
    )
    if (hash) {
      overwriteHashes[rel] = hash
      checkedCount++
    }
  }

  for (const name of SHARED_HOOK_CORE_FILES) {
    const rel = `${target.agentDir}/hooks/_shared/${name}`
    const hash = compareFileToTemplate(
      rel,
      path.join(templatesRoot, 'shared', 'hooks', name),
      path.join(hooksDest, '_shared', name),
      stale,
      missing
    )
    if (hash) {
      overwriteHashes[rel] = hash
      checkedCount++
    }
  }

  if (targetId === 'cursor') {
    const rel = '.cursor/hooks/read-audit-lib.mjs'
    const hash = compareFileToTemplate(
      rel,
      path.join(hooksSrc, 'read-audit-lib.mjs'),
      path.join(hooksDest, 'read-audit-lib.mjs'),
      stale,
      missing
    )
    if (hash) {
      overwriteHashes[rel] = hash
      checkedCount++
    }
  }

  const skillRel = `${target.skillsDir}/reuse-before-create/SKILL.md`.replace(/\\/g, '/')
  const skillFrom = path.join(templatesRoot, target.templateSubdir, 'skills', 'reuse-before-create', 'SKILL.md')
  const skillTo = path.join(projectRoot, skillRel)
  const skillHash = compareFileToTemplate(skillRel, skillFrom, skillTo, stale, missing)
  if (skillHash) {
    overwriteHashes[skillRel] = skillHash
    checkedCount++
  }

  const hooksRel = target.hooksRelPath
  const hooksPath = path.join(projectRoot, hooksRel)
  const expectedHooks = expectedHooksFileContent(templatesRoot, targetId, config.hookMode)
  overwriteHashes[hooksRel] = hashContent(expectedHooks)
  checkedCount++
  if (!fs.existsSync(hooksPath)) {
    missing.push(hooksRel)
  } else if (normalizeContent(fs.readFileSync(hooksPath, 'utf8')) !== normalizeContent(expectedHooks)) {
    stale.push(hooksRel)
  }

  return checkedCount
}

/**
 * Verify overwrite-tier gate files match templates (byte/hash equal).
 */
export function verifyGateSync(templatesRoot, projectRoot, config, targets = ['cursor']) {
  const stale = []
  const missing = []
  const overwriteHashes = {}
  let checkedCount = 0

  for (const targetId of targets) {
    checkedCount += verifyTarget(
      templatesRoot,
      projectRoot,
      config,
      targetId,
      stale,
      missing,
      overwriteHashes
    )
  }

  const gitignore = verifyGitignore(projectRoot)
  const ok = stale.length === 0 && missing.length === 0 && gitignore.ok

  return {
    ok,
    stale,
    missing,
    gitignoreMissing: gitignore.missingLines,
    checkedCount,
    overwriteHashes,
    nodeModulesVersion: readNodeModulesPackageVersion(projectRoot),
    templateVersion: readPackageVersionFromTemplatesRoot(templatesRoot),
    targets
  }
}

export function persistGateOverwriteHashes(projectRoot, overwriteHashes, { dryRun = false } = {}) {
  const configPath = path.join(projectRoot, '.utils-bookrc.json')
  if (!fs.existsSync(configPath)) return null

  let raw = {}
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch {
    raw = {}
  }

  raw.gateOverwriteHashes = { ...(raw.gateOverwriteHashes ?? {}), ...overwriteHashes }

  if (!dryRun) {
    fs.writeFileSync(configPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8')
  }

  return { path: configPath, gateOverwriteHashes: raw.gateOverwriteHashes }
}
