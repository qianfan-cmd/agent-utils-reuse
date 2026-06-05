import fs from 'node:fs'
import path from 'node:path'

const CONFIG_FILENAME = '.utils-bookrc.json'

const DEFAULTS = {
  projectRoot: '.',
  utilsDir: 'src/utils',
  catalogDir: 'docs/agent-catalog',
  utilsBookDir: 'docs/agent-catalog/utils-book',
  skillsDir: '.cursor/skills',
  jsdocTag: '@utils-book'
}

export function resolveConfig(raw, cwd) {
  const projectRoot = path.resolve(cwd, raw.projectRoot ?? DEFAULTS.projectRoot)
  const utilsDir = raw.utilsDir ?? DEFAULTS.utilsDir
  const catalogDir = raw.catalogDir ?? DEFAULTS.catalogDir
  const utilsBookDir = raw.utilsBookDir ?? DEFAULTS.utilsBookDir
  const skillsDir = raw.skillsDir ?? DEFAULTS.skillsDir
  const jsdocTag = raw.jsdocTag ?? DEFAULTS.jsdocTag

  return {
    projectRoot,
    utilsDir,
    catalogDir,
    utilsBookDir,
    skillsDir,
    jsdocTag,
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
  return { ...DEFAULTS }
}

export { CONFIG_FILENAME, DEFAULTS }
