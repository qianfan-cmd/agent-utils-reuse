import fs from 'node:fs'

import path from 'node:path'



const CONFIG_FILENAME = '.utils-bookrc.json'

const DEFAULT_REMIND_WRITE_PATHS = ['src/feature', 'src/components', 'src/hooks', 'src/views']

const DEFAULT_IMPORT_ALIASES = ['@/utils']



const DEFAULTS = {

  projectRoot: '.',

  utilsDir: 'src/utils',

  catalogDir: 'docs/agent-catalog',

  utilsBookDir: 'docs/agent-catalog/utils-book',

  utilsIndexFile: 'docs/agent-catalog/utils-index.json',

  skillsDir: '.cursor/skills',

  agentsFile: 'AGENTS.md',

  jsdocTag: '@utils-book',

  remindWritePaths: DEFAULT_REMIND_WRITE_PATHS,

  utilsImportAliases: DEFAULT_IMPORT_ALIASES,

  hookMode: 'off',

  projectAgentCoreRule: null

}



function normalizeRemindPaths(raw) {

  if (raw === undefined) return [...DEFAULT_REMIND_WRITE_PATHS]

  if (!Array.isArray(raw)) return [...DEFAULT_REMIND_WRITE_PATHS]

  return raw.map((p) => String(p).replace(/\\/g, '/').replace(/\/+$/, ''))

}



function normalizeImportAliases(raw) {

  if (raw === undefined) return [...DEFAULT_IMPORT_ALIASES]

  if (!Array.isArray(raw)) return [...DEFAULT_IMPORT_ALIASES]

  return raw.map((a) => String(a).replace(/\\/g, '/'))

}



function normalizeHookMode(raw) {
  const mode = String(raw ?? DEFAULTS.hookMode).toLowerCase()
  if (mode === 'remind') return 'remind'
  if (mode === 'confirm') return 'confirm'
  return 'off'
}



export function resolveConfig(raw, cwd) {

  const projectRoot = path.resolve(cwd, raw.projectRoot ?? DEFAULTS.projectRoot)

  const utilsDir = raw.utilsDir ?? DEFAULTS.utilsDir

  const catalogDir = raw.catalogDir ?? DEFAULTS.catalogDir

  const utilsBookDir = raw.utilsBookDir ?? DEFAULTS.utilsBookDir

  const utilsIndexFile = raw.utilsIndexFile ?? DEFAULTS.utilsIndexFile

  const skillsDir = raw.skillsDir ?? DEFAULTS.skillsDir

  const agentsFile = raw.agentsFile ?? DEFAULTS.agentsFile

  const jsdocTag = raw.jsdocTag ?? DEFAULTS.jsdocTag

  const remindWritePaths = normalizeRemindPaths(raw.remindWritePaths)

  const utilsImportAliases = normalizeImportAliases(raw.utilsImportAliases)

  const hookMode = normalizeHookMode(raw.hookMode)

  const projectAgentCoreRule =
    raw.projectAgentCoreRule != null && String(raw.projectAgentCoreRule).trim()
      ? String(raw.projectAgentCoreRule).replace(/\\/g, '/')
      : null



  return {

    projectRoot,

    utilsDir,

    catalogDir,

    utilsBookDir,

    utilsIndexFile,

    skillsDir,

    agentsFile,

    jsdocTag,

    remindWritePaths,

    utilsImportAliases,

    hookMode,

    projectAgentCoreRule,

    utilsRoot: path.join(projectRoot, utilsDir),

    bookDir: path.join(projectRoot, utilsBookDir),

    catalogRoot: path.join(projectRoot, catalogDir),

    indexFilePath: path.join(projectRoot, utilsIndexFile),

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

    utilsIndexFile: DEFAULTS.utilsIndexFile,

    skillsDir: DEFAULTS.skillsDir,

    agentsFile: DEFAULTS.agentsFile,

    jsdocTag: DEFAULTS.jsdocTag,

    remindWritePaths: [...DEFAULT_REMIND_WRITE_PATHS],

    utilsImportAliases: [...DEFAULT_IMPORT_ALIASES],

    hookMode: DEFAULTS.hookMode,

    sourceGlobs: ['src/**/*.{vue,ts,tsx}']

  }

}



export { CONFIG_FILENAME, DEFAULTS, DEFAULT_REMIND_WRITE_PATHS, DEFAULT_IMPORT_ALIASES }


