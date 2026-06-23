#!/usr/bin/env node
/** Fail if package.json version drifts from README latest upgrade target. */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8")
const match = readme.match(/### Upgrade v[\d.]+ → v([\d.]+)/)
if (!match) {
  console.warn("check-package-version: skip (no Upgrade heading in README)")
  process.exit(0)
}
const expected = match[1]
if (pkg.version !== expected) {
  console.error(`package.json version is ${pkg.version}, README expects ${expected}`)
  console.error(`Bump: npm version ${expected} --no-git-tag-version`)
  process.exit(1)
}
console.log(`check-package-version: OK (${pkg.version})`)
