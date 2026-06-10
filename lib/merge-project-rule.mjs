import fs from 'node:fs'
import path from 'node:path'

export const PROJECT_GATE_BLOCK_START = '<!-- agent-utils-reuse:project-gate:start -->'
export const PROJECT_GATE_BLOCK_END = '<!-- agent-utils-reuse:project-gate:end -->'

export function wrapProjectGateSnippet(snippet) {
  return `${PROJECT_GATE_BLOCK_START}\n${snippet.trim()}\n${PROJECT_GATE_BLOCK_END}`
}

/**
 * Merge utils gate bullets into a project-specific alwaysApply rule (e.g. ai-web-agent-core.mdc).
 * @returns {{ action: string, path: string, reason?: string }}
 */
export function mergeProjectAgentCoreRule(projectRoot, ruleRelPath, snippet, { force = false } = {}) {
  if (!ruleRelPath) {
    return { action: 'skipped', path: '', reason: 'no-projectAgentCoreRule' }
  }

  const rulePath = path.join(projectRoot, ruleRelPath.replace(/\\/g, '/'))
  if (!fs.existsSync(rulePath)) {
    return { action: 'skipped', path: rulePath, reason: 'rule-file-missing' }
  }

  const block = wrapProjectGateSnippet(snippet)
  let content = fs.readFileSync(rulePath, 'utf8')
  const startIdx = content.indexOf(PROJECT_GATE_BLOCK_START)
  const endIdx = content.indexOf(PROJECT_GATE_BLOCK_END)

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    if (!force) {
      return { action: 'kept', path: rulePath, reason: 'marker-block-exists' }
    }
    const before = content.slice(0, startIdx)
    const after = content.slice(endIdx + PROJECT_GATE_BLOCK_END.length)
    content = `${before}${block}${after}`.replace(/\n{3,}/g, '\n\n')
    fs.writeFileSync(rulePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
    return { action: 'updated', path: rulePath }
  }

  const headingMatch = content.match(/(##\s*动手前[^\n]*\n)/i)
  if (headingMatch) {
    content = content.replace(headingMatch[1], `${headingMatch[1]}\n${block}\n`)
    fs.writeFileSync(rulePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
    return { action: 'injected', path: rulePath }
  }

  const separator = content.endsWith('\n') ? '\n' : '\n\n'
  fs.writeFileSync(rulePath, `${content}${separator}${block}\n`, 'utf8')
  return { action: 'appended', path: rulePath }
}
