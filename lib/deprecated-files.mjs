import fs from 'node:fs'
import path from 'node:path'

/** Relative paths removed on `update` (not on plain `init`). */
export const DEPRECATED_PATHS = [
  '.cursor/rules/reuse-first-stop.mdc',
  '.cursor/hooks/discovery-cache-lib.mjs',
  '.cursor/hooks/record-utils-gate-audit.mjs',
  '.cursor/.utils-discovery-cache.json',
  '.cursor/.utils-gate-audit.json'
]

export function scanDeprecated(projectRoot) {
  const present = []
  const missing = []
  for (const rel of DEPRECATED_PATHS) {
    const abs = path.join(projectRoot, rel)
    if (fs.existsSync(abs)) {
      present.push(rel)
    } else {
      missing.push(rel)
    }
  }
  return { present, missing }
}

export function cleanupDeprecated(projectRoot, { dryRun = false } = {}) {
  const removed = []
  const missing = []

  for (const rel of DEPRECATED_PATHS) {
    const abs = path.join(projectRoot, rel)
    if (!fs.existsSync(abs)) {
      missing.push(rel)
      continue
    }
    if (!dryRun) {
      fs.unlinkSync(abs)
    }
    removed.push(rel)
  }

  return { removed, missing }
}
