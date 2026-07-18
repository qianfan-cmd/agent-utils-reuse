import fs from 'node:fs'
import path from 'node:path'

/**
 * Convert Cursor .mdc rule to Claude .md rule.
 * @param {string} mdcContent
 * @returns {string}
 */
export function convertMdcToClaudeMd(mdcContent) {
  const trimmed = mdcContent.replace(/^\uFEFF/, '')
  const fmMatch = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!fmMatch) {
    return `${trimmed.trim()}\n`
  }

  const frontmatter = fmMatch[1]
  let body = fmMatch[2]

  const globsMatch = frontmatter.match(/^globs:\s*(.+)$/m)
  const pathsLine = globsMatch ? globsMatch[1].trim() : null

  body = body.replace(/\.cursor\/rules\//g, '.claude/rules/')
  body = body.replace(/utils-reuse-gate\.mdc/g, 'utils-reuse-gate.md')
  body = body.replace(
    /Hook \(`hookMode: confirm`\)/g,
    'Hook (`hookMode: confirm`, Claude settings.json)'
  )

  if (pathsLine) {
    return `---\npaths: ${pathsLine}\n---\n\n${body.trim()}\n`
  }

  return `${body.trim()}\n`
}

/**
 * Generate Claude rules from Cursor SSOT templates.
 */
export function generateClaudeRulesFromCursor(templatesRoot, packageRuleFiles) {
  const cursorRulesDir = path.join(templatesRoot, 'cursor', 'rules')
  const claudeRulesDir = path.join(templatesRoot, 'claude', 'rules')
  fs.mkdirSync(claudeRulesDir, { recursive: true })

  const written = []
  for (const name of packageRuleFiles) {
    if (!name.endsWith('.mdc')) continue
    const from = path.join(cursorRulesDir, name)
    if (!fs.existsSync(from)) continue
    const mdName = name.replace(/\.mdc$/, '.md')
    const content = convertMdcToClaudeMd(fs.readFileSync(from, 'utf8'))
    fs.writeFileSync(path.join(claudeRulesDir, mdName), content, 'utf8')
    written.push(mdName)
  }
  return written
}

/**
 * Sync Claude rules into project from templates.
 */
export function syncClaudeRules(templatesRoot, projectRoot, packageRuleFiles, { dryRun = false } = {}) {
  generateClaudeRulesFromCursor(templatesRoot, packageRuleFiles)
  const claudeRulesDir = path.join(templatesRoot, 'claude', 'rules')
  const destDir = path.join(projectRoot, '.claude', 'rules')
  const copied = []

  for (const name of packageRuleFiles) {
    const mdName = name.replace(/\.mdc$/, '.md')
    const from = path.join(claudeRulesDir, mdName)
    if (!fs.existsSync(from)) continue
    const to = path.join(destDir, mdName)
    if (!dryRun) {
      fs.mkdirSync(destDir, { recursive: true })
      fs.copyFileSync(from, to)
    }
    copied.push(`.claude/rules/${mdName}`)
  }
  return copied
}

export const CLAUDE_POINTER_SNIPPET = `<!-- agent-utils-reuse:claude-pointer -->
## Utils reuse (agent-utils-reuse)

Before modifying source under \`src/\`, read **AGENTS.md** (utils reuse section) and **.claude/rules/** Confirm gate rules.
Run Discovery: \`agent-utils-reuse search "<keywords>"\` or Grep \`docs/agent-catalog/utils-index.json\`.
`

export function mergeClaudePointer(projectRoot, { dryRun = false, force = false } = {}) {
  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md')
  const markerStart = '<!-- agent-utils-reuse:claude-pointer -->'
  const markerEnd = '<!-- /agent-utils-reuse:claude-pointer -->'

  if (fs.existsSync(claudeMdPath)) {
    const existing = fs.readFileSync(claudeMdPath, 'utf8')
    if (existing.includes(markerStart) && !force) {
      return { action: 'kept', path: claudeMdPath }
    }
    let next = existing
    if (existing.includes(markerStart)) {
      const startIdx = existing.indexOf(markerStart)
      const endIdx = existing.indexOf(markerEnd)
      if (endIdx > startIdx) {
        next = existing.slice(0, startIdx) + existing.slice(endIdx + markerEnd.length)
      }
    }
    next = `${next.trim()}\n\n${CLAUDE_POINTER_SNIPPET}${markerEnd}\n`
    if (!dryRun) fs.writeFileSync(claudeMdPath, next, 'utf8')
    return { action: existing.includes(markerStart) ? 'updated' : 'appended', path: claudeMdPath }
  }

  const content = `${CLAUDE_POINTER_SNIPPET}${markerEnd}\n`
  if (!dryRun) fs.writeFileSync(claudeMdPath, content, 'utf8')
  return { action: 'created', path: claudeMdPath }
}

export function claudeRulesRelPaths(packageRuleFiles) {
  return packageRuleFiles
    .filter((n) => n.endsWith('.mdc'))
    .map((n) => `.claude/rules/${n.replace(/\.mdc$/, '.md')}`)
}
