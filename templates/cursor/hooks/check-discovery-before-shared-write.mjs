#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

function loadUtilsDir() {
  try {
    const configPath = path.join(process.cwd(), '.utils-bookrc.json')
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      if (raw.utilsDir) return String(raw.utilsDir).replace(/\\/g, '/')
    }
  } catch {
    /* use default */
  }
  return 'src/utils'
}

function utilsPathRe(utilsDir) {
  const escaped = utilsDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[/\\\\])${escaped}(?:[/\\\\]|$)`, 'i')
}

const UTILS_PATH_RE = utilsPathRe(loadUtilsDir())

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

async function main() {
  try {
    const raw = await readStdin()
    if (!raw.trim()) {
      process.stdout.write(JSON.stringify({ permission: 'allow' }))
      return
    }
    const input = JSON.parse(raw)
    const filePath = extractPath(input)
    if (!filePath || !UTILS_PATH_RE.test(String(filePath).replace(/\\/g, '/'))) {
      process.stdout.write(JSON.stringify({ permission: 'allow' }))
      return
    }
    process.stdout.write(
      JSON.stringify({
        permission: 'allow',
        agent_message:
          'Reminder: Before writing shared utils, output Discovery + Confirm (five questions Q1-Q5) + final Verdict. Read utils-book first; reuse only after Confirm passes. See docs/agent-catalog/placement-decision.md section 1.'
      })
    )
  } catch {
    process.stdout.write(JSON.stringify({ permission: 'allow' }))
  }
}

main()
