#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import { UPSTREAM_SIDECAR_SUFFIX } from '../lib/gate-sync-manifest.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(__dirname, '..')
const CLI = path.join(PACKAGE_ROOT, 'bin', 'cli.mjs')

function runCli(args, cwd) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    shell: false
  })
  return result
}

function setupTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-utils-reuse-update-'))
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'update-test-project',
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
  return dir
}

function readBookrc(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, '.utils-bookrc.json'), 'utf8'))
}

try {
  const projectRoot = setupTempProject()
  const catalogDir = 'docs/agent-catalog'
  const placementPath = path.join(projectRoot, catalogDir, 'placement-decision.md')
  const sidecarPath = `${placementPath}${UPSTREAM_SIDECAR_SUFFIX}`

  fs.writeFileSync(
    path.join(projectRoot, '.cursor', 'rules', 'reuse-first-stop.mdc'),
    'deprecated rule\n',
    'utf8'
  )
  fs.writeFileSync(
    path.join(projectRoot, '.utils-bookrc.json'),
    `${JSON.stringify(
      {
        ...readBookrc(projectRoot),
        gateHeuristics: { foo: true },
        discoveryCachePath: '.cursor/.utils-discovery-cache.json'
      },
      null,
      2
    )}\n`,
    'utf8'
  )

  // Record baseline hash then customize
  runCli(['update', '--yes'], projectRoot)
  fs.appendFileSync(placementPath, '\n<!-- project customization -->\n', 'utf8')

  const dryRun = runCli(['update', '--yes', '--dry-run'], projectRoot)
  assert.equal(dryRun.status, 0, dryRun.stderr)
  assert.match(dryRun.stdout, /dry-run/)

  const conflictUpdate = runCli(['update', '--yes'], projectRoot)
  assert.equal(conflictUpdate.status, 1, 'expected exit 1 on conflict')
  assert.match(conflictUpdate.stdout, /conflict/i)
  assert.ok(fs.existsSync(sidecarPath), 'upstream sidecar should exist')
  assert.match(
    fs.readFileSync(placementPath, 'utf8'),
    /project customization/,
    'customized placement-decision should be preserved'
  )

  assert.ok(!fs.existsSync(path.join(projectRoot, '.cursor', 'rules', 'reuse-first-stop.mdc')))
  const bookrcAfter = readBookrc(projectRoot)
  assert.ok(!bookrcAfter.gateHeuristics, 'obsolete keys should be pruned')
  assert.ok(!bookrcAfter.discoveryCachePath)

  const accept = runCli(['update', '--yes', '--accept-upstream'], projectRoot)
  assert.equal(accept.status, 0, accept.stderr)
  assert.ok(!fs.existsSync(sidecarPath), 'sidecar removed after accept-upstream')
  assert.ok(!fs.readFileSync(placementPath, 'utf8').includes('project customization'))

  assert.ok(bookrcAfter.installedPackageVersion || readBookrc(projectRoot).installedPackageVersion)

  const status = runCli(['status'], projectRoot)
  assert.equal(status.status, 0, status.stderr)

  console.log('test-update: all assertions passed')
} catch (err) {
  console.error(err)
  process.exit(1)
}
