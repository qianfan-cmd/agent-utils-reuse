import fs from 'node:fs'
import path from 'node:path'

import { readNodeModulesPackageVersion } from './init.mjs'
import { hashContent, normalizeContent } from './gate-sync-manifest.mjs'
import { buildHooksJsonForProject, serializeHooksJson } from './build-hooks-json.mjs'
import {
  PACKAGE_HOOK_FILES,
  PACKAGE_RULE_FILES
} from './sync-package-files.mjs'

export const GITIGNORE_AUDIT_LINES = [
  '.cursor/.utils-gate-reads.json',
  '.cursor/.utils-gate-verdict.json',
  '.cursor/.utils-gate-discovery.json',
  '.cursor/.utils-gate-agents-read.json',
  '*.utils-reuse-upstream'
]

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

function expectedHooksJsonContent(templatesRoot, hookMode = 'off') {
  return serializeHooksJson(buildHooksJsonForProject(templatesRoot, hookMode))
}

/**
 * Verify overwrite-tier gate files match templates (byte/hash equal).
 */
export function verifyGateSync(templatesRoot, projectRoot, config) {
  const stale = []
  const missing = []
  const overwriteHashes = {}
  let checkedCount = 0

  const rulesSrc = path.join(templatesRoot, 'cursor', 'rules')
  const rulesDest = path.join(projectRoot, '.cursor', 'rules')
  for (const name of PACKAGE_RULE_FILES) {
    const rel = `.cursor/rules/${name}`
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

  const hooksSrc = path.join(templatesRoot, 'cursor', 'hooks')
  const hooksDest = path.join(projectRoot, '.cursor', 'hooks')
  for (const name of PACKAGE_HOOK_FILES) {
    const rel = `.cursor/hooks/${name}`
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

  const skillRel = `${config.skillsDir}/reuse-before-create/SKILL.md`.replace(/\\/g, '/')
  const skillFrom = path.join(templatesRoot, 'cursor', 'skills', 'reuse-before-create', 'SKILL.md')
  const skillTo = path.join(projectRoot, skillRel)
  const skillHash = compareFileToTemplate(skillRel, skillFrom, skillTo, stale, missing)
  if (skillHash) {
    overwriteHashes[skillRel] = skillHash
    checkedCount++
  }

  const hooksRel = '.cursor/hooks.json'
  const hooksPath = path.join(projectRoot, hooksRel)
  const expectedHooks = expectedHooksJsonContent(templatesRoot, config.hookMode)
  overwriteHashes[hooksRel] = hashContent(expectedHooks)
  checkedCount++
  if (!fs.existsSync(hooksPath)) {
    missing.push(hooksRel)
  } else if (normalizeContent(fs.readFileSync(hooksPath, 'utf8')) !== normalizeContent(expectedHooks)) {
    stale.push(hooksRel)
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
    templateVersion: readPackageVersionFromTemplatesRoot(templatesRoot)
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
