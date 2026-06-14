import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const UPSTREAM_SIDECAR_SUFFIX = '.utils-reuse-upstream'

export function normalizeContent(content) {
  return String(content ?? '').replace(/\r\n/g, '\n')
}

export function hashContent(content) {
  const normalized = normalizeContent(content)
  return `sha256:${crypto.createHash('sha256').update(normalized, 'utf8').digest('hex')}`
}

export function readFileHash(filePath) {
  if (!fs.existsSync(filePath)) return null
  return hashContent(fs.readFileSync(filePath, 'utf8'))
}

export function upstreamSidecarPath(localPath) {
  return `${localPath}${UPSTREAM_SIDECAR_SUFFIX}`
}

export function readGateFileHashes(bookrcRaw) {
  const hashes = bookrcRaw?.gateFileHashes
  if (!hashes || typeof hashes !== 'object') return {}
  return { ...hashes }
}

/**
 * @returns {'copy' | 'up-to-date' | 'conflict'}
 */
export function decideSyncAction({ localExists, localHash, upstreamHash, recordedHash, acceptUpstream }) {
  if (acceptUpstream) return 'copy'
  if (!localExists) return 'copy'
  if (localHash === upstreamHash) return 'up-to-date'
  if (recordedHash && localHash === recordedHash) return 'copy'
  return 'conflict'
}

export function writeUpstreamSidecar(localPath, upstreamContent, { dryRun = false } = {}) {
  const sidecar = upstreamSidecarPath(localPath)
  if (!dryRun) {
    fs.mkdirSync(path.dirname(sidecar), { recursive: true })
    fs.writeFileSync(sidecar, upstreamContent, 'utf8')
  }
  return sidecar
}

export function clearUpstreamSidecar(localPath, { dryRun = false } = {}) {
  const sidecar = upstreamSidecarPath(localPath)
  if (!fs.existsSync(sidecar)) return false
  if (!dryRun) fs.unlinkSync(sidecar)
  return true
}

export function listPendingConflicts(projectRoot, relPaths) {
  const pending = []
  for (const rel of relPaths) {
    const localPath = path.join(projectRoot, rel)
    const sidecar = upstreamSidecarPath(localPath)
    if (fs.existsSync(sidecar)) {
      pending.push(rel)
    }
  }
  return pending
}

export function persistGateFileHashes(projectRoot, hashUpdates, { dryRun = false } = {}) {
  const configPath = path.join(projectRoot, '.utils-bookrc.json')
  if (!fs.existsSync(configPath)) return null

  let raw = {}
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch {
    raw = {}
  }

  const gateFileHashes = { ...(raw.gateFileHashes ?? {}), ...hashUpdates }
  raw.gateFileHashes = gateFileHashes

  if (!dryRun) {
    fs.writeFileSync(configPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8')
  }

  return { path: configPath, gateFileHashes }
}
