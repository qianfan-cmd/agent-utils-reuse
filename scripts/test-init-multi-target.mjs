#!/usr/bin/env node
/**
 * init --all vs default init directory layout.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(__dirname, '..')
const cli = path.join(pkgRoot, 'bin/cli.mjs')

function runInit(projectRoot, args) {
  return spawnSync(process.execPath, [cli, 'init', '--yes', ...args, '--cwd', projectRoot], {
    encoding: 'utf8',
    cwd: pkgRoot
  })
}

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'utils-gate-init-'))
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'init-test', private: true }, null, 2)
  )
  return root
}

function main() {
  const defaultRoot = makeProject()
  const r1 = runInit(defaultRoot, [])
  assert.equal(r1.status, 0, r1.stderr || r1.stdout)
  assert.ok(fs.existsSync(path.join(defaultRoot, '.cursor', 'hooks.json')))
  assert.ok(!fs.existsSync(path.join(defaultRoot, '.claude', 'settings.json')))
  assert.ok(!fs.existsSync(path.join(defaultRoot, '.codex', 'hooks.json')))
  console.log('OK: default init → .cursor only')

  const allRoot = makeProject()
  const r2 = runInit(allRoot, ['--all'])
  assert.equal(r2.status, 0, r2.stderr || r2.stdout)
  assert.ok(fs.existsSync(path.join(allRoot, '.cursor', 'hooks.json')))
  assert.ok(fs.existsSync(path.join(allRoot, '.claude', 'settings.json')))
  assert.ok(fs.existsSync(path.join(allRoot, '.codex', 'hooks.json')))
  assert.ok(fs.existsSync(path.join(allRoot, '.claude', 'rules', 'utils-reuse-gate.md')))
  assert.ok(fs.existsSync(path.join(allRoot, '.agents', 'skills', 'reuse-before-create', 'SKILL.md')))
  const bookrc = JSON.parse(fs.readFileSync(path.join(allRoot, '.utils-bookrc.json'), 'utf8'))
  assert.deepEqual(bookrc.installedAgentTargets, ['cursor', 'claude', 'codex'])
  console.log('OK: init --all → cursor + claude + codex')

  console.log('\nAll init multi-target tests passed.')
}

main()
