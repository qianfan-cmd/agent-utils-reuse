import fs from 'node:fs'
import path from 'node:path'

/**
 * Collect gate hook command strings from a nested Claude/Codex fragment.
 * @param {object} fragment
 * @returns {Set<string>}
 */
export function collectNestedHookCommands(fragment) {
  const commands = new Set()
  for (const list of Object.values(fragment.hooks ?? {})) {
    if (!Array.isArray(list)) continue
    for (const group of list) {
      for (const hook of group.hooks ?? []) {
        if (hook?.command) commands.add(hook.command)
      }
    }
  }
  return commands
}

/**
 * Merge gate hooks into .claude/settings.json (preserve other keys).
 */
export function mergeClaudeSettingsHooks(existing, fragment, hookMode = 'off') {
  const base = existing && typeof existing === 'object' ? { ...existing } : {}
  if (hookMode === 'off') {
    if (base.hooks) {
      const gateCommands = collectNestedHookCommands(fragment)
      const nextHooks = {}
      for (const [event, groups] of Object.entries(base.hooks)) {
        if (!Array.isArray(groups)) continue
        const filtered = groups
          .map((group) => ({
            ...group,
            hooks: (group.hooks ?? []).filter((h) => !gateCommands.has(h?.command))
          }))
          .filter((group) => (group.hooks ?? []).length > 0)
        if (filtered.length > 0) nextHooks[event] = filtered
      }
      if (Object.keys(nextHooks).length > 0) base.hooks = nextHooks
      else delete base.hooks
    }
    return base
  }

  if (hookMode === 'remind') {
    base.hooks = {
      ...(base.hooks ?? {}),
      PreToolUse: fragment.hooks?.PreToolUse ?? []
    }
    return base
  }

  base.hooks = { ...(base.hooks ?? {}), ...fragment.hooks }
  return base
}

export function stripClaudeGateHooks(existing, fragment) {
  return mergeClaudeSettingsHooks(existing, fragment, 'off')
}

export function serializeClaudeSettings(doc) {
  return `${JSON.stringify(doc, null, 2)}\n`
}

export function patchClaudeSettingsJson(projectRoot, fragment, hookMode = 'off') {
  const settingsPath = path.join(projectRoot, '.claude', 'settings.json')
  let existing = {}
  if (fs.existsSync(settingsPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    } catch {
      existing = {}
    }
  }
  const merged = mergeClaudeSettingsHooks(existing, fragment, hookMode)
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  fs.writeFileSync(settingsPath, serializeClaudeSettings(merged))
  return settingsPath
}
