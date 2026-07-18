import fs from 'node:fs'
import path from 'node:path'

import { getAgentTarget } from './agent-targets.mjs'
import { mergeClaudeSettingsHooks, serializeClaudeSettings } from './merge-claude-settings.mjs'
import { mergeCodexHooksJson, serializeCodexHooksJson } from './merge-codex-hooks.mjs'
import { mergeHooksJson } from './merge-json.mjs'

export function readHooksFragment(templatesRoot, targetId = 'cursor') {
  const target = getAgentTarget(targetId)
  const fragmentPath = path.join(templatesRoot, target.hooksFragmentFile)
  if (!fs.existsSync(fragmentPath)) {
    const legacy = path.join(templatesRoot, 'hooks.json.fragment')
    if (targetId === 'cursor' && fs.existsSync(legacy)) {
      return JSON.parse(fs.readFileSync(legacy, 'utf8'))
    }
    throw new Error(`Hooks fragment not found: ${fragmentPath}`)
  }
  return JSON.parse(fs.readFileSync(fragmentPath, 'utf8'))
}

/**
 * Build hooks config document for a target + hookMode.
 */
export function buildHooksForTarget(fragment, targetId, hookMode = 'off') {
  const target = getAgentTarget(targetId)
  const mode = String(hookMode ?? 'off').toLowerCase()

  if (target.hooksFormat === 'cursor-flat') {
    return buildHooksForMode(fragment, mode)
  }

  if (mode === 'off') {
    return mergeNestedHooksForMode(fragment, 'off')
  }
  if (mode === 'remind') {
    return mergeNestedHooksForMode(fragment, 'remind')
  }
  return mergeNestedHooksForMode(fragment, 'confirm')
}

function mergeNestedHooksForMode(fragment, mode) {
  if (mode === 'off') {
    return { hooks: {} }
  }
  if (mode === 'remind') {
    const pre = fragment.hooks?.PreToolUse
    return {
      hooks: Array.isArray(pre) && pre.length > 0 ? { PreToolUse: pre.map((e) => ({ ...e })) } : {}
    }
  }
  const hooks = {}
  for (const [key, val] of Object.entries(fragment.hooks ?? {})) {
    if (Array.isArray(val) && val.length > 0) {
      hooks[key] = val.map((e) => ({ ...e }))
    }
  }
  return { hooks }
}

/**
 * Build hooks.json content for hookMode: off | remind | confirm (Cursor flat format).
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
      hooks:
        Array.isArray(preToolUse) && preToolUse.length > 0
          ? { preToolUse: preToolUse.map((e) => ({ ...e })) }
          : {}
    }
  }

  return mergeHooksJson({}, fragment, { force: true })
}

export function buildHooksJsonForProject(templatesRoot, hookMode = 'off', targetId = 'cursor') {
  const fragment = readHooksFragment(templatesRoot, targetId)
  return buildHooksForTarget(fragment, targetId, hookMode)
}

export function serializeHooksJson(hooksDoc) {
  return `${JSON.stringify(hooksDoc, null, 2)}\n`
}

/**
 * Patch hooks config file for one agent target.
 */
export function patchHooksForTarget(projectRoot, templatesRoot, targetId, hookMode = 'off') {
  const target = getAgentTarget(targetId)
  const fragment = readHooksFragment(templatesRoot, targetId)
  const mode = String(hookMode ?? 'off').toLowerCase()

  if (target.hooksFormat === 'cursor-flat') {
    const hooksPath = path.join(projectRoot, target.hooksRelPath)
    const hooksDoc = buildHooksForMode(fragment, mode)
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true })
    fs.writeFileSync(hooksPath, serializeHooksJson(hooksDoc))
    return hooksPath
  }

  if (targetId === 'claude') {
    const settingsPath = path.join(projectRoot, target.hooksRelPath)
    let existing = {}
    if (fs.existsSync(settingsPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
      } catch {
        existing = {}
      }
    }
    const merged = mergeClaudeSettingsHooks(existing, fragment, mode)
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
    fs.writeFileSync(settingsPath, serializeClaudeSettings(merged))
    return settingsPath
  }

  if (targetId === 'codex') {
    const hooksPath = path.join(projectRoot, target.hooksRelPath)
    let existing = {}
    if (fs.existsSync(hooksPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(hooksPath, 'utf8'))
      } catch {
        existing = {}
      }
    }
    const merged = mergeCodexHooksJson(existing, fragment, mode)
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true })
    fs.writeFileSync(hooksPath, serializeCodexHooksJson(merged))
    return hooksPath
  }

  throw new Error(`Unsupported target for patchHooksForTarget: ${targetId}`)
}

export function expectedHooksFileContent(templatesRoot, targetId, hookMode = 'off') {
  const target = getAgentTarget(targetId)
  const fragment = readHooksFragment(templatesRoot, targetId)
  const mode = String(hookMode ?? 'off').toLowerCase()

  if (target.hooksFormat === 'cursor-flat') {
    return serializeHooksJson(buildHooksForMode(fragment, mode))
  }

  if (targetId === 'claude') {
    return serializeClaudeSettings(mergeClaudeSettingsHooks({}, fragment, mode))
  }

  if (targetId === 'codex') {
    return serializeCodexHooksJson(mergeCodexHooksJson({}, fragment, mode))
  }

  return ''
}
