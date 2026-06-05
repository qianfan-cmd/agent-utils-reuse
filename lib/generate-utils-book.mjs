import fs from 'node:fs'
import path from 'node:path'

const NO_SUMMARY = '(无简介 — Confirm 前须 Read 实现)'

const EXPORT_FN = /export\s+(?:async\s+)?function\s+(\w+)/g
const EXPORT_CONST = /export\s+(?:async\s+)?const\s+(\w+)/g
const EXPORT_CLASS = /export\s+class\s+(\w+)/g
const EXPORT_NAMED = /export\s*\{\s*([^}]+)\}\s*(?!from)/g
const EXPORT_FROM = /export\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g
const EXPORT_STAR = /export\s+\*\s+from\s+['"]([^'"]+)['"]/g

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function utilsBookTagRe(tag) {
  const safe = escapeRegExp(tag.replace(/^@/, ''))
  return new RegExp(`@${safe}\\s+(.+)`)
}

function walkTsFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === '__mocks__') continue
      walkTsFiles(full, results)
    } else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      results.push(full)
    }
  }
  return results
}

function lineNumber(content, index) {
  return content.slice(0, index).split('\n').length
}

function extractBlockComments(content) {
  const blocks = []
  const re = /\/\*\*([\s\S]*?)\*\//g
  let m
  while ((m = re.exec(content)) !== null) {
    blocks.push({ index: m.index, end: m.index + m[0].length, text: m[1] })
  }
  return blocks
}

function firstSummaryLine(jsdocInner, tagRe) {
  const lines = jsdocInner
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, '').trim())
    .filter((l) => l)
  for (const line of lines) {
    if (line.startsWith('@')) {
      const tag = line.match(tagRe)
      if (tag) return tag[1].trim()
      continue
    }
    return line
  }
  return null
}

function jsdocBeforeInSegment(blocks, position, segmentStart, content, tagRe) {
  let best = null
  for (const b of blocks) {
    if (b.end <= position && b.index >= segmentStart && (!best || b.end > best.end)) {
      best = b
    }
  }
  if (!best) return null
  const between = content.slice(best.end, position)
  if (!/^\s*$/.test(between)) return null
  return firstSummaryLine(best.text, tagRe)
}

function offsetOfLine(content, lineNum) {
  let pos = 0
  let line = 1
  while (line < lineNum && pos < content.length) {
    const nl = content.indexOf('\n', pos)
    if (nl === -1) break
    pos = nl + 1
    line++
  }
  return pos
}

function findDefinitionIndex(content, name) {
  const safe = escapeRegExp(name)
  const patterns = [
    new RegExp(`(?:^|[;{}\\n])\\s*(?:export\\s+)?(?:async\\s+)?function\\s+${safe}\\s*\\(`, 'm'),
    new RegExp(`(?:^|[;{}\\n])\\s*(?:export\\s+)?const\\s+${safe}\\s*=`, 'm'),
    new RegExp(`(?:^|[;{}\\n])\\s*(?:export\\s+)?class\\s+${safe}\\b`, 'm')
  ]
  for (const re of patterns) {
    re.lastIndex = 0
    const m = re.exec(content)
    if (m) {
      const at = m[0].indexOf(name)
      return m.index + (at >= 0 ? at : 0)
    }
  }
  return null
}

function extractFilePurpose(content, rel, tagRe) {
  const blocks = extractBlockComments(content)
  const importIdx = content.search(/^\s*import\s/m)
  const scanEnd = importIdx >= 0 ? importIdx : Math.min(content.length, 800)
  for (const b of blocks) {
    if (b.index >= scanEnd) continue
    const tag = b.text.match(tagRe)
    if (tag) return tag[1].trim()
    const line = firstSummaryLine(b.text, tagRe)
    if (line) return line
  }
  const parts = rel.split('/')
  const file = parts[parts.length - 1].replace(/\.ts$/, '')
  const dir = parts.length > 1 ? parts[parts.length - 2] : 'utils 根目录'
  return `${dir} — ${file}`
}

function parseNamedExportList(block) {
  const symbols = []
  for (const part of block.split(',')) {
    const trimmed = part.trim()
    if (!trimmed || trimmed.startsWith('type ')) continue
    const m = trimmed.match(/(?:type\s+)?(\w+)(?:\s+as\s+(\w+))?/)
    if (m) symbols.push({ name: m[2] || m[1], kind: 're-export' })
  }
  return symbols
}

function extractClassStaticMethods(content, className, classStart, tagRe) {
  const methods = []
  const classBody = content.slice(classStart)
  const staticRe = /\/\*\*([\s\S]*?)\*\/\s*static\s+(?:async\s+)?(\w+)\s*\(/g
  let m
  while ((m = staticRe.exec(classBody)) !== null) {
    const absIndex = classStart + m.index
    methods.push({
      name: `${className}.${m[2]}`,
      summary: firstSummaryLine(m[1], tagRe) || NO_SUMMARY,
      line: lineNumber(content, absIndex),
      kind: 'static'
    })
  }
  return methods
}

function collectExportSites(content, tagRe) {
  const sites = []
  const push = (name, index, kind, extra = {}) => {
    if (name === 'default' || name === '*') return
    sites.push({ name, index, kind, ...extra })
  }

  for (const re of [EXPORT_FN, EXPORT_CONST]) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(content)) !== null) push(m[1], m.index, 'function')
  }

  EXPORT_CLASS.lastIndex = 0
  let cm
  while ((cm = EXPORT_CLASS.exec(content)) !== null) {
    const className = cm[1]
    push(className, cm.index, 'class')
    for (const sm of extractClassStaticMethods(content, className, cm.index, tagRe)) {
      sites.push({
        name: sm.name,
        index: offsetOfLine(content, sm.line),
        kind: 'static',
        summary: sm.summary,
        line: sm.line
      })
    }
  }

  EXPORT_FROM.lastIndex = 0
  let fromM
  while ((fromM = EXPORT_FROM.exec(content)) !== null) {
    const fromPath = fromM[2]
    for (const sym of parseNamedExportList(fromM[1])) {
      sites.push({
        name: sym.name,
        index: fromM.index,
        kind: 're-export',
        summary: `re-export from \`${fromPath}\``,
        from: fromPath
      })
    }
  }

  EXPORT_STAR.lastIndex = 0
  let starM
  while ((starM = EXPORT_STAR.exec(content)) !== null) {
    sites.push({
      name: '*',
      index: starM.index,
      kind: 're-export-all',
      summary: `re-export all from \`${starM[1]}\``,
      from: starM[1]
    })
  }

  EXPORT_NAMED.lastIndex = 0
  let namedM
  while ((namedM = EXPORT_NAMED.exec(content)) !== null) {
    if (/from\s+['"]/.test(namedM[0])) continue
    for (const sym of parseNamedExportList(namedM[1])) {
      const defIdx = findDefinitionIndex(content, sym.name)
      push(sym.name, defIdx ?? namedM.index, defIdx != null ? 'function' : 'named')
    }
  }

  return sites.sort((a, b) => a.index - b.index)
}

function createGenerator(config) {
  const tagRe = utilsBookTagRe(config.jsdocTag)
  const utilsRoot = config.utilsRoot
  const pathPrefix = config.utilsPathPrefix

  function relFromUtils(absPath) {
    return path.relative(utilsRoot, absPath).replace(/\\/g, '/')
  }

  function chapterFromRel(rel) {
    const parts = rel.split('/')
    return parts.length > 1 ? parts[0] : '_root'
  }

  function extractExportsFromFile(absPath) {
    const content = fs.readFileSync(absPath, 'utf8')
    const rel = relFromUtils(absPath)
    const blocks = extractBlockComments(content)
    const sites = collectExportSites(content, tagRe)
    const entries = []

    const sitesByLine = [...sites].sort(
      (a, b) => lineNumber(content, a.index) - lineNumber(content, b.index)
    )
    const segmentStartByIndex = new Map()
    for (let i = 0; i < sitesByLine.length; i++) {
      segmentStartByIndex.set(sitesByLine[i].index, i === 0 ? 0 : sitesByLine[i - 1].index)
    }

    for (const site of sites) {
      const segmentStart = segmentStartByIndex.get(site.index) ?? 0
      if (site.kind === 're-export' || site.kind === 're-export-all') {
        entries.push({
          name: site.name,
          summary: site.summary,
          line: lineNumber(content, site.index),
          kind: site.kind,
          from: site.from
        })
        continue
      }
      if (site.kind === 'static' && site.summary) {
        entries.push({ name: site.name, summary: site.summary, line: site.line, kind: 'static' })
        continue
      }
      const summary =
        jsdocBeforeInSegment(blocks, site.index, segmentStart, content, tagRe) ||
        site.summary ||
        NO_SUMMARY
      entries.push({
        name: site.name,
        summary,
        line: lineNumber(content, site.index),
        kind: site.kind
      })
    }

    const seen = new Set()
    const deduped = []
    for (const e of entries) {
      const key = `${e.name}:${e.line}`
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(e)
    }
    deduped.sort((a, b) => a.line - b.line)

    return {
      rel,
      path: `${pathPrefix}/${rel}`,
      purpose: extractFilePurpose(content, rel, tagRe),
      entries: deduped
    }
  }

  function collectAllFiles() {
    const files = walkTsFiles(utilsRoot).sort((a, b) =>
      relFromUtils(a).localeCompare(relFromUtils(b))
    )
    return files.map(extractExportsFromFile)
  }

  function buildSymbolIndex(fileRecords) {
    const index = new Map()
    for (const file of fileRecords) {
      for (const e of file.entries) {
        if (e.name === '*' || e.kind === 're-export-all') continue
        const baseName = e.name.includes('.') ? e.name.split('.').pop() : e.name
        if (!index.has(baseName)) index.set(baseName, [])
        index.get(baseName).push({ symbol: e.name, path: file.path, rel: file.rel })
      }
    }
    const ambiguous = new Map()
    for (const [sym, paths] of index) {
      const uniquePaths = [...new Set(paths.map((p) => p.path))]
      if (uniquePaths.length > 1) ambiguous.set(sym, paths)
    }
    return { index, ambiguous }
  }

  function renderChapter(chapter, files, ambiguous) {
    const title =
      chapter === '_root'
        ? `第 _root 章 — ${pathPrefix} 根目录`
        : `第 ${chapter} 章 — ${pathPrefix}/${chapter}/`

    const lines = [
      `# Utils 工具书 — ${title}`,
      '',
      '> **DO NOT EDIT** — 由 `pnpm gen:utils-book` 生成。',
      '',
      '摘要仅供 **Shortlist**；**reuse** 须在 Read 源码并完成 **Confirm（五问）** 之后。',
      ''
    ]

    for (const file of files) {
      lines.push(`### \`${file.rel}\``)
      lines.push('')
      lines.push(`**路径**: \`${file.path}\``)
      lines.push('')
      lines.push(`**用途**: ${file.purpose}`)
      lines.push('')

      if (file.entries.length === 0) {
        lines.push('_（无可索引的 export）_')
        lines.push('')
        continue
      }

      lines.push('| 符号 | 摘要 | 行号 |')
      lines.push('|------|------|------|')
      for (const e of file.entries) {
        const amb =
          ambiguous.has(e.name.split('.').pop()) || ambiguous.has(e.name) ? ' ⚠️同名' : ''
        const summary = (e.summary || NO_SUMMARY).replace(/\|/g, '\\|').replace(/\n/g, ' ')
        lines.push(`| \`${e.name}\`${amb} | ${summary} | L${e.line} |`)
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  function renderIndex(chapters, fileRecords, ambiguous, stats) {
    const catalogRel = path
      .relative(config.projectRoot, config.catalogRoot)
      .replace(/\\/g, '/')
    const bookRel = path
      .relative(config.catalogRoot, config.bookDir)
      .replace(/\\/g, '/')

    const lines = [
      '# Utils 工具书 — 目录',
      '',
      '> **DO NOT EDIT** — 由 `pnpm gen:utils-book` 生成。',
      '',
      '## 怎么用（像书本：先目录，再读一章）',
      '',
      `**不要**把 \`${bookRel}/\` 下所有章 md 全文 Read 一遍。`,
      '',
      '1. **只 Read 本文件 `index.md`**（目录 + 章链接）',
      '2. 按任务 **只 Read 1 个相关章**',
      '3. 在该章内 **Shortlist** 候选符号',
      '4. **Confirm（五问）**：Read 源码 — 见 [`placement-decision.md`](../placement-decision.md) §1',
      '5. **最终 Verdict**：reuse / newUtil / featureLocal',
      '',
      `不确定选哪章：\`Grep ${catalogRel}/${bookRel}/\`；仍只展开命中的章。`,
      '',
      '### 章导航',
      '',
      '| 章 | 读这一章 |',
      '|----|----------|'
    ]

    const sorted = [...chapters.keys()].sort((a, b) => {
      if (a === '_root') return -1
      if (b === '_root') return 1
      return a.localeCompare(b)
    })

    for (const ch of sorted) {
      const md = ch === '_root' ? '_root.md' : `${ch}.md`
      lines.push(`| ${ch} | [${md}](${md}) |`)
    }

    lines.push('')
    lines.push('## 章列表')
    lines.push('')
    lines.push('| 章 | 文件数 | 路径 |')
    lines.push('|----|--------|------|')

    for (const ch of sorted) {
      const files = chapters.get(ch)
      const md = ch === '_root' ? '_root.md' : `${ch}.md`
      const label = ch === '_root' ? `${pathPrefix}/（根）` : `${pathPrefix}/${ch}/`
      lines.push(`| [${ch}](${md}) | ${files.length} | \`${label}\` |`)
    }

    lines.push('')
    lines.push(`共 **${fileRecords.length}** 个文件，**${stats.totalSymbols}** 个可索引符号。`)
    lines.push(
      `JSDoc/文件头摘要覆盖率: **${stats.withSummary}** / ${stats.totalSymbols} (${stats.pct}%)`
    )
    lines.push('')

    if (ambiguous.size > 0) {
      lines.push('## 附录：同名符号（禁止仅凭名字 reuse）')
      lines.push('')
      for (const sym of [...ambiguous.keys()].sort()) {
        const paths = ambiguous.get(sym)
        const unique = [...new Map(paths.map((p) => [p.path, p])).values()]
        lines.push(`### \`${sym}\``)
        for (const p of unique) {
          lines.push(`- \`${p.symbol}\` @ \`${p.path}\``)
        }
        lines.push('')
      }
    }

    return lines.join('\n')
  }

  function findSkillFiles() {
    const roots = [config.skillsRoot]
    const skills = []

    for (const root of roots) {
      if (!fs.existsSync(root)) continue
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const skillMd = path.join(root, entry.name, 'SKILL.md')
        if (!fs.existsSync(skillMd)) continue
        const content = fs.readFileSync(skillMd, 'utf8')
        const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
        let name = entry.name
        let description = '(no description)'
        if (match) {
          const yaml = match[1]
          name = yaml.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? name
          description =
            yaml.match(/^description:\s*(.+)$/m)?.[1]?.trim() ??
            yaml.match(/^description:\s*>-?\s*\r?\n([\s\S]*?)(?:\r?\n\w|\r?\n---|$)/m)?.[1]?.trim() ??
            description
          if (description && description.includes('\n')) {
            description = description
              .split('\n')
              .map((l) => l.trim())
              .join(' ')
          }
        }
        skills.push({
          name,
          description: String(description).slice(0, 120),
          path: path.relative(config.projectRoot, skillMd).replace(/\\/g, '/')
        })
      }
    }

    return skills.sort((a, b) => a.name.localeCompare(b.name))
  }

  function renderSkills(skills) {
    const lines = [
      '# Agent Skills 索引 — 自动生成',
      '',
      '> **DO NOT EDIT** — 由 `pnpm gen:utils-book` 生成。',
      '',
      '| Skill | 说明 | 路径 |',
      '|-------|------|------|'
    ]
    for (const s of skills) {
      const desc = s.description.replace(/\|/g, '\\|')
      lines.push(`| \`${s.name}\` | ${desc} | \`${s.path}\` |`)
    }
    lines.push('')
    return lines.join('\n')
  }

  return {
    collectAllFiles,
    buildSymbolIndex,
    renderChapter,
    renderIndex,
    renderSkills,
    findSkillFiles,
    chapterFromRel
  }
}

export function generateUtilsBook(config, { check = false } = {}) {
  if (!fs.existsSync(config.utilsRoot)) {
    console.error(`utilsDir not found: ${config.utilsRoot}`)
    console.error('Create the directory or update .utils-bookrc.json')
    process.exit(1)
  }

  const gen = createGenerator(config)
  const fileRecords = gen.collectAllFiles()
  const chapters = new Map()

  for (const file of fileRecords) {
    const ch = gen.chapterFromRel(file.rel)
    if (!chapters.has(ch)) chapters.set(ch, [])
    chapters.get(ch).push(file)
  }

  const { ambiguous } = gen.buildSymbolIndex(fileRecords)

  let totalSymbols = 0
  let withSummary = 0
  for (const file of fileRecords) {
    for (const e of file.entries) {
      if (e.name === '*' || e.kind === 're-export-all') continue
      totalSymbols++
      if (e.summary && e.summary !== NO_SUMMARY && !e.summary.startsWith('re-export')) {
        withSummary++
      }
    }
  }

  const stats = {
    totalSymbols,
    withSummary,
    pct: totalSymbols ? Math.round((withSummary / totalSymbols) * 100) : 0
  }

  fs.mkdirSync(config.bookDir, { recursive: true })

  const indexMd = gen.renderIndex(chapters, fileRecords, ambiguous, stats)
  fs.writeFileSync(path.join(config.bookDir, 'index.md'), indexMd, 'utf8')

  for (const [ch, files] of chapters) {
    const md = gen.renderChapter(ch, files, ambiguous)
    const outName = ch === '_root' ? '_root.md' : `${ch}.md`
    fs.writeFileSync(path.join(config.bookDir, outName), md, 'utf8')
  }

  const skills = gen.findSkillFiles()
  fs.writeFileSync(path.join(config.catalogRoot, 'skills.md'), gen.renderSkills(skills), 'utf8')

  console.log(`Wrote utils-book/index.md + ${chapters.size} chapters`)
  console.log(`Files: ${fileRecords.length}, symbols: ${totalSymbols}, ambiguous: ${ambiguous.size}`)
  console.log(`JSDoc coverage: ${stats.withSummary}/${totalSymbols} (${stats.pct}%)`)

  if (check && stats.pct < 30) {
    console.error('--check: JSDoc coverage below 30%')
    process.exit(1)
  }

  return stats
}
