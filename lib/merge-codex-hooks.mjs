import fs from 'node:fs'
import path from 'node:path'

import { collectNestedHookCommands } from './merge-claude-settings.mjs'

/**
 * Merge gate hooks into Codex hooks.json (nested format).
 */
export function mergeCodexHooksJson(existing, fragment, hookMode = 'off') {
  const base = existing && typeof existing === 'object' ? { ...existing } : { hooks: {} }
  if (!base.hooks) base.hooks = {}

  if (hookMode === 'off') {
    const gateCommands = collectNestedHookCommands(fragment)
    for (const [event, groups] of Object.entries(base.hooks)) {
      if (!Array.isArray(groups)) continue
      const filtered = groups
        .map((group) => ({
          ...group,
          hooks: (group.hooks ?? []).filter((h) => !gateCommands.has(h?.command))
        }))
        .filter((group) => (group.hooks ?? []).length > 0)
      if (filtered.length > 0) base.hooks[event] = filtered
      else delete base.hooks[event]
    }
    if (Object.keys(base.hooks).length === 0) delete base.hooks
    return base
  }

  if (hookMode === 'remind') {
    base.hooks = {
      ...base.hooks,
      PreToolUse: fragment.hooks?.PreToolUse ?? []
    }
    return base
  }

  base.hooks = { ...base.hooks, ...fragment.hooks }
  return base
}

export function serializeCodexHooksJson(doc) {
  return `${JSON.stringify(doc, null, 2)}\n`
}

export function patchCodexHooksJson(projectRoot, fragment, hookMode = 'off') {
  const hooksPath = path.join(projectRoot, '.codex', 'hooks.json')
  let existing = {}
  if (fs.existsSync(hooksPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(hooksPath, 'utf8'))
    } catch {
      existing = {}
    }
  }
  const merged = mergeCodexHooksJson(existing, fragment, hookMode)
  fs.mkdirSync(path.dirname(hooksPath), { recursive: true })
  fs.writeFileSync(hooksPath, serializeCodexHooksJson(merged))
  return hooksPath
}
