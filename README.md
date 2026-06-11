# agent-utils-reuse

**Agent utils reuse gate** — Confirm (five questions) + Verdict in chat before Write.

Stop AI coding agents from silently forking your shared utilities. **v0.1.9**: **`confirm` Hook now requires Read util files AND prior-chat `Verdict（最终）`** before Write — fixes agents skipping Confirm after Read.

- **utils-book generator** — scan utils, write index + chapters + line numbers
- **Confirm gate** — substantive Q1–Q5 + **`Verdict（最终）`** per util before Write
- **Cursor templates** — full Rules stack + confirm Hook; **no manual per-project edits**

> 设计说明：[docs/utils-reuse-blog.md](./docs/utils-reuse-blog.md)

## How constraints work (v0.1.9)

| Layer | Role |
|-------|------|
| **Rules (auto-installed)** | `workspace-agent-gate` + `project-agent-gate` + `utils-reuse-gate` + `code-before-edit` — refreshed every **`init`** |
| **Hook (default confirm)** | **Deny Write until util files Read AND prior-chat Verdict recorded**; merged disk + StrReplace `@/utils` detection |
| **AGENTS.md** | Merged snippet on init; `--force` refreshes marker block |

**Two-phase workflow**: Message A = Confirm + Verdict (no Write tools); Message B = Write.

**Any project** gets the same stack after init — test projects (e.g. ai-web) do not need hand-edited rules.

**Optional**: `projectAgentCoreRule` in `.utils-bookrc.json` to inject the same utils bullets into **your** existing alwaysApply rule (`init --force`).

Open Cursor at the **project root**. Test hooks: `pnpm test:hooks [projectRoot]`.

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
node node_modules/agent-utils-reuse/bin/cli.mjs init --force

# 2. Ensure src/utils exists, then generate the book
pnpm gen:utils-book
```

If `pnpm agent-utils-reuse` is not on PATH (Windows `.bin` issues), always use:

```bash
node node_modules/agent-utils-reuse/bin/cli.mjs init --force
```

### Try with sample utils

```bash
node node_modules/agent-utils-reuse/bin/cli.mjs init --with-examples
pnpm gen:utils-book
```

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
| `.cursor/rules/project-agent-gate.mdc` | **alwaysApply checklist** — any project |
| `.cursor/rules/utils-reuse-gate.mdc` | Mandatory Confirm gate (alwaysApply) |
| `.cursor/rules/reuse-first.mdc` | Summary Rule |
| `.cursor/hooks/` | confirm + Verdict Hook; refreshed every init |

### Upgrade v0.1.8 → v0.1.9

```bash
pnpm add -D github:qianfan-cmd/agent-utils-reuse#v0.1.9   # or file:../agent-utils-reuse
node node_modules/agent-utils-reuse/bin/cli.mjs init --force
pnpm test:hooks
```

**Breaking behavior change**: `hookMode: confirm` now denies Write when util files were Read but chat **Verdict（最终）** was not recorded in a prior assistant message. New hook: `afterAgentResponse` → `track-utils-verdict.mjs`.

### Upgrade / update (general)

Every **`init`** refreshes **package-managed** files (rules, hooks, placement-decision, Skill). You do **not** need to copy from `node_modules` manually.

- **`init --force`**: also refresh `AGENTS.md` utils snippet, workflow inject, and `projectAgentCoreRule` inject block
- **`hookMode`** and other package keys merge into existing `.utils-bookrc.json` (`--force` overwrites package keys)

### Projects with an existing agent-core rule

If you already have `.cursor/rules/my-agent-core.mdc` (`alwaysApply: true`), add to `.utils-bookrc.json`:

```json
"projectAgentCoreRule": ".cursor/rules/my-agent-core.mdc"
```

Then `init --force` injects a marked utils gate block. **`project-agent-gate.mdc` remains installed** for redundancy.

## Commands

| Command | Action |
|---------|--------|
| `node node_modules/agent-utils-reuse/bin/cli.mjs init` | Install / **upgrade** package-managed rules, hooks, docs |
| `… init --with-examples` | Setup + sample array utils |
| `… init --force` | Also refresh AGENTS.md snippet + project-core inject |
| `pnpm gen:utils-book` | Regenerate utils-book from `src/utils` |
| `pnpm check:utils-book` | Regenerate + `git diff` (CI gate) |
| `pnpm test:hooks` | Hook confirm + Verdict smoke tests |

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
| `hookMode` | `confirm` | `confirm` = deny until util Read **and** prior-chat Verdict; `remind` = message only |
| `utilsImportAliases` | `["@/utils"]` | Import prefixes for Hook (merged disk + patch) |
| `remindWritePaths` | `src/feature`, … | App paths scanned for `@/utils` on Write |
| `sourceGlobs` | `src/**/*.{vue,ts,tsx}` | Default for `code-before-edit.mdc` |
| `projectAgentCoreRule` | `null` | Optional path to merge utils gate into your alwaysApply core rule |

### Optional remind mode (soft Hook)

To disable Read/Verdict deny and show reminders only:

1. Set `"hookMode": "remind"` in `.utils-bookrc.json`
2. Run `init --force` or manually remove `sessionStart` / `postToolUse` / `afterAgentResponse` from `.cursor/hooks.json` (keep `preToolUse` only)

Rules still require Confirm + **`Verdict（最终）`** in chat — remind does not enforce that.

### confirm mode (default, v0.1.9)

`init --force` installs:

```json
{
  "hooks": {
    "sessionStart": [{ "command": "node .cursor/hooks/track-utils-reads.mjs --reset" }],
    "postToolUse": [{ "command": "node .cursor/hooks/track-utils-reads.mjs", "matcher": "Read" }],
    "preToolUse": [{
      "command": "node .cursor/hooks/check-discovery-before-shared-write.mjs",
      "matcher": "Write|StrReplace|EditNotebook"
    }],
    "afterAgentResponse": [{
      "command": "node .cursor/hooks/track-utils-verdict.mjs"
    }]
  }
}
```

Init adds `.cursor/.utils-gate-reads.json` and `.cursor/.utils-gate-verdict.json` to `.gitignore`.

### Known limits

- **Verdict detection is heuristic** — cannot verify substantive Q1–Q5; Rules + human retest still needed
- **Same message Verdict + Write** — `preToolUse` runs before `afterAgentResponse` → denied; split into two messages (by design)
- **Cloud Agent** — `afterAgentResponse` not wired in cloud; Rules only there
- **Tab / non-Agent mode** — hooks do not apply

### Test Hook locally (Windows)

Git Bash `node` is often aliased to `winpty node.exe` — **pipe tests fail** with `stdin is not a tty`. Use PowerShell or direct path:

```powershell
cd your-project
node ../agent-utils-reuse/scripts/test-hook-confirm.mjs .
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
