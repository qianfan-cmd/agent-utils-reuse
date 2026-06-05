import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONFIG_FILENAME, defaultConfigRaw, resolveConfig } from './load-config.mjs'
import { mergeHooksJson, mergePackageScripts } from './merge-json.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(__dirname, '..')
const TEMPLATES_ROOT = path.join(PACKAGE_ROOT, 'templates')

function copyDir(src, dest, { force = false } = {}) {
  if (!fs.existsSync(src)) return { copied: 0, skipped: 0 }
  fs.mkdirSync(dest, { recursive: true })
  let copied = 0
  let skipped = 0

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      const sub = copyDir(from, to, { force })
      copied += sub.copied
      skipped += sub.skipped
    } else {
      if (fs.existsSync(to) && !force) {
        skipped++
        continue
      }
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.copyFileSync(from, to)
      copied++
    }
  }

  return { copied, skipped }
}

function writeConfig(projectRoot, raw, force) {
  const configPath = path.join(projectRoot, CONFIG_FILENAME)
  if (fs.existsSync(configPath) && !force) {
    return { written: false, path: configPath }
  }
  fs.writeFileSync(configPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8')
  return { written: true, path: configPath }
}

function patchPackageJson(projectRoot, config) {
  const pkgPath = path.join(projectRoot, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    throw new Error('package.json not found in project root')
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const bookDirRel = config.utilsBookDir.replace(/\\/g, '/')
  const merged = mergePackageScripts(pkg, {
    'gen:utils-book': 'agent-utils-reuse gen',
    'check:utils-book': `agent-utils-reuse gen && git diff --exit-code ${bookDirRel}/`
  })

  fs.writeFileSync(pkgPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8')
  return merged.scripts
}

function patchHooksJson(projectRoot, force) {
  const hooksPath = path.join(projectRoot, '.cursor', 'hooks.json')
  const fragmentPath = path.join(TEMPLATES_ROOT, 'cursor', 'hooks.json.fragment')
  const fragment = JSON.parse(fs.readFileSync(fragmentPath, 'utf8'))

  let existing = null
  if (fs.existsSync(hooksPath)) {
    existing = JSON.parse(fs.readFileSync(hooksPath, 'utf8'))
  } else if (!force) {
    existing = { version: 1, hooks: {} }
  } else {
    existing = { version: 1, hooks: {} }
  }

  const merged = mergeHooksJson(existing, fragment)
  fs.mkdirSync(path.dirname(hooksPath), { recursive: true })
  fs.writeFileSync(hooksPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8')
  return hooksPath
}

function copyExamples(projectRoot, config, force) {
  const examplesSrc = path.join(PACKAGE_ROOT, 'examples', 'minimal', 'src', 'utils', 'array')
  const dest = path.join(projectRoot, config.utilsDir, 'array')
  if (!fs.existsSync(examplesSrc)) return { copied: 0, skipped: 0 }
  return copyDir(examplesSrc, dest, { force })
}

export function runInit(cwd, options = {}) {
  const { yes = false, force = false, withExamples = false } = options
  const projectRoot = path.resolve(cwd)

  if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
    throw new Error('Run init from your project root (package.json required)')
  }

  const raw = defaultConfigRaw()
  const config = resolveConfig(raw, projectRoot)

  const configResult = writeConfig(projectRoot, raw, force)

  const docsSrc = path.join(TEMPLATES_ROOT, 'docs', 'agent-catalog')
  const docsDest = path.join(projectRoot, config.catalogDir)
  const docsCopy = copyDir(docsSrc, docsDest, { force })

  const cursorSrc = path.join(TEMPLATES_ROOT, 'cursor')
  const cursorDest = path.join(projectRoot, '.cursor')
  const cursorCopy = copyDir(cursorSrc, cursorDest, { force })

  const scripts = patchPackageJson(projectRoot, config)
  const hooksPath = patchHooksJson(projectRoot, force)

  let examplesCopy = { copied: 0, skipped: 0 }
  if (withExamples) {
    examplesCopy = copyExamples(projectRoot, config, force)
  }

  const snippetPath = path.join(TEMPLATES_ROOT, 'snippets', 'AGENTS.utils-reuse.md')
  const snippet = fs.readFileSync(snippetPath, 'utf8')

  return {
    projectRoot,
    config,
    configResult,
    docsCopy,
    cursorCopy,
    examplesCopy,
    scripts,
    hooksPath,
    snippet,
    yes
  }
}

export function printInitSummary(result) {
  const { configResult, docsCopy, cursorCopy, examplesCopy, scripts, hooksPath, snippet } = result

  console.log('')
  console.log('agent-utils-reuse init complete')
  console.log('')
  console.log(`  Config: ${configResult.written ? 'created' : 'kept'} ${configResult.path}`)
  console.log(`  Docs:   copied ${docsCopy.copied}, skipped ${docsCopy.skipped} (existing)`)
  console.log(`  Cursor: copied ${cursorCopy.copied}, skipped ${cursorCopy.skipped} (existing)`)
  if (examplesCopy.copied || examplesCopy.skipped) {
    console.log(`  Examples: copied ${examplesCopy.copied}, skipped ${examplesCopy.skipped}`)
  }
  console.log(`  Hooks:  ${hooksPath}`)
  console.log('')
  console.log('  package.json scripts:')
  for (const [k, v] of Object.entries(scripts)) {
    if (k.includes('utils-book')) console.log(`    "${k}": "${v}"`)
  }
  console.log('')
  console.log('Next steps:')
  console.log('  1. Merge the following into your AGENTS.md (or equivalent):')
  console.log('')
  console.log(snippet.split('\n').map((l) => `     ${l}`).join('\n'))
  console.log('')
  console.log('  2. Add utils under your configured utilsDir, with optional JSDoc @utils-book tags')
  console.log('  3. Run: pnpm gen:utils-book')
  console.log('  4. Optional CI: pnpm check:utils-book')
  console.log('')
}
