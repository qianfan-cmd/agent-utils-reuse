#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const CONFIG_FILENAME = '.utils-bookrc.json'
const DEFAULT_UTILS_DIR = 'src/utils'
const DEFAULT_REMIND_PATHS = ['src/feature', 'src/components', 'src/hooks', 'src/views']
const PLACEMENT_SECTION = 'docs/agent-catalog/placement-decision.md section 1'

function loadConfig() {
  const base = {
    utilsDir: DEFAULT_UTILS_DIR,
    remindWritePaths: DEFAULT_REMIND_PATHS
  }
  try {
    const configPath = path.join(process.cwd(), CONFIG_FILENAME)
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      if (raw.utilsDir) base.utilsDir = String(raw.utilsDir).replace(/\\/g, '/')
      if (Array.isArray(raw.remindWritePaths)) {
        base.remindWritePaths = raw.remindWritePaths.map((p) =>
          String(p).replace(/\\/g, '/').replace(/\/+$/, '')
        )
      }
    }
  } catch {
    /* use defaults */
  }
  return base
}

function utilsPathRe(utilsDir) {
  const escaped = utilsDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[/\\\\])${escaped}(?:[/\\\\]|$)`, 'i')
}

function remindPathRes(prefixes) {
  return prefixes
    .filter(Boolean)
    .map((prefix) => {
      const normalized = prefix.replace(/\\/g, '/').replace(/\/+$/, '')
      const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return new RegExp(`(?:^|[/\\\\])${escaped}(?:[/\\\\]|$)`, 'i')
    })
}

const config = loadConfig()
const UTILS_PATH_RE = utilsPathRe(config.utilsDir)
const REMIND_PATH_RES = remindPathRes(config.remindWritePaths)

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function extractPath(input) {
  const toolInput = input.tool_input ?? input.arguments ?? input
  if (typeof toolInput === 'string') {
    try {
      const parsed = JSON.parse(toolInput)
      return parsed.path ?? parsed.file_path
    } catch {
      return null
    }
  }
  return toolInput.path ?? toolInput.file_path ?? toolInput.target_notebook
}

function normalizePath(filePath) {
  return String(filePath).replace(/\\/g, '/')
}

function matchRemindPath(normalized) {
  return REMIND_PATH_RES.some((re) => re.test(normalized))
}

async function main() {
  try {
    const raw = await readStdin()
    if (!raw.trim()) {
      process.stdout.write(JSON.stringify({ permission: 'allow' }))
      return
    }
    const input = JSON.parse(raw)
    const filePath = extractPath(input)
    if (!filePath) {
      process.stdout.write(JSON.stringify({ permission: 'allow' }))
      return
    }

    const normalized = normalizePath(filePath)

    if (UTILS_PATH_RE.test(normalized)) {
      process.stdout.write(
        JSON.stringify({
          permission: 'allow',
          agent_message: `Reminder: Before writing shared utils, output Discovery + Confirm (five questions Q1-Q5) + final Verdict in chat (not a cache file). Read utils-book first; reuse only after Confirm passes. See ${PLACEMENT_SECTION}.`
        })
      )
      return
    }

    if (matchRemindPath(normalized)) {
      process.stdout.write(
        JSON.stringify({
          permission: 'allow',
          agent_message: `Reminder: This task may need shared utils. Follow utils-reuse-gate: Read AGENTS.md utils section + placement-decision + utils-book (index + 1 chapter), output Discovery + Confirm + Verdict in chat before Write. Do not write .utils-discovery-cache.json. See ${PLACEMENT_SECTION}.`
        })
      )
      return
    }

    process.stdout.write(JSON.stringify({ permission: 'allow' }))
  } catch {
    process.stdout.write(JSON.stringify({ permission: 'allow' }))
  }
}

main()
