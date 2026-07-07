#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import { AGENTS_BLOCK_START } from '../lib/merge-agents.mjs'
import {
  GATE_GENERATED_CATALOG_FILES,
  MERGEABLE_GATE_DOC_FILES,
  PACKAGE_HOOK_FILES,
  PACKAGE_RULE_FILES
} from '../lib/sync-package-files.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(__dirname, '..')
const CLI = path.join(PACKAGE_ROOT, 'bin', 'cli.mjs')

function runCli(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    shell: false
  })
}

function setupTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-utils-reuse-uninstall-'))
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'uninstall-test-project',
        private: true,
        devDependencies: {
          'agent-utils-reuse': `file:${PACKAGE_ROOT.replace(/\\/g, '/')}`
        }
      },
      null,
      2
    )}\n`,
    'utf8'
  )

  const install = spawnSync('npm', ['install'], {
    cwd: dir,
    encoding: 'utf8',
    shell: process.platform === 'win32'
  })
  if (install.status !== 0) {
    throw new Error(`npm install failed: ${install.stderr}`)
  }

  const init = runCli(['init', '--yes', '--force'], dir)
  if (init.status !== 0) {
    throw new Error(`init failed: ${init.stderr}`)
  }

  fs.mkdirSync(path.join(dir, 'src', 'utils'), { recursive: true })

  const gen = runCli(['gen'], dir)
  if (gen.status !== 0) {
    throw new Error(`gen failed: ${gen.stderr}`)
  }

  return dir
}

try {
  const projectRoot = setupTempProject()
  const catalogDir = 'docs/agent-catalog'

  assert.ok(fs.existsSync(path.join(projectRoot, '.utils-bookrc.json')), 'bookrc should exist after init')
  assert.ok(
    fs.existsSync(path.join(projectRoot, catalogDir, 'utils-index.json')),
    'utils-index should exist after gen'
  )

  const dryRun = runCli(['uninstall', '--dry-run'], projectRoot)
  assert.equal(dryRun.status, 0, dryRun.stderr)
  assert.match(dryRun.stdout, /dry-run/i)
  assert.ok(fs.existsSync(path.join(projectRoot, '.utils-bookrc.json')), 'dry-run must not delete bookrc')

  const uninstall = runCli(['uninstall', '--yes'], projectRoot)
  assert.equal(uninstall.status, 0, uninstall.stderr)
  assert.match(uninstall.stdout, /uninstall complete/i)

  assert.ok(!fs.existsSync(path.join(projectRoot, '.utils-bookrc.json')), 'bookrc removed')
  assert.ok(!fs.existsSync(path.join(projectRoot, catalogDir, 'utils-index.json')), 'index removed')
  assert.ok(!fs.existsSync(path.join(projectRoot, catalogDir, 'utils-book')), 'utils-book removed')

  for (const name of PACKAGE_RULE_FILES) {
    assert.ok(!fs.existsSync(path.join(projectRoot, '.cursor', 'rules', name)), `rule ${name} removed`)
  }
  for (const name of PACKAGE_HOOK_FILES) {
    assert.ok(!fs.existsSync(path.join(projectRoot, '.cursor', 'hooks', name)), `hook ${name} removed`)
  }
  for (const name of MERGEABLE_GATE_DOC_FILES) {
    assert.ok(!fs.existsSync(path.join(projectRoot, catalogDir, name)), `doc ${name} removed`)
  }
  for (const name of GATE_GENERATED_CATALOG_FILES) {
    assert.ok(!fs.existsSync(path.join(projectRoot, catalogDir, name)), `generated ${name} removed`)
  }
  assert.ok(!fs.existsSync(path.join(projectRoot, catalogDir)), 'catalog dir removed when empty')

  const agents = fs.readFileSync(path.join(projectRoot, 'AGENTS.md'), 'utf8')
  assert.ok(!agents.includes(AGENTS_BLOCK_START), 'AGENTS marker block removed')

  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
  assert.equal(pkg.devDependencies?.['agent-utils-reuse'], undefined, 'dependency removed')
  assert.equal(pkg.scripts?.['upgrade:utils-reuse'], undefined, 'upgrade script removed')
  assert.equal(pkg.scripts?.['gen:utils-book'], undefined, 'gen script removed')

  const status = runCli(['status'], projectRoot)
  assert.equal(status.status, 0, status.stderr)

  console.log('test-uninstall: OK')
} catch (err) {
  console.error(err)
  process.exit(1)
}
