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

  projectAgentCoreRule: null,

  sameTurnAllow: true,

  maxImportSymbolsPerTurn: 5,

  agentsReadMode: 'tool',

  lightGatePaths: [],

  searchSynonyms: {},

  crossFileSiblingGroups: []

}



/** Effective strict gate flags — `hookMode: confirm` enables workflow checks by default; explicit false opts out. */
export function resolveConfirmGateFlags(raw, hookMode) {
  const isConfirm = hookMode === 'confirm'
  const tri = (key, confirmDefault) => {
    if (raw[key] === true) return true
    if (raw[key] === false) return false
    return confirmDefault
  }
  return {
    requireDiscoveryForUtilGate: tri('requireDiscoveryForUtilGate', isConfirm),
    preferCliSearch: tri('preferCliSearch', isConfirm),
    strictBatchLimit: tri('strictBatchLimit', isConfirm),
    allowBusinessDiscovery: tri('allowBusinessDiscovery', true)
  }
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

  const merged = raw ?? {}

  const projectRoot = path.resolve(cwd, merged.projectRoot ?? DEFAULTS.projectRoot)

  const utilsDir = merged.utilsDir ?? DEFAULTS.utilsDir

  const catalogDir = merged.catalogDir ?? DEFAULTS.catalogDir

  const utilsBookDir = merged.utilsBookDir ?? DEFAULTS.utilsBookDir

  const utilsIndexFile = merged.utilsIndexFile ?? DEFAULTS.utilsIndexFile

  const skillsDir = merged.skillsDir ?? DEFAULTS.skillsDir

  const agentsFile = merged.agentsFile ?? DEFAULTS.agentsFile

  const jsdocTag = merged.jsdocTag ?? DEFAULTS.jsdocTag

  const remindWritePaths = normalizeRemindPaths(merged.remindWritePaths)

  const utilsImportAliases = normalizeImportAliases(merged.utilsImportAliases)

  const hookMode = normalizeHookMode(merged.hookMode)

  const gateFlags = resolveConfirmGateFlags(merged, hookMode)

  const projectAgentCoreRule =
    merged.projectAgentCoreRule != null && String(merged.projectAgentCoreRule).trim()
      ? String(merged.projectAgentCoreRule).replace(/\\/g, '/')
      : null

  const sameTurnAllow = merged.sameTurnAllow !== false

  const maxImportSymbolsPerTurn = (() => {
    const n = parseInt(merged.maxImportSymbolsPerTurn, 10)
    return Number.isFinite(n) && n > 0 ? n : 5
  })()

  const agentsReadMode = String(merged.agentsReadMode ?? 'tool').toLowerCase() === 'session' ? 'session' : 'tool'

  const lightGatePaths = Array.isArray(merged.lightGatePaths)
    ? merged.lightGatePaths.map((p) => String(p).replace(/\\/g, '/').replace(/\/+$/, ''))
    : []

  const searchSynonyms =
    merged.searchSynonyms && typeof merged.searchSynonyms === 'object' ? { ...merged.searchSynonyms } : {}

  const crossFileSiblingGroups = Array.isArray(merged.crossFileSiblingGroups)
    ? merged.crossFileSiblingGroups.map((g) => (Array.isArray(g) ? g.map(String) : []))
    : []

  const requireDiscoveryForUtilGate = gateFlags.requireDiscoveryForUtilGate

  const preferCliSearch = gateFlags.preferCliSearch

  const strictBatchLimit = gateFlags.strictBatchLimit

  const allowBusinessDiscovery = gateFlags.allowBusinessDiscovery



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

    sameTurnAllow,

    maxImportSymbolsPerTurn,

    agentsReadMode,

    lightGatePaths,

    searchSynonyms,

    crossFileSiblingGroups,

    requireDiscoveryForUtilGate,

    preferCliSearch,

    strictBatchLimit,

    allowBusinessDiscovery,

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

    sameTurnAllow: DEFAULTS.sameTurnAllow,

    maxImportSymbolsPerTurn: DEFAULTS.maxImportSymbolsPerTurn,

    agentsReadMode: DEFAULTS.agentsReadMode,

    lightGatePaths: [...DEFAULTS.lightGatePaths],

    searchSynonyms: { ...DEFAULTS.searchSynonyms },

    crossFileSiblingGroups: [...DEFAULTS.crossFileSiblingGroups],

    sourceGlobs: ['src/**/*.{vue,ts,tsx}']

  }

}



export { CONFIG_FILENAME, DEFAULTS, DEFAULT_REMIND_WRITE_PATHS, DEFAULT_IMPORT_ALIASES }


