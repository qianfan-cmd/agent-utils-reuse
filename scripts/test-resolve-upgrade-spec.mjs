#!/usr/bin/env node
import assert from 'node:assert/strict'

import {
  listGitHubSemverTags,
  parseGitHubDep,
  parseSemverTag,
  pickLatestSemverTag,
  resolveUpgradeSpec
} from '../lib/resolve-upgrade-spec.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

assert.equal(parseSemverTag('v0.3.0'), '0.3.0')
assert.equal(parseSemverTag('0.3.1'), '0.3.1')
assert.equal(parseSemverTag('v0.10.0'), '0.10.0')
assert.equal(parseSemverTag('main'), null)

assert.equal(pickLatestSemverTag(['v0.3.0', 'v0.3.1', 'v0.10.0']), 'v0.10.0')
assert.equal(pickLatestSemverTag(['v0.3.0', 'v0.3.1']), 'v0.3.1')
assert.equal(pickLatestSemverTag(['not-a-tag']), null)

const gh = parseGitHubDep('github:qianfan-cmd/agent-utils-reuse#v0.3.0')
assert.equal(gh.base, 'github:qianfan-cmd/agent-utils-reuse')
assert.equal(gh.pinnedRef, 'v0.3.0')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-upgrade-spec-'))
try {
  fs.writeFileSync(
    path.join(tmp, 'package.json'),
    `${JSON.stringify(
      {
        devDependencies: {
          'agent-utils-reuse': 'file:../agent-utils-reuse'
        }
      },
      null,
      2
    )}\n`,
    'utf8'
  )
  const fileResult = resolveUpgradeSpec(tmp)
  assert.equal(fileResult.source, 'file-link')
  assert.equal(fileResult.spec, 'file:../agent-utils-reuse')

  fs.writeFileSync(
    path.join(tmp, 'package.json'),
    `${JSON.stringify(
      {
        devDependencies: {
          'agent-utils-reuse': 'github:qianfan-cmd/agent-utils-reuse#v0.3.0'
        }
      },
      null,
      2
    )}\n`,
    'utf8'
  )

  const pinned = resolveUpgradeSpec(tmp, { tag: 'v0.3.2' })
  assert.equal(pinned.spec, 'github:qianfan-cmd/agent-utils-reuse#v0.3.2')

  const mockedTags = listGitHubSemverTags('owner', 'repo', {
    runGit: () => ({
      status: 0,
      stdout: [
        'abc refs/tags/v0.3.0',
        'def refs/tags/v0.3.1',
        'ghi refs/tags/v0.10.0'
      ].join('\n'),
      stderr: ''
    })
  })
  assert.deepEqual([...mockedTags].sort(), ['v0.10.0', 'v0.3.0', 'v0.3.1'].sort())

  const githubLatest = resolveUpgradeSpec(tmp, {
    runGit: () => ({
      status: 0,
      stdout: 'abc refs/tags/v0.3.2\n',
      stderr: ''
    })
  })
  assert.equal(githubLatest.source, 'github-latest-tag')
  assert.equal(githubLatest.spec, 'github:qianfan-cmd/agent-utils-reuse#v0.3.2')

  const noTags = resolveUpgradeSpec(tmp, {
    runGit: () => ({ status: 0, stdout: '', stderr: '' })
  })
  assert.equal(noTags.source, 'github-main-fallback')
  assert.match(noTags.spec, /#v0\.3\.0$/)
  assert.ok(noTags.warning)

  const networkFail = resolveUpgradeSpec(tmp, {
    runGit: () => ({
      status: 128,
      stdout: '',
      stderr: 'error: RPC failed; curl 56 Recv failure: Connection was reset'
    })
  })
  assert.equal(networkFail.source, 'github-network-fallback')
  assert.equal(networkFail.spec, 'github:qianfan-cmd/agent-utils-reuse#v0.3.0')
  assert.match(networkFail.warning, /git ls-remote failed/)

  console.log('test-resolve-upgrade-spec: all assertions passed')
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}
