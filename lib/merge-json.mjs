/**
 * Merge hooks.json from fragment. When force=true, replace hook lists from fragment.
 */
export function mergeHooksJson(existing, fragment, { force = false } = {}) {
  const hookKeys = ['sessionStart', 'preToolUse', 'postToolUse', 'afterAgentResponse']

  if (force) {
    const base = existing && typeof existing === 'object' ? { ...existing } : { version: 1, hooks: {} }
    if (!base.version) base.version = 1
    base.hooks = {}
    for (const key of hookKeys) {
      const incoming = fragment.hooks?.[key]
      if (Array.isArray(incoming) && incoming.length > 0) {
        base.hooks[key] = incoming.map((e) => ({ ...e }))
      }
    }
    return base
  }

  const base = existing && typeof existing === 'object' ? { ...existing } : { version: 1, hooks: {} }
  if (!base.hooks) base.hooks = {}
  if (!base.version) base.version = 1

  for (const key of ['preToolUse', 'postToolUse']) {
    const incoming = fragment.hooks?.[key]
    if (!Array.isArray(incoming) || incoming.length === 0) continue

    const current = Array.isArray(base.hooks[key]) ? [...base.hooks[key]] : []
    const commands = new Set(current.map((e) => e.command))

    for (const entry of incoming) {
      if (!entry?.command || commands.has(entry.command)) continue
      current.push(entry)
      commands.add(entry.command)
    }

    base.hooks[key] = current
  }

  const sessionIncoming = fragment.hooks?.sessionStart
  if (Array.isArray(sessionIncoming) && sessionIncoming.length > 0) {
    const current = Array.isArray(base.hooks.sessionStart) ? [...base.hooks.sessionStart] : []
    const commands = new Set(current.map((e) => e.command))
    for (const entry of sessionIncoming) {
      if (!entry?.command || commands.has(entry.command)) continue
      current.push(entry)
      commands.add(entry.command)
    }
    base.hooks.sessionStart = current
  }

  return base
}

/**
 * Merge package.json scripts (idempotent by value).
 */
export function mergePackageScripts(pkg, scripts) {
  const next = { ...pkg }
  next.scripts = { ...(pkg.scripts ?? {}) }
  for (const [name, cmd] of Object.entries(scripts)) {
    next.scripts[name] = cmd
  }
  return next
}
