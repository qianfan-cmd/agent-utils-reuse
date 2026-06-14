#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(__dirname, '..')
const CLI = path.join(PACKAGE_ROOT, 'bin', 'cli.mjs')

function runCli(args, cwd) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    shell: false
  })
  if (result.status !== 0) {
    throw new Error(
      `cli ${args.join(' ')} failed (${result.status})\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    )
  }
  return { stdout: result.stdout, stderr: result.stderr }
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

  runCli(['init', '--yes', '--force'], dir)
  return dir
}

function readBookrc(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, '.utils-bookrc.json'), 'utf8'))
}

try {
  const projectRoot = setupTempProject()
  const catalogDir = 'docs/agent-catalog'
  const placementPath = path.join(projectRoot, catalogDir, 'placement-decision.md')

  fs.writeFileSync(
    path.join(projectRoot, '.cursor', 'rules', 'reuse-first-stop.mdc'),
    'deprecated rule\n',
    'utf8'
  )
  fs.writeFileSync(
    path.join(projectRoot, '.cursor', 'hooks', 'discovery-cache-lib.mjs'),
    '// deprecated\n',
    'utf8'
  )
  fs.appendFileSync(placementPath, '\n<!-- project customization -->\n', 'utf8')

  const dryRun = spawnSync(
    process.execPath,
    [CLI, 'update', '--skip-bump', '--yes', '--dry-run'],
    { cwd: projectRoot, encoding: 'utf8' }
  )
  assert.equal(dryRun.status, 0, dryRun.stderr)
  assert.match(dryRun.stdout, /dry-run/)
  assert.match(dryRun.stdout, /reuse-first-stop\.mdc/)
  assert.match(dryRun.stdout, /placement-decision\.md/)

  assert.ok(fs.existsSync(path.join(projectRoot, '.cursor', 'rules', 'reuse-first-stop.mdc')))

  runCli(['update', '--skip-bump', '--yes'], projectRoot)

  assert.ok(!fs.existsSync(path.join(projectRoot, '.cursor', 'rules', 'reuse-first-stop.mdc')))
  assert.ok(!fs.existsSync(path.join(projectRoot, '.cursor', 'hooks', 'discovery-cache-lib.mjs')))
  assert.match(
    fs.readFileSync(placementPath, 'utf8'),
    /project customization/,
    'customized placement-decision should be preserved'
  )

  const bookrc = readBookrc(projectRoot)
  assert.ok(bookrc.installedPackageVersion, 'installedPackageVersion should be written')
  assert.equal(bookrc.installedPackageVersion, JSON.parse(
    fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')
  ).version)

  const status = spawnSync(process.execPath, [CLI, 'status'], {
    cwd: projectRoot,
    encoding: 'utf8'
  })
  assert.equal(status.status, 0, status.stderr)
  assert.match(status.stdout, /in sync|Recorded version/)

  console.log('test-update: all assertions passed')
} catch (err) {
  console.error(err)
  process.exit(1)
}
