import fs from 'node:fs'
import path from 'node:path'

import { PACKAGE_DOC_FILES } from './sync-package-files.mjs'

function normalizeContent(content) {
  return content.replace(/\r\n/g, '\n')
}

function readNormalized(filePath) {
  return normalizeContent(fs.readFileSync(filePath, 'utf8'))
}

/**
 * Sync package-managed docs with skip-if-modified behavior.
 * @returns {{ copied: number, refreshed: string[], skippedCustomized: string[], created: string[] }}
 */
export function syncPackageDocs(templatesRoot, projectRoot, config, { forceDocs = false, dryRun = false } = {}) {
  const docsSrc = path.join(templatesRoot, 'docs', 'agent-catalog')
  const docsDest = path.join(projectRoot, config.catalogDir)
  const refreshed = []
  const skippedCustomized = []
  const created = []
  let copied = 0

  for (const name of PACKAGE_DOC_FILES) {
    const from = path.join(docsSrc, name)
    const to = path.join(docsDest, name)
    if (!fs.existsSync(from)) continue

    const templateContent = readNormalized(from)

    if (fs.existsSync(to)) {
      const existingContent = readNormalized(to)
      if (existingContent !== templateContent && !forceDocs) {
        skippedCustomized.push(`${config.catalogDir}/${name}`)
        continue
      }
      if (existingContent === templateContent && !forceDocs) {
        refreshed.push(`${config.catalogDir}/${name}`)
      }
    } else {
      created.push(`${config.catalogDir}/${name}`)
    }

    if (!dryRun) {
      fs.mkdirSync(docsDest, { recursive: true })
      fs.copyFileSync(from, to)
    }
    copied++
  }

  return { copied, refreshed, skippedCustomized, created }
}

/**
 * List docs that differ from the package template (for status).
 */
export function listCustomizedDocs(templatesRoot, projectRoot, config) {
  const docsSrc = path.join(templatesRoot, 'docs', 'agent-catalog')
  const docsDest = path.join(projectRoot, config.catalogDir)
  const customized = []

  for (const name of PACKAGE_DOC_FILES) {
    const from = path.join(docsSrc, name)
    const to = path.join(docsDest, name)
    if (!fs.existsSync(from) || !fs.existsSync(to)) continue
    if (readNormalized(from) !== readNormalized(to)) {
      customized.push(`${config.catalogDir}/${name}`)
    }
  }

  return customized
}
