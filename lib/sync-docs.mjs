import fs from 'node:fs'
import path from 'node:path'

import {
  clearUpstreamSidecar,
  decideSyncAction,
  hashContent,
  normalizeContent,
  persistGateFileHashes,
  readFileHash,
  readGateFileHashes,
  UPSTREAM_SIDECAR_SUFFIX,
  writeUpstreamSidecar
} from './gate-sync-manifest.mjs'
import { MERGEABLE_GATE_DOC_FILES } from './sync-package-files.mjs'

function readNormalized(filePath) {
  if (!fs.existsSync(filePath)) return null
  return normalizeContent(fs.readFileSync(filePath, 'utf8'))
}

/**
 * Sync mergeable gate docs with git-pull-style conflict detection.
 * @param {'install' | 'reinstall'} mode - install always copies; reinstall uses hash base
 */
export function syncMergeableGateDocs(
  templatesRoot,
  projectRoot,
  config,
  gateFileHashes,
  { mode = 'reinstall', acceptUpstream = false, dryRun = false } = {}
) {
  const docsSrc = path.join(templatesRoot, 'docs', 'agent-catalog')
  const docsDest = path.join(projectRoot, config.catalogDir)
  const refreshed = []
  const conflicts = []
  const upToDate = []
  const accepted = []
  const created = []
  const hashUpdates = {}
  let copied = 0

  for (const name of MERGEABLE_GATE_DOC_FILES) {
    const from = path.join(docsSrc, name)
    const to = path.join(docsDest, name)
    if (!fs.existsSync(from)) continue

    const relPath = `${config.catalogDir}/${name}`.replace(/\\/g, '/')
    const upstreamContent = readNormalized(from)
    const upstreamHash = hashContent(upstreamContent)
    const localExists = fs.existsSync(to)
    const localHash = localExists ? readFileHash(to) : null
    const recordedHash = gateFileHashes[relPath] ?? null

    let action
    if (mode === 'install') {
      action = acceptUpstream || !localExists || localHash === upstreamHash ? 'copy' : 'copy'
      // First init: always copy upstream and record hash
      action = 'copy'
    } else {
      action = decideSyncAction({
        localExists,
        localHash,
        upstreamHash,
        recordedHash,
        acceptUpstream
      })
    }

    if (action === 'up-to-date') {
      upToDate.push(relPath)
      hashUpdates[relPath] = upstreamHash
      if (localExists) clearUpstreamSidecar(to, { dryRun })
      continue
    }

    if (action === 'conflict') {
      writeUpstreamSidecar(to, upstreamContent, { dryRun })
      conflicts.push({ relPath, sidecar: `${relPath}${UPSTREAM_SIDECAR_SUFFIX}` })
      continue
    }

    // copy / accept upstream
    if (!localExists) created.push(relPath)
    else if (acceptUpstream) accepted.push(relPath)
    else refreshed.push(relPath)

    if (!dryRun) {
      fs.mkdirSync(docsDest, { recursive: true })
      fs.copyFileSync(from, to)
      clearUpstreamSidecar(to, { dryRun: false })
    }
    hashUpdates[relPath] = upstreamHash
    copied++
  }

  if (Object.keys(hashUpdates).length > 0) {
    persistGateFileHashes(projectRoot, hashUpdates, { dryRun })
  }

  return { copied, refreshed, conflicts, upToDate, accepted, created, hashUpdates }
}

/**
 * List docs that differ from the package template (for status drift hint).
 */
export function listCustomizedDocs(templatesRoot, projectRoot, config) {
  const docsSrc = path.join(templatesRoot, 'docs', 'agent-catalog')
  const docsDest = path.join(projectRoot, config.catalogDir)
  const customized = []

  for (const name of MERGEABLE_GATE_DOC_FILES) {
    const from = path.join(docsSrc, name)
    const to = path.join(docsDest, name)
    if (!fs.existsSync(from) || !fs.existsSync(to)) continue
    if (readNormalized(from) !== readNormalized(to)) {
      customized.push(`${config.catalogDir}/${name}`.replace(/\\/g, '/'))
    }
  }

  return customized
}

/** @deprecated use syncMergeableGateDocs */
export function syncPackageDocs(templatesRoot, projectRoot, config, options = {}) {
  const configPath = path.join(projectRoot, '.utils-bookrc.json')
  let gateFileHashes = {}
  if (fs.existsSync(configPath)) {
    try {
      gateFileHashes = readGateFileHashes(JSON.parse(fs.readFileSync(configPath, 'utf8')))
    } catch {
      gateFileHashes = {}
    }
  }
  const mode = options.forceDocs || options.acceptUpstream ? 'install' : 'reinstall'
  return syncMergeableGateDocs(templatesRoot, projectRoot, config, gateFileHashes, {
    mode: options.forceDocs ? 'install' : mode,
    acceptUpstream: Boolean(options.forceDocs || options.acceptUpstream),
    dryRun: options.dryRun
  })
}
