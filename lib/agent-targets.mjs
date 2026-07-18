/** Agent IDE install targets — cursor (default), claude, codex. */

export const AGENT_TARGET_IDS = ['cursor', 'claude', 'codex']

/** @typedef {'cursor'|'claude'|'codex'} AgentTargetId */

/**
 * @type {Record<AgentTargetId, {
 *   id: AgentTargetId,
 *   label: string,
 *   agentDir: string,
 *   rulesDir: string|null,
 *   rulesExt: string|null,
 *   hooksRelPath: string,
 *   hooksFormat: 'cursor-flat'|'claude-nested'|'codex-nested',
 *   skillsDir: string,
 *   templateSubdir: string,
 *   hooksFragmentFile: string,
 *   hookCommandPrefix: string,
 *   default: boolean,
 *   hasRules: boolean
 * }>}
 */
export const AGENT_TARGETS = {
  cursor: {
    id: 'cursor',
    label: 'Cursor',
    agentDir: '.cursor',
    rulesDir: '.cursor/rules',
    rulesExt: '.mdc',
    hooksRelPath: '.cursor/hooks.json',
    hooksFormat: 'cursor-flat',
    skillsDir: '.cursor/skills',
    templateSubdir: 'cursor',
    hooksFragmentFile: 'hooks.cursor.json.fragment',
    hookCommandPrefix: 'node .cursor/hooks',
    default: true,
    hasRules: true
  },
  claude: {
    id: 'claude',
    label: 'Claude Code',
    agentDir: '.claude',
    rulesDir: '.claude/rules',
    rulesExt: '.md',
    hooksRelPath: '.claude/settings.json',
    hooksFormat: 'claude-nested',
    skillsDir: '.claude/skills',
    templateSubdir: 'claude',
    hooksFragmentFile: 'hooks.claude.json.fragment',
    hookCommandPrefix: 'node .claude/hooks',
    default: false,
    hasRules: true
  },
  codex: {
    id: 'codex',
    label: 'OpenAI Codex',
    agentDir: '.codex',
    rulesDir: null,
    rulesExt: null,
    hooksRelPath: '.codex/hooks.json',
    hooksFormat: 'codex-nested',
    skillsDir: '.agents/skills',
    templateSubdir: 'codex',
    hooksFragmentFile: 'hooks.codex.json.fragment',
    hookCommandPrefix: 'node .codex/hooks',
    default: false,
    hasRules: false
  }
}

/** Thin hook entry scripts (not _shared core). */
export const PACKAGE_HOOK_WRAPPER_FILES = [
  'check-discovery-before-shared-write.mjs',
  'track-utils-reads.mjs',
  'track-utils-discovery.mjs',
  'track-utils-verdict.mjs'
]

/** Shared hook core copied to {agentDir}/hooks/_shared/ */
export const SHARED_HOOK_CORE_FILES = [
  'hook-runtime.mjs',
  'read-audit-lib.mjs',
  'check-discovery-core.mjs',
  'track-utils-reads-core.mjs',
  'track-utils-discovery-core.mjs',
  'track-utils-verdict-core.mjs'
]

/** @deprecated use PACKAGE_HOOK_WRAPPER_FILES — kept for cursor verify compat */
export const PACKAGE_HOOK_FILES = [
  ...PACKAGE_HOOK_WRAPPER_FILES,
  'read-audit-lib.mjs'
]

/**
 * @param {string} id
 * @returns {typeof AGENT_TARGETS.cursor}
 */
export function getAgentTarget(id) {
  const target = AGENT_TARGETS[id]
  if (!target) {
    throw new Error(`Unknown agent target: ${id}. Use cursor, claude, or codex.`)
  }
  return target
}

/**
 * @param {AgentTargetId} targetId
 * @returns {string[]}
 */
export function sessionAuditRelPaths(targetId) {
  const target = getAgentTarget(targetId)
  const prefix = `${target.agentDir}/`
  return [
    `${prefix}.utils-gate-reads.json`,
    `${prefix}.utils-gate-verdict.json`,
    `${prefix}.utils-gate-discovery.json`,
    `${prefix}.utils-gate-agents-read.json`,
    `${prefix}.utils-gate-hook-debug.log`
  ]
}

/**
 * @param {AgentTargetId[]} targets
 * @returns {string[]}
 */
export function allSessionAuditRelPaths(targets) {
  const paths = new Set()
  for (const id of targets) {
    for (const p of sessionAuditRelPaths(id)) {
      paths.add(p)
    }
  }
  return [...paths]
}
