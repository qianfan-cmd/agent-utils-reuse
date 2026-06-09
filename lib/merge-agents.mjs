import fs from 'node:fs'
import path from 'node:path'

export const AGENTS_BLOCK_START = '<!-- agent-utils-reuse:start -->'
export const AGENTS_BLOCK_END = '<!-- agent-utils-reuse:end -->'

export const WORKFLOW_INJECT_MARKER = '<!-- agent-utils-reuse:workflow-inject -->'
export const WORKFLOW_INJECT_LINE =
  '- If shared utils may be needed: **Shortlist → Confirm → Verdict** (utils reuse section in AGENTS.md) before Write.'

export function wrapAgentsSnippet(snippet) {
  return `${AGENTS_BLOCK_START}\n${snippet.trim()}\n${AGENTS_BLOCK_END}`
}

export function formatSnippetReference(snippet) {
  return [
    '# AGENTS.md 片段（utils 复用门禁）',
    '',
    '完整说明见同目录 [`MERGE-AGENTS.md`](./MERGE-AGENTS.md)。',
    '',
    '通常无需手动操作：`pnpm agent-utils-reuse init` 会自动写入项目根 `AGENTS.md`。',
    '',
    '若需手动合并，复制下方标记之间的正文到 `AGENTS.md`：',
    '',
    '--- 从这里开始复制 ---',
    '',
    snippet.trim(),
    '',
    '--- 复制结束 ---',
    ''
  ].join('\n')
}

/**
 * Inject utils workflow bullet into AGENTS.md §7-style workflow when missing.
 * @returns {{ injected: boolean, path: string }}
 */
export function injectAgentsWorkflow(projectRoot, agentsFile, { force = false } = {}) {
  const agentsPath = path.join(projectRoot, agentsFile)
  if (!fs.existsSync(agentsPath)) {
    return { injected: false, path: agentsPath, reason: 'missing-agents' }
  }

  let content = fs.readFileSync(agentsPath, 'utf8')

  if (content.includes(WORKFLOW_INJECT_MARKER) && !force) {
    return { injected: false, path: agentsPath, reason: 'already-injected' }
  }

  if (content.includes(WORKFLOW_INJECT_LINE) && !force) {
    return { injected: false, path: agentsPath, reason: 'line-present' }
  }

  const designPatterns = [
    /(\*\*Design briefly\*\*[^\n]*\n)/i,
    /(2\.\s+\*\*Design briefly\*\*[^\n]*\n)/i,
    /(Design briefly[^\n]*\n)/i
  ]

  let injected = false
  for (const pattern of designPatterns) {
    if (pattern.test(content)) {
      content = content.replace(
        pattern,
        `$1${WORKFLOW_INJECT_MARKER}\n   ${WORKFLOW_INJECT_LINE}\n`
      )
      injected = true
      break
    }
  }

  if (!injected) {
    const workflowHeading = /(###?\s*7\.[^\n]*Agent workflow[^\n]*\n)/i
    if (workflowHeading.test(content)) {
      content = content.replace(
        workflowHeading,
        `$1\n${WORKFLOW_INJECT_MARKER}\n${WORKFLOW_INJECT_LINE}\n`
      )
      injected = true
    }
  }

  if (injected) {
    fs.writeFileSync(agentsPath, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
  }

  return { injected, path: agentsPath, reason: injected ? undefined : 'no-workflow-section' }
}

/**
 * Create or merge AGENTS.md with a marked utils-reuse block.
 * @returns {{ action: 'created' | 'appended' | 'updated' | 'kept', path: string, reason?: string }}
 */
export function mergeAgentsMd(projectRoot, agentsFile, snippet, { force = false } = {}) {
  const agentsPath = path.join(projectRoot, agentsFile)
  const block = wrapAgentsSnippet(snippet)

  if (!fs.existsSync(agentsPath)) {
    const content = `# Agent guidelines\n\n${block}\n`
    fs.writeFileSync(agentsPath, content, 'utf8')
    return { action: 'created', path: agentsPath }
  }

  const existing = fs.readFileSync(agentsPath, 'utf8')
  const startIdx = existing.indexOf(AGENTS_BLOCK_START)
  const endIdx = existing.indexOf(AGENTS_BLOCK_END)

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    if (!force) {
      return { action: 'kept', path: agentsPath, reason: 'marker-block-exists' }
    }
    const before = existing.slice(0, startIdx)
    const after = existing.slice(endIdx + AGENTS_BLOCK_END.length)
    const newContent = `${before}${block}${after}`.replace(/\n{3,}/g, '\n\n')
    fs.writeFileSync(agentsPath, newContent.endsWith('\n') ? newContent : `${newContent}\n`, 'utf8')
    return { action: 'updated', path: agentsPath }
  }

  if (existing.includes('### Utils reuse (shared utilities only)') && !force) {
    return { action: 'kept', path: agentsPath, reason: 'section-exists-without-marker' }
  }

  const separator = existing.endsWith('\n') ? '\n' : '\n\n'
  const appended = `${existing}${separator}${block}\n`
  fs.writeFileSync(agentsPath, appended, 'utf8')
  return { action: 'appended', path: agentsPath }
}

export function writeSnippetReference(catalogRoot, snippet) {
  const refPath = path.join(catalogRoot, 'AGENTS.utils-reuse.snippet.md')
  fs.mkdirSync(path.dirname(refPath), { recursive: true })
  fs.writeFileSync(refPath, formatSnippetReference(snippet), 'utf8')
  return refPath
}
