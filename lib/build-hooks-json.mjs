import fs from 'node:fs'
import path from 'node:path'

import { mergeHooksJson } from './merge-json.mjs'

export function readHooksFragment(templatesRoot) {
  const fragmentPath = path.join(templatesRoot, 'hooks.json.fragment')
  return JSON.parse(fs.readFileSync(fragmentPath, 'utf8'))
}

/**
 * Build hooks.json content for hookMode: off | remind | confirm.
 */
export function buildHooksForMode(fragment, hookMode = 'off') {
  const mode = String(hookMode ?? 'off').toLowerCase()

  if (mode === 'off') {
    return { version: 1, hooks: {} }
  }

  if (mode === 'remind') {
    const preToolUse = fragment.hooks?.preToolUse
    return {
      version: 1,
      hooks: Array.isArray(preToolUse) && preToolUse.length > 0 ? { preToolUse: preToolUse.map((e) => ({ ...e })) } : {}
    }
  }

  return mergeHooksJson({}, fragment, { force: true })
}

export function buildHooksJsonForProject(templatesRoot, hookMode = 'off') {
  const fragment = readHooksFragment(templatesRoot)
  return buildHooksForMode(fragment, hookMode)
}

export function serializeHooksJson(hooksDoc) {
  return `${JSON.stringify(hooksDoc, null, 2)}\n`
}
