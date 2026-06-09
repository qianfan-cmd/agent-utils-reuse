# agent-utils-reuse

**Agent utils reuse gate** — Shortlist → Confirm (five questions) → Verdict.

Stop AI coding agents from silently forking your shared utilities. Install once, then generate a **utils-book** from your own `src/utils`.

- **utils-book generator** — scan utils, write index + chapters + line numbers
- **Decision docs** — five-question Confirm, ask-user on cosmetic diff
- **Cursor templates** — Skill, Rule, **mandatory gate Rule**, Hook (utils + configurable app paths)

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
| `.cursor/skills/reuse-before-create/` | Step-by-step Skill |
| `.cursor/rules/reuse-first.mdc` | Always-on Rule |
| `.cursor/hooks/` | Reminder before writing utils |

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
