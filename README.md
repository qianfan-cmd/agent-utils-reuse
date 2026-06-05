# agent-utils-reuse

**Agent utils reuse gate** — Shortlist → Confirm (five questions) → Verdict.

Stop AI coding agents from silently forking your shared utilities. This package ships:

- A **utils-book generator** (scans your utils dir, writes index + chapters)
- **Decision docs** (five-question Confirm flow, ask-user on cosmetic diff)
- **Cursor templates** (Skill, Rule, Hook)

> 设计说明（博客全文）：[docs/utils-reuse-blog.md](./docs/utils-reuse-blog.md)

## Quick start

```bash
# Install (GitHub)
pnpm add -D github:qianfan-cmd/agent-utils-reuse

# Or npm (after publish)
# pnpm add -D agent-utils-reuse

# One-time setup in your project root
pnpm agent-utils-reuse init

# Merge printed AGENTS.md snippet into your agent guide

# Generate utils-book from your src/utils
pnpm gen:utils-book

# Optional CI gate
pnpm check:utils-book
```

### With example utils

```bash
pnpm agent-utils-reuse init --with-examples
pnpm gen:utils-book
```

Copies minimal `sortAsc` / `uniqueByKey` into `src/utils/array/` for learning.

## What `init` creates

| Output | Purpose |
|--------|---------|
| `.utils-bookrc.json` | Paths and JSDoc tag config |
| `docs/agent-catalog/` | Decision docs + generated utils-book |
| `.cursor/skills/reuse-before-create/` | Step-by-step Skill |
| `.cursor/rules/reuse-first.mdc` | Always-on Rule |
| `.cursor/hooks/` | Reminder before writing utils |
| `package.json` scripts | `gen:utils-book`, `check:utils-book` |

## Configuration (`.utils-bookrc.json`)

| Field | Default | Description |
|-------|---------|-------------|
| `projectRoot` | `.` | Project root |
| `utilsDir` | `src/utils` | Directory to scan |
| `catalogDir` | `docs/agent-catalog` | Agent catalog root |
| `utilsBookDir` | `docs/agent-catalog/utils-book` | Generated book |
| `skillsDir` | `.cursor/skills` | For skills.md index |
| `jsdocTag` | `@utils-book` | Summary tag in JSDoc |

## CLI

```bash
agent-utils-reuse init [--yes] [--force] [--with-examples]
agent-utils-reuse gen [--check]
agent-utils-reuse check
```

## Improve summaries

```ts
/** @utils-book One-line description of what this export does */
export function myUtil(input: string): string {
  return input.trim()
}
```

## Example project

See [`examples/minimal/`](examples/minimal/) — run `pnpm gen:utils-book` there to preview output.

## Publish this repo to GitHub

This folder is **standalone**. To publish:

```bash
cd agent-utils-reuse
git init
git add .
git commit -m "Initial release: agent-utils-reuse"
git remote add origin git@github.com:qianfan-cmd/agent-utils-reuse.git
git push -u origin main
```

Users then: `pnpm add -D github:qianfan-cmd/agent-utils-reuse`

## License

MIT
