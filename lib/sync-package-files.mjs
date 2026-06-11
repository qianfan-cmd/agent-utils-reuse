import fs from 'node:fs'
import path from 'node:path'

/**
 * Paths (relative to templates/cursor or templates/docs) always refreshed on init
 * so upgrades apply without manual edits. Project-owned rules are NOT listed here.
 */
export const PACKAGE_RULE_FILES = [
  'workspace-agent-gate.mdc',
  'utils-reuse-gate.mdc',
  'code-before-edit.mdc',
  'reuse-first.mdc',
  'project-agent-gate.mdc'
]

export const PACKAGE_HOOK_FILES = [
  'check-discovery-before-shared-write.mjs',
  'read-audit-lib.mjs',
  'track-utils-reads.mjs',
  'track-utils-verdict.mjs'
]

export const PACKAGE_DOC_FILES = ['placement-decision.md', 'MERGE-AGENTS.md', 'README.md']

export function syncPackageFiles(templatesRoot, projectRoot, config) {
  let copied = 0
  const details = []

  const rulesDest = path.join(projectRoot, '.cursor', 'rules')
  const rulesSrc = path.join(templatesRoot, 'cursor', 'rules')
  for (const name of PACKAGE_RULE_FILES) {
    const from = path.join(rulesSrc, name)
    const to = path.join(rulesDest, name)
    if (!fs.existsSync(from)) continue
    fs.mkdirSync(rulesDest, { recursive: true })
    fs.copyFileSync(from, to)
    copied++
    details.push(`.cursor/rules/${name}`)
  }

  const hooksDest = path.join(projectRoot, '.cursor', 'hooks')
  const hooksSrc = path.join(templatesRoot, 'cursor', 'hooks')
  for (const name of PACKAGE_HOOK_FILES) {
    const from = path.join(hooksSrc, name)
    const to = path.join(hooksDest, name)
    if (!fs.existsSync(from)) continue
    fs.mkdirSync(hooksDest, { recursive: true })
    fs.copyFileSync(from, to)
    copied++
    details.push(`.cursor/hooks/${name}`)
  }

  const skillFrom = path.join(templatesRoot, 'cursor', 'skills', 'reuse-before-create', 'SKILL.md')
  const skillTo = path.join(projectRoot, config.skillsDir, 'reuse-before-create', 'SKILL.md')
  if (fs.existsSync(skillFrom)) {
    fs.mkdirSync(path.dirname(skillTo), { recursive: true })
    fs.copyFileSync(skillFrom, skillTo)
    copied++
    details.push(`${config.skillsDir}/reuse-before-create/SKILL.md`)
  }

  const docsSrc = path.join(templatesRoot, 'docs', 'agent-catalog')
  const docsDest = path.join(projectRoot, config.catalogDir)
  for (const name of PACKAGE_DOC_FILES) {
    const from = path.join(docsSrc, name)
    const to = path.join(docsDest, name)
    if (!fs.existsSync(from)) continue
    fs.mkdirSync(docsDest, { recursive: true })
    fs.copyFileSync(from, to)
    copied++
    details.push(`${config.catalogDir}/${name}`)
  }

  return { copied, details }
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

  const keysFromPackage = [
    'utilsDir',
    'catalogDir',
    'utilsBookDir',
    'skillsDir',
    'agentsFile',
    'jsdocTag',
    'remindWritePaths',
    'utilsImportAliases',
    'hookMode',
    'sourceGlobs'
  ]

  const merged = { ...existing }
  for (const key of keysFromPackage) {
    if (defaults[key] === undefined) continue
    if (force || merged[key] === undefined) {
      merged[key] = defaults[key]
    }
  }
  if (existing.projectAgentCoreRule !== undefined) {
    merged.projectAgentCoreRule = existing.projectAgentCoreRule
  }

  fs.writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8')
  return { path: configPath, merged }
}
