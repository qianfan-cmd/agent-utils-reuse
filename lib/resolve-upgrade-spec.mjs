import { spawnSync } from 'node:child_process'

import { compareSemver, readDependencySpec } from './sync-package-files.mjs'

const PACKAGE_NAME = 'agent-utils-reuse'

function defaultRunGit(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    shell: process.platform === 'win32'
  })
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  }
}

/** @param {string} tagName */
export function parseSemverTag(tagName) {
  const match = String(tagName).match(/^v?(\d+\.\d+\.\d+)$/)
  if (!match) return null
  return match[1]
}

/** @param {string[]} tagNames */
export function pickLatestSemverTag(tagNames) {
  let bestTag = null
  let bestVersion = null

  for (const name of tagNames) {
    const version = parseSemverTag(name)
    if (!version) continue
    if (!bestVersion || compareSemver(version, bestVersion) > 0) {
      bestVersion = version
      bestTag = name.startsWith('v') ? name : `v${version}`
    }
  }

  return bestTag
}

/** @param {string} spec */
export function parseGitHubDep(spec) {
  const raw = String(spec)
  if (!raw.startsWith('github:')) return null

  const rest = raw.slice('github:'.length)
  const hashIdx = rest.indexOf('#')
  const repoPart = hashIdx >= 0 ? rest.slice(0, hashIdx) : rest
  const [owner, repo] = repoPart.split('/')

  if (!owner || !repo) {
    throw new Error(`Invalid github dependency spec: ${spec}`)
  }

  return {
    owner,
    repo,
    base: `github:${owner}/${repo}`,
    pinnedRef: hashIdx >= 0 ? rest.slice(hashIdx + 1) : null
  }
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {{ runGit?: typeof defaultRunGit }} [options]
 */
export function listGitHubSemverTags(owner, repo, { runGit = defaultRunGit } = {}) {
  const url = `https://github.com/${owner}/${repo}.git`
  const result = runGit(['ls-remote', '--tags', url, 'refs/tags/v*'])

  if (result.status !== 0) {
    throw new Error(
      `git ls-remote failed for ${owner}/${repo}: ${(result.stderr || result.stdout).trim()}`
    )
  }

  const tags = new Set()
  for (const line of result.stdout.split('\n')) {
    const match = line.match(/refs\/tags\/(v[\d.]+)(?:\^\{\})?$/)
    if (match) tags.add(match[1])
  }

  return [...tags]
}

/**
 * Resolve devDependency spec for upgrade (latest tag / @latest / file: reinstall).
 * @param {string} projectRoot
 * @param {{ tag?: string | null, runGit?: typeof defaultRunGit }} [options]
 */
export function resolveUpgradeSpec(projectRoot, { tag: explicitTag = null, runGit } = {}) {
  const dep = readDependencySpec(projectRoot)
  if (!dep) {
    throw new Error(`${PACKAGE_NAME} not found in package.json devDependencies or dependencies`)
  }

  const depSpec = String(dep)

  if (explicitTag) {
    const versionTag = String(explicitTag).replace(/^#/, '')
    if (depSpec.startsWith('github:')) {
      const gh = parseGitHubDep(depSpec)
      return {
        spec: `${gh.base}#${versionTag}`,
        source: 'github-pin',
        previousDep: depSpec,
        resolvedTag: versionTag
      }
    }
    const npmVersion = versionTag.replace(/^v/, '')
    return {
      spec: `${PACKAGE_NAME}@${npmVersion}`,
      source: 'npm-pin',
      previousDep: depSpec,
      resolvedTag: versionTag
    }
  }

  if (depSpec.startsWith('file:')) {
    return {
      spec: depSpec,
      source: 'file-link',
      previousDep: depSpec
    }
  }

  if (depSpec.startsWith('github:')) {
    const gh = parseGitHubDep(depSpec)
    let tags = []
    let lsRemoteError = null

    try {
      tags = listGitHubSemverTags(gh.owner, gh.repo, { runGit })
    } catch (err) {
      lsRemoteError = err
    }

    const latestTag = pickLatestSemverTag(tags)

    if (latestTag) {
      return {
        spec: `${gh.base}#${latestTag}`,
        source: 'github-latest-tag',
        previousDep: depSpec,
        resolvedTag: latestTag
      }
    }

    const fallbackRef = gh.pinnedRef || 'main'
    const networkMsg = lsRemoteError
      ? `git ls-remote failed (${String(lsRemoteError.message || lsRemoteError).replace(/^Error:\s*/i, '')})`
      : null

    return {
      spec: `${gh.base}#${fallbackRef}`,
      source: lsRemoteError ? 'github-network-fallback' : 'github-main-fallback',
      previousDep: depSpec,
      warning: networkMsg
        ? `${networkMsg} — using existing ref #${fallbackRef}. Retry later, pass --tag vX.Y.Z, or use file:../agent-utils-reuse for offline upgrades.`
        : 'No semver tags on GitHub — falling back to #main. Maintainer should push tags (e.g. git tag v0.3.2 && git push origin v0.3.2).'
    }
  }

  return {
    spec: `${PACKAGE_NAME}@latest`,
    source: 'npm-latest',
    previousDep: depSpec
  }
}
