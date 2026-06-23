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

  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  assert.equal(pkg.scripts['upgrade:utils-reuse'], 'agent-utils-reuse upgrade --yes')
  assert.equal(pkg.scripts['update:utils-reuse'], 'agent-utils-reuse update --yes')

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

  const upgradeDryRun = runCli(['upgrade', '--yes', '--dry-run'], projectRoot)
  assert.equal(upgradeDryRun.status, 0, upgradeDryRun.stderr)
  assert.match(upgradeDryRun.stdout, /upgrade \(dry-run\)/)
  assert.match(upgradeDryRun.stdout, /add -D file:/)

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

  const hooksJsonPath = path.join(projectRoot, '.cursor', 'hooks.json')

  const hooksAfterInit = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'))
  assert.ok(!hooksAfterInit.hooks?.preToolUse, 'default off: hooks.json should have no preToolUse')
  assert.equal(
    Object.keys(hooksAfterInit.hooks ?? {}).length,
    0,
    'default off: hooks.json should have no registered hooks'
  )

  // --- hookMode: confirm restores full hooks ---
  fs.writeFileSync(
    path.join(projectRoot, '.utils-bookrc.json'),
    `${JSON.stringify({ ...readBookrc(projectRoot), hookMode: 'confirm' }, null, 2)}\n`,
    'utf8'
  )
  const confirmUpdate = runCli(['update', '--yes'], projectRoot)
  assert.equal(confirmUpdate.status, 0, confirmUpdate.stderr)
  const hooksConfirm = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'))
  assert.equal(hooksConfirm.hooks.preToolUse?.length, 1, 'confirm mode should install preToolUse')
  assert.equal(hooksConfirm.hooks.postToolUse?.length, 2, 'confirm mode should install postToolUse hooks')

  // --- Gate completeness: simulate ai-web partial upgrade (stale hooks) ---
  const discoveryHookPath = path.join(
    projectRoot,
    '.cursor',
    'hooks',
    'track-utils-discovery.mjs'
  )
  const hooksBefore = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'))
  hooksBefore.hooks.postToolUse = (hooksBefore.hooks.postToolUse ?? []).filter(
    (e) => !String(e.command).includes('track-utils-discovery')
  )
  fs.writeFileSync(hooksJsonPath, `${JSON.stringify(hooksBefore, null, 2)}\n`, 'utf8')
  if (fs.existsSync(discoveryHookPath)) {
    fs.unlinkSync(discoveryHookPath)
  }

  const verifyDrift = runCli(['verify'], projectRoot)
  assert.equal(verifyDrift.status, 1, 'verify should fail on drift')
  assert.match(verifyDrift.stdout, /FAILED|Stale|Missing/i)

  const nmPkgPath = path.join(projectRoot, 'node_modules', 'agent-utils-reuse', 'package.json')
  const nmPkg = JSON.parse(fs.readFileSync(nmPkgPath, 'utf8'))
  nmPkg.version = '0.1.9'
  fs.writeFileSync(nmPkgPath, `${JSON.stringify(nmPkg, null, 2)}\n`, 'utf8')

  const repairUpdate = runCli(['update', '--yes'], projectRoot)
  assert.equal(repairUpdate.status, 0, repairUpdate.stderr)
  assert.match(repairUpdate.stdout, /Gate verify: OK/)

  const hooksAfter = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'))
  assert.equal(hooksAfter.hooks.preToolUse?.length, 1, 'confirm hooks.json should have preToolUse after repair')
  assert.equal(hooksAfter.hooks.postToolUse?.length, 2, 'confirm hooks.json should have Read + Grep postToolUse')
  assert.ok(fs.existsSync(discoveryHookPath), 'track-utils-discovery.mjs should be restored')

  const verifyOk = runCli(['verify'], projectRoot)
  assert.equal(verifyOk.status, 0, verifyOk.stderr)

  const bookrcFinal = readBookrc(projectRoot)
  assert.ok(
    bookrcFinal.gateOverwriteHashes,
    'gateOverwriteHashes should be persisted after successful verify'
  )

  const status = runCli(['status'], projectRoot)
  assert.equal(status.status, 0, status.stderr)
  assert.match(status.stdout, /gate OK|in sync/i)

  console.log('test-update: all assertions passed')
} catch (err) {
  console.error(err)
  process.exit(1)
}
