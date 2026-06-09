# agent-utils-reuse

**Agent utils reuse gate** — Confirm (five questions) + Verdict in chat before Write.

Stop AI coding agents from silently forking your shared utilities. **v0.1.4** adds **confirm mode**: deny Write until util source files were Read this session (no cache JSON).

- **utils-book generator** — scan utils, write index + chapters + line numbers
- **Confirm gate** — mandatory Q1–Q5 + Verdict in chat; Shortlist optional
- **Cursor templates** — Skill, Rule, **utils-reuse-gate.mdc**, read-audit Hook

> 设计说明：[docs/utils-reuse-blog.md](./docs/utils-reuse-blog.md)

## Install

```bash
pnpm add -D github:qianfan-cmd/agent-utils-reuse
```

npm (if published):

```bash
pnpm add -D agent-utils-reuse
```

## Quick start

Run at your **project root** (where `package.json` lives):

```bash
# 1. Copy config, docs, Cursor templates, package scripts; merge AGENTS.md
pnpm agent-utils-reuse init

# 2. Ensure src/utils exists, then generate the book
pnpm gen:utils-book
```

### Try with sample utils

```bash
pnpm agent-utils-reuse init --with-examples
pnpm gen:utils-book
```

Copies `sortAsc` / `uniqueByKey` into `src/utils/array/` so you can see output immediately.

### Windows note

If installing from a local path, use a relative path:

```bash
pnpm add -D file:../agent-utils-reuse
```

## What you get after `init`

| Path | Purpose |
|------|---------|
| `AGENTS.md` | **Auto-created or merged** with utils reuse section |
| `.utils-bookrc.json` | Scan paths and JSDoc tag |
| `docs/agent-catalog/placement-decision.md` | Reuse rules (five questions) |
| `docs/agent-catalog/AGENTS.utils-reuse.snippet.md` | Manual-merge reference (usually not needed) |
| `docs/agent-catalog/utils-book/` | **Generated** by `gen` (do not hand-edit) |
| `.cursor/rules/utils-reuse-gate.mdc` | Mandatory Confirm gate (alwaysApply) |
| `.cursor/rules/reuse-first.mdc` | Summary Rule |
| `.cursor/hooks/` | Read audit + confirm deny (or remind mode) |
| `.cursor/.utils-gate-reads.json` | Session read audit (gitignored) |

## Commands

| Command | Action |
|---------|--------|
| `pnpm agent-utils-reuse init` | One-time setup |
| `pnpm agent-utils-reuse init --with-examples` | Setup + sample array utils |
| `pnpm agent-utils-reuse init --force` | Overwrite templates + refresh AGENTS.md snippet block |
| `pnpm gen:utils-book` | Regenerate utils-book from `src/utils` |
| `pnpm check:utils-book` | Regenerate + `git diff` (CI gate) |

`init` does **not** generate the book — run `gen` after you have `.ts` files under `utilsDir`.

## Configuration (`.utils-bookrc.json`)

| Field | Default | Description |
|-------|---------|-------------|
| `utilsDir` | `src/utils` | Directory to scan |
| `catalogDir` | `docs/agent-catalog` | Agent catalog root |
| `utilsBookDir` | `docs/agent-catalog/utils-book` | Generated book output |
| `skillsDir` | `.cursor/skills` | For `skills.md` index |
| `agentsFile` | `AGENTS.md` | Agent guide file merged by `init` |
| `jsdocTag` | `@utils-book` | One-line summary tag in JSDoc |
| `hookMode` | `confirm` | `confirm` = deny until util source Read; `remind` = allow + message only |
| `utilsImportAliases` | `["@/utils"]` | Import prefixes for Hook import detection |
| `remindWritePaths` | `src/feature`, … | App paths that trigger confirm when adding utils imports |

### Test Hook locally (Windows)

Git Bash `node` is often aliased to `winpty node.exe` — **pipe tests fail** with `stdin is not a tty`. Use PowerShell or direct path:

```powershell
cd your-project
'{"tool_input":{"path":"src/feature/foo.vue","content":"import { X } from \"@/utils/foo\""}}' |
  node .cursor/hooks/check-discovery-before-shared-write.mjs
```

Or Git Bash: `/c/nvm4w/nodejs/node.exe .cursor/hooks/check-discovery-before-shared-write.mjs < /tmp/in.json`

## JSDoc summaries (recommended)

```ts
/** @utils-book 数字数组升序排序，返回新数组 */
export function sortAsc(nums: number[]): number[] {
  return [...nums].sort((a, b) => a - b)
}
```

Without `@utils-book`, the script uses the first description line in `/** */` above the export, or `(无简介 — Confirm 前须 Read 实现)`.

## Preview output

Clone this repo and open [`examples/minimal/docs/agent-catalog/utils-book/`](examples/minimal/docs/agent-catalog/utils-book/) — sample generated book from two array utils.

## License

MIT
