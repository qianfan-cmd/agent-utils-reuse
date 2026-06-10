# agent-utils-reuse

**Agent utils reuse gate** — Confirm (five questions) + Verdict in chat before Write.

Stop AI coding agents from silently forking your shared utilities. **v0.1.6** refines the **Rules stack**: understand task first, then **Identify → Read export(s) → Confirm + Verdict** before Write; Hook defaults to **remind**.

- **utils-book generator** — scan utils, write index + chapters + line numbers
- **Confirm gate** — substantive Q1–Q5 + Verdict per util; Shortlist / placement / Skill optional
- **Cursor templates** — workspace gate, code-before-edit glob, utils-reuse-gate, optional Skill, remind Hook

> 设计说明：[docs/utils-reuse-blog.md](./docs/utils-reuse-blog.md)

## How constraints work (v0.1.6)

| Layer | Role |
|-------|------|
| **Rules** (primary) | Read `AGENTS.md` → understand task/business code → Identify utils → Read **called export(s)** → Confirm + Verdict → Write |
| **AGENTS.md** | Single source of truth merged by `init` |
| **Skill** | Optional procedural duplicate — **not required to Read each task** |
| **Hook** (secondary) | Default **`remind`**: allow + message — **not** a hard deny |

**Mandatory (utils validation)**: Read AGENTS → task context → Identify → Read export(s) you will call → substantive Confirm + Verdict before Write.

**Optional**: utils-book Shortlist; read `placement-decision.md` for §1.5 edge cases; read Skill file.

Open Cursor at the **project root** (where `package.json` lives) so rules and hooks resolve paths correctly.

Optional **`hookMode: confirm`** (advanced): may deny Write until util **files** were Read this session. See [Optional confirm mode](#optional-confirm-mode) below.

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
| `.utils-bookrc.json` | Scan paths, hook mode, globs |
| `docs/agent-catalog/placement-decision.md` | Reuse rules (five questions) |
| `docs/agent-catalog/AGENTS.utils-reuse.snippet.md` | Manual-merge reference (usually not needed) |
| `docs/agent-catalog/utils-book/` | **Generated** by `gen` (do not hand-edit) |
| `.cursor/rules/workspace-agent-gate.mdc` | **Read AGENTS.md first** (alwaysApply) |
| `.cursor/rules/code-before-edit.mdc` | Source globs — Confirm before Write |
| `.cursor/rules/utils-reuse-gate.mdc` | Mandatory Confirm gate (alwaysApply) |
| `.cursor/rules/reuse-first.mdc` | Summary Rule |
| `.cursor/hooks/` | Remind Hook (confirm hooks kept for opt-in) |

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
| `hookMode` | `remind` | `remind` = allow + message; `confirm` = optional deny until util Read |
| `utilsImportAliases` | `["@/utils"]` | Import prefixes for Hook import detection (confirm mode) |
| `remindWritePaths` | `src/feature`, … | App paths that trigger remind on Write |
| `sourceGlobs` | `src/**/*.{vue,ts,tsx}` | Documented default for `code-before-edit.mdc` (edit rule frontmatter if needed) |

### Optional confirm mode

For teams that want Hook-level deny (experimental; may vary by Cursor version):

1. Set `"hookMode": "confirm"` in `.utils-bookrc.json`
2. Add to `.cursor/hooks.json`:

```json
{
  "hooks": {
    "sessionStart": [{ "command": "node .cursor/hooks/track-utils-reads.mjs --reset" }],
    "postToolUse": [{ "command": "node .cursor/hooks/track-utils-reads.mjs", "matcher": "Read" }],
    "preToolUse": [{
      "command": "node .cursor/hooks/check-discovery-before-shared-write.mjs",
      "matcher": "Write|StrReplace|EditNotebook"
    }]
  }
}
```

3. Add `.cursor/.utils-gate-reads.json` to `.gitignore` (init does this)

Confirm mode does **not** replace chat Verdict — Rules still require Confirm + Verdict.

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
