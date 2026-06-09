#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const CONFIG_FILENAME = '.utils-bookrc.json'
const DEFAULT_REMIND_WRITE_PATHS = ['src/feature', 'src/components', 'src/hooks', 'src/views']

const DEFAULTS = {
  projectRoot: '.',
  utilsDir: 'src/utils',
  catalogDir: 'docs/agent-catalog',
  utilsBookDir: 'docs/agent-catalog/utils-book',
  skillsDir: '.cursor/skills',
  agentsFile: 'AGENTS.md',
  jsdocTag: '@utils-book',
  remindWritePaths: DEFAULT_REMIND_WRITE_PATHS
}

function normalizeRemindPaths(raw) {
  if (raw === undefined) return [...DEFAULT_REMIND_WRITE_PATHS]
  if (!Array.isArray(raw)) return [...DEFAULT_REMIND_WRITE_PATHS]
  return raw.map((p) => String(p).replace(/\\/g, '/').replace(/\/+$/, ''))
}

export function resolveConfig(raw, cwd) {
  const projectRoot = path.resolve(cwd, raw.projectRoot ?? DEFAULTS.projectRoot)
  const utilsDir = raw.utilsDir ?? DEFAULTS.utilsDir
  const catalogDir = raw.catalogDir ?? DEFAULTS.catalogDir
  const utilsBookDir = raw.utilsBookDir ?? DEFAULTS.utilsBookDir
  const skillsDir = raw.skillsDir ?? DEFAULTS.skillsDir
  const agentsFile = raw.agentsFile ?? DEFAULTS.agentsFile
  const jsdocTag = raw.jsdocTag ?? DEFAULTS.jsdocTag
  const remindWritePaths = normalizeRemindPaths(raw.remindWritePaths)

  return {
    projectRoot,
    utilsDir,
    catalogDir,
    utilsBookDir,
    skillsDir,
    agentsFile,
    jsdocTag,
    remindWritePaths,
    utilsRoot: path.join(projectRoot, utilsDir),
    bookDir: path.join(projectRoot, utilsBookDir),
    catalogRoot: path.join(projectRoot, catalogDir),
    skillsRoot: path.join(projectRoot, skillsDir),
    utilsPathPrefix: utilsDir.replace(/\\/g, '/')
  }
}

export function loadConfig(cwd = process.cwd()) {
  const configPath = path.join(cwd, CONFIG_FILENAME)
  let raw = {}

  if (fs.existsSync(configPath)) {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  }

  return resolveConfig(raw, cwd)
}

export function defaultConfigRaw() {
  return {
    projectRoot: DEFAULTS.projectRoot,
    utilsDir: DEFAULTS.utilsDir,
    catalogDir: DEFAULTS.catalogDir,
    utilsBookDir: DEFAULTS.utilsBookDir,
    skillsDir: DEFAULTS.skillsDir,
    agentsFile: DEFAULTS.agentsFile,
    jsdocTag: DEFAULTS.jsdocTag,
    remindWritePaths: [...DEFAULT_REMIND_WRITE_PATHS]
  }
}

export { CONFIG_FILENAME, DEFAULTS, DEFAULT_REMIND_WRITE_PATHS }
