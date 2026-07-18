import { AGENT_TARGET_IDS, AGENT_TARGETS } from './agent-targets.mjs'

/**
 * Parse --cursor | --claude | --codex | --all from argv.
 * Default (no IDE flags): ['cursor'] only — backward compatible.
 *
 * @param {string[]} argv
 * @returns {{ targets: string[], explicit: boolean }}
 */
export function resolveAgentTargetsFromArgv(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')))
  const hasAll = flags.has('--all')
  const hasClaude = flags.has('--claude')
  const hasCodex = flags.has('--codex')
  const hasCursor = flags.has('--cursor')

  if (hasAll) {
    return { targets: [...AGENT_TARGET_IDS], explicit: true }
  }

  const picked = []
  if (hasCursor || (!hasClaude && !hasCodex)) {
    picked.push('cursor')
  }
  if (hasClaude) picked.push('claude')
  if (hasCodex) picked.push('codex')

  const unique = [...new Set(picked)]
  return {
    targets: unique.length > 0 ? unique : ['cursor'],
    explicit: hasCursor || hasClaude || hasCodex
  }
}

/**
 * Merge installed targets into bookrc (union, stable order).
 * @param {string[]} existing
 * @param {string[]} added
 * @returns {string[]}
 */
export function mergeInstalledAgentTargets(existing, added) {
  const set = new Set(Array.isArray(existing) ? existing : [])
  for (const id of added) {
    if (AGENT_TARGETS[id]) set.add(id)
  }
  return AGENT_TARGET_IDS.filter((id) => set.has(id))
}

/**
 * Read installed targets from config; default cursor if absent.
 * @param {object} config
 * @returns {string[]}
 */
export function readInstalledAgentTargets(config) {
  if (Array.isArray(config?.installedAgentTargets) && config.installedAgentTargets.length > 0) {
    return mergeInstalledAgentTargets([], config.installedAgentTargets)
  }
  return ['cursor']
}
