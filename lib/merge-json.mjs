/**
 * Merge hooks.json preToolUse entries without duplicating by command string.
 */
export function mergeHooksJson(existing, fragment) {
  const base = existing && typeof existing === 'object' ? { ...existing } : { version: 1, hooks: {} }
  if (!base.hooks) base.hooks = {}
  if (!base.version) base.version = 1

  const hookLists = ['preToolUse', 'postToolUse']
  for (const key of hookLists) {
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
