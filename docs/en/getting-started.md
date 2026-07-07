# Getting started

[English](getting-started.md) | [简体中文](../zh-CN/getting-started.md) | [README](../../README.md)

Extended install guide beyond the [README Quick start](../../README.md#quick-start).

## Prerequisites

- Node.js 18+
- Project root opened in **Cursor** (directory with `package.json` and, after init, `AGENTS.md`)
- `pnpm` or `npm` for package scripts

## Install paths

**GitHub (recommended during pre-publish):**

```bash
pnpm add -D github:qianfan-cmd/agent-utils-reuse
```

**npm registry (when published):**

```bash
pnpm add -D agent-utils-reuse
```

**Local development:**

```bash
pnpm add -D file:../agent-utils-reuse
```

## Init

```bash
node node_modules/agent-utils-reuse/bin/cli.mjs init --force
```

| Flag | Effect |
|------|--------|
| `--force` | Refresh `AGENTS.md` snippet + project-core inject |
| `--with-examples` | Copy sample array utils into `src/utils` |
| `--accept-upstream` | Take package docs on init (rare) |

If `pnpm agent-utils-reuse` is not on PATH (common on Windows):

```bash
node node_modules/agent-utils-reuse/bin/cli.mjs init --force
```

## Generate index

`init` does **not** run `gen`. After you have exports under `utilsDir`:

```bash
pnpm gen:utils-book
```

Or:

```bash
node node_modules/agent-utils-reuse/bin/cli.mjs gen
```

Smoke test search:

```bash
node node_modules/agent-utils-reuse/bin/cli.mjs search "sort array" --limit 8
```

## Backfill existing utils

See [backfill-jsdoc.md](backfill-jsdoc.md) or the copy-paste prompt in [README § Step 4](../../README.md#4-backfill-utils-book-on-existing-exports-recommended).

## Upgrade / update

**Recommended — package + gate:**

```bash
pnpm upgrade:utils-reuse
```

**Gate only (no lockfile change, `file:` local dev):**

```bash
pnpm update:utils-reuse
```

Diagnose drift:

```bash
node node_modules/agent-utils-reuse/bin/cli.mjs status
node node_modules/agent-utils-reuse/bin/cli.mjs verify
```

| Flag | Action |
|------|--------|
| `upgrade --tag v0.3.18` | Pin version |
| `upgrade --dry-run` | Preview resolved spec |
| `update --accept-upstream` | Discard local doc customizations |

Version history: [changelog-gate.md](changelog-gate.md)

## Merge conflicts on docs

Mergeable docs (`placement-decision.md`, `MERGE-AGENTS.md`, `README.md` under `agent-catalog`) use hash-based conflict detection. On conflict your file is kept; upstream copy is written as `*.utils-reuse-upstream`. Resolve manually or use `--accept-upstream`.

## Post-init acceptance

- `agent-utils-reuse verify` → `Gate verify: OK`
- `pnpm test:hooks .` (from agent-utils-reuse repo, pass project root)
- With `hookMode: confirm`: Read util → Confirm in chat → Write under `remindWritePaths` → allow

## Windows: test hooks locally

Git Bash `node` may be aliased to `winpty` — pipe tests fail. Use PowerShell:

```powershell
cd your-project
node ../agent-utils-reuse/scripts/test-hook-confirm.mjs .
```

## Uninstall

**Requires v0.3.20+.** See [README § Uninstall](../../README.md#uninstall) for the full removed/kept list.

```bash
pnpm exec agent-utils-reuse uninstall --dry-run
pnpm exec agent-utils-reuse uninstall --yes
pnpm install
```

Windows / Git Bash when the bin is not on PATH:

```bash
node node_modules/agent-utils-reuse/bin/cli.mjs uninstall --yes
pnpm install
```

Smoke test from the agent-utils-reuse repo: `pnpm test:uninstall`.

## Monorepo / CI

- Run `init` and `gen` at each **consumer app root** that uses the gate.
- Optional CI: `pnpm check:utils-book` (regen + `git diff` on index and book).

## Next

- [Configuration](configuration.md)
- [Best practices](best-practices.md)
- [Backfill JSDoc](backfill-jsdoc.md)
