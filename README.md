# agent-utils-reuse

English | [简体中文](README.zh-CN.md)

**Stop AI agents from silently forking your shared utilities.** This package adds a **Confirm gate** (five questions + `Verdict（最终）` in chat before Write), **KV utils search** (`utils-index.json`), and **Cursor Rules/Hooks** to any frontend project.

## Why

| Problem | What we do |
|---------|------------|
| Agent reads `src/utils` then re-implements the same logic in a feature file | Mandatory **Confirm** + **Verdict** before Write |
| Agent skips proof after picking a util | **Read util source** ≠ gate complete — chat Confirm is required |
| `search` returns nothing for task keywords | **`@utils-book` JSDoc** feeds the index — backfill existing exports (see Step 4 below) |

## What you get

| Piece | Role |
|-------|------|
| **utils-index.json** + `search` CLI | Agent Discovery D1 (keyword retrieval) |
| **utils-book/** | Human-readable catalog (Agents must **not** use for Shortlist) |
| **Cursor Rules** | `utils-reuse-gate`, `pre-write-utils-checklist`, etc. — installed on `init` |
| **Hooks** (opt-in) | `hookMode: confirm` hard-denies Write without Confirm evidence |
| **AGENTS.md** | Merged utils reuse section |

Design deep-dive: [docs/design/utils-reuse-blog.md](docs/design/utils-reuse-blog.md) (Chinese).

## Quick start

Run at your **project root** (directory with `package.json`).

### 1. Install

```bash
pnpm add -D github:qianfan-cmd/agent-utils-reuse
# or: pnpm add -D agent-utils-reuse
```

Windows / local path: `pnpm add -D file:../agent-utils-reuse`

### 2. Init gate + docs

```bash
node node_modules/agent-utils-reuse/bin/cli.mjs init --force
```

This copies Rules, hooks, `.utils-bookrc.json`, and merges `AGENTS.md`. Open **Cursor at the project root**.

### 3. Generate utils index

```bash
pnpm gen:utils-book
```

Requires `.ts` files under `utilsDir` (default `src/utils`). Try samples:

```bash
node node_modules/agent-utils-reuse/bin/cli.mjs init --with-examples
pnpm gen:utils-book
```

### 4. Backfill `@utils-book` on existing exports (recommended)

**When:** After `gen`, many symbols show `(无简介 — Confirm 前须 Read 实现)`; or `search` misses keywords your team uses.

**Do not hand-edit `utils-index.json`.** Add JSDoc on exports, then re-run `gen`.

Paste into a **new Cursor Agent session** (replace `src/utils` with your `utilsDir`):

```markdown
Task: Add @utils-book JSDoc to every export under `src/utils/` that lacks a valid one-line summary.

Rules:
1. Place a `/** ... */` block comment immediately above each export (only blank lines between comment and export). Do not use single-line `//`.
2. Use `@utils-book one-line behavior description` — what the symbol does (inputs/outputs/side effects in one sentence). Do not write reuse/Verdict/ticket-specific scenario text.
3. Do not change any export signature, implementation, or default behavior (No extend).
4. If `/** */` exists but lacks @utils-book, add the tag or replace the first line with behavior text.
5. Skip re-export lines (`export { x } from`) unless a separate note is required.
6. When done, list changed files and symbols.

**Note**: BACKFILL only updates `utilsDir` comments. It does **not** replace Message A (five questions + `Verdict（最终）`) for later **feature** implementation tasks.

First Grep `src/utils` for exports missing block comments or entries whose utils-index summary is the no-summary placeholder. Backfill file by file. Do not Write feature code.
```

Then:

```bash
pnpm gen:utils-book
node node_modules/agent-utils-reuse/bin/cli.mjs search "clipboard copy" --limit 8
```

Full guide: [docs/en/backfill-jsdoc.md](docs/en/backfill-jsdoc.md) · [docs/zh-CN/backfill-jsdoc.md](docs/zh-CN/backfill-jsdoc.md)

### 5. Daily workflow (Agent)

Single-turn default (v0.3.14+): **Analyze → Discovery → Read util source → Confirm + Verdict → Write** in one assistant response.

```bash
node node_modules/agent-utils-reuse/bin/cli.mjs search "sort array" --limit 8
```

### 6. Upgrade later

```bash
pnpm upgrade:utils-reuse
```

## hookMode (choose one)

| Mode | Write deny | When to use |
|------|------------|-------------|
| **`off`** (default) | No | Daily dev — Rules enforce Confirm in chat |
| `confirm` | Yes | Acceptance tests / strict audit |
| `remind` | No | Reminder only on Write |

```json
{ "hookMode": "off" }
```

Details: [docs/en/configuration.md](docs/en/configuration.md#hookmode)

## Best practices

- **Default `hookMode: off`** — Rules already require Confirm + `Verdict（最终）` before Write.
- **Read util exports in source** — not feature call sites only.
- **Bulk Confirm** (≥3 symbols): `| Symbol | Read @ path | Q4 | Verdict |` — Symbol column = **import name** (e.g. `UrlUtils`, not `UrlUtils.method`).
- **Split batches** when >5 reuse symbols per turn (≤5 per Confirm + Write).
- **Acceptance**: `{ "hookMode": "confirm", "sameTurnAllow": true }` then `pnpm test:hooks .`

More: [docs/en/best-practices.md](docs/en/best-practices.md)

## What `init` installs

| Path | Purpose |
|------|---------|
| `AGENTS.md` | Merged utils reuse section |
| `.utils-bookrc.json` | Scan paths, hook mode |
| `docs/agent-catalog/` | **Agent runtime docs** (not the human quick start) |
| `docs/agent-catalog/utils-index.json` | Generated KV index (after `gen`) |
| `.cursor/rules/*.mdc` | Mandatory Confirm gate Rules |
| `.cursor/hooks/` | Hook scripts (`confirm` / `remind` only) |

## Documentation

| Audience | Start here |
|----------|------------|
| **Humans** | This README · [README.zh-CN.md](README.zh-CN.md) |
| **Extended guides** | [docs/en/](docs/en/getting-started.md) · [docs/zh-CN/](docs/zh-CN/getting-started.md) |
| **Cursor Agent** | `docs/agent-catalog/placement-decision.md` (synced to your project on init) |
| **Maintainers** | [docs/maintainer/TEST-RUBRIC-WRITING.zh.md](docs/maintainer/TEST-RUBRIC-WRITING.zh.md) |
| **Version history** | [docs/en/changelog-gate.md](docs/en/changelog-gate.md) |

## Commands

| Command | Action |
|---------|--------|
| `pnpm upgrade:utils-reuse` | Latest package + gate sync |
| `pnpm update:utils-reuse` | Gate-only sync (no `pnpm add`) |
| `pnpm gen:utils-book` | Regenerate index + utils-book |
| `agent-utils-reuse search "<query>"` | KV search (Agent D1) |
| `agent-utils-reuse uninstall --yes` | Remove gate, catalog, dependency (see below) |
| `pnpm test:hooks [projectRoot]` | Hook smoke tests |

## Uninstall

To remove the gate entirely (Rules, Hooks, `docs/agent-catalog`, generated index/book, `AGENTS.md` marker block, and `package.json` dependency):

```bash
node node_modules/agent-utils-reuse/bin/cli.mjs uninstall --yes
pnpm install
```

`src/utils` JSDoc comments are not removed. Preview with `--dry-run` first.

## Development

From this repo:

```bash
pnpm test:hooks
pnpm test:update
pnpm test:uninstall
```

Preview generated book: [examples/minimal/docs/agent-catalog/utils-book/](examples/minimal/docs/agent-catalog/utils-book/)

## License

MIT
