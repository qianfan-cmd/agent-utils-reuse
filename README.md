# agent-utils-reuse

**Agent utils reuse gate** — Confirm (five questions) + Verdict in chat before Write.

Stop AI coding agents from silently forking your shared utilities. **v0.2.1**: **Post-selection proof** — Message A requires **individual Q1–Q4 per symbol** (Hook rejects hollow `Q1-Q5 通过`); adding local helpers requires Discovery + **Local helpers** table + prior Verdict.

- **utils-book generator** — scan utils, write index + chapters + line numbers
- **Confirm gate** — substantive Q1–Q5 **per util and per Local helpers row** + **`Verdict（最终）`** before Write
- **Discovery gate (v0.2.0+)** — mandatory Shortlist/Grep before adding util-semantics local helpers in feature code
- **Cursor templates** — full Rules stack + confirm Hook; **no manual per-project edits**

> 设计说明：[docs/utils-reuse-blog.md](./docs/utils-reuse-blog.md)

## How constraints work (v0.2.1)

| Layer | Role |
|-------|------|
| **Rules (auto-installed)** | `workspace-agent-gate` + `project-agent-gate` + `utils-reuse-gate` + `code-before-edit` — refreshed every **`update:utils-reuse`** |
| **Hook (default confirm)** | **Deny Write** until util files Read **and** prior-chat Verdict with **individual Q1–Q4** (when `@/utils` in target); **deny new local helpers** without Discovery **and** Local helpers table **and** substantive Verdict |
| **AGENTS.md** | Merged snippet on init; `--force` refreshes marker block |

**Two-phase workflow**: Message A = Identify + Discovery (when triggered) + Local helpers table + **per-symbol Confirm (Q1–Q4 separately)** + Verdict (no Write tools); Message B = Write (later message). **Read** must target **util source exports** you will call — feature import/call sites alone do not count.

**Any project** gets the same stack after init — test projects (e.g. ai-web) do not need hand-edited rules.

**Optional**: `projectAgentCoreRule` in `.utils-bookrc.json` to inject the same utils bullets into **your** existing alwaysApply rule (`init --force`).

Open Cursor at the **project root**. Test hooks: `pnpm test:hooks [projectRoot]`, `pnpm test:hook-discovery [projectRoot]`, and `pnpm test:verdict-substance`.

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

### Upgrade v0.2.0 → v0.2.1

```bash
pnpm add -D github:qianfan-cmd/agent-utils-reuse#v0.2.1
pnpm update:utils-reuse
pnpm test:hooks
pnpm test:hook-discovery
pnpm test:verdict-substance
```

**Behavior change**: **Post-selection proof** — Hook rejects hollow Confirm (`Q1-Q5 通过` without individual Q1–Q4). Adding local helpers requires prior Message A with **Local helpers** table + substantive Verdict (Discovery still required). See `placement-decision.md` §1.6.

### Upgrade v0.1.9 → v0.2.0

```bash
pnpm add -D github:qianfan-cmd/agent-utils-reuse#v0.2.0
pnpm update:utils-reuse
pnpm test:hooks
pnpm test:hook-discovery
```

**Behavior change**: **Discovery gate** — Write under feature paths that **adds new local function helpers** requires this session: Read `utils-book/index.md` (D1) **or** Grep/SemanticSearch under `utilsDir` (D2). Rules require **Discovery + Local helpers table** in Message A. New audit: `.cursor/.utils-gate-discovery.json`; new hook: `track-utils-discovery.mjs` on Grep/SemanticSearch.

### Upgrade v0.1.8 → v0.1.9

```bash
pnpm add -D github:qianfan-cmd/agent-utils-reuse#v0.1.9
pnpm update:utils-reuse
pnpm test:hooks
```

**Breaking behavior change**: `hookMode: confirm` now denies Write when util files were Read but chat **Verdict（最终）** was not recorded in a prior assistant message. New hook: `afterAgentResponse` → `track-utils-verdict.mjs`.

### Upgrade / update (general)

**Two steps** — upgrade the npm package separately from reinstalling gate files (`update` does **not** run `pnpm add` or touch other dependencies):

```bash
# 1. Upgrade devDependency only (when you want a new published version in node_modules)
pnpm add -D github:qianfan-cmd/agent-utils-reuse#v0.2.0
# or local dev: pnpm add -D file:../agent-utils-reuse

# 2. One-command full gate sync (overwrite tier + verify)
pnpm update:utils-reuse
```

**`file:` local dev**: if your linked package is **newer** than `node_modules`, `update` syncs templates from the **link** without re-running `pnpm add`. Run `agent-utils-reuse status` or `verify` to check drift.

What **`update`** (gate reinstall) does:

1. Sync **overwrite-tier gate files** from templates — rules, hooks, skill, `hooks.json`, AGENTS snippet, gitignore audit lines
2. **Verify** overwrite files match templates (exit 1 if not — no silent partial success)
3. Remove deprecated gate files; prune obsolete `.utils-bookrc.json` keys
4. Write `installedPackageVersion`, `gateFileHashes`, `gateOverwriteHashes`
5. Merge-tier docs (`placement-decision.md`, …) still use hash conflict sidecars

What it **does not** do: `pnpm add` (unless `--bump`), lockfile changes, or modifying `src/**` / `utils-book/`.

| Flag | Action |
|------|--------|
| *(default)* | Reinstall + verify gate from node_modules or newer `file:` link |
| `--bump` | Also run `pnpm add -D` first (optional) |
| `--tag v0.2.0` | Pin version when using `--bump` |
| `--dry-run` | Report drift + planned reinstall without writing |
| `--accept-upstream` | Take package version for mergeable docs (like `git checkout --theirs`) |
| `--force-docs` | Alias for `--accept-upstream` |

Diagnose:

```bash
node node_modules/agent-utils-reuse/bin/cli.mjs status
node node_modules/agent-utils-reuse/bin/cli.mjs verify
```

**ai-web acceptance** after update:

- `.cursor/hooks.json` → 2 `postToolUse` entries (Read + Grep/SemanticSearch)
- `.cursor/hooks/track-utils-discovery.mjs` exists
- `agent-utils-reuse verify` → `Gate verify: OK`
- `pnpm test:hook-discovery .` (from agent-utils-reuse repo)

### Merge conflicts (like git pull)

Mergeable docs (`placement-decision.md`, `MERGE-AGENTS.md`, `README.md`) use **hash-based conflict detection**:

- No local edits since last sync → fast-forward to package template
- Local edits + upstream changed → **conflict**: your file kept; package copy written as `*.utils-reuse-upstream`

```
docs/agent-catalog/placement-decision.md
docs/agent-catalog/placement-decision.md.utils-reuse-upstream
```

Resolve manually (`diff` the two files), delete the sidecar, run `pnpm update:utils-reuse` again — or use `--accept-upstream` to discard local doc changes.

Every **`init`** still refreshes package-managed rules/hooks on first install.

- **`init --force`**: refresh `AGENTS.md` snippet + project-core inject
- **`init --accept-upstream`**: take package docs on init (rare)
- **`hookMode`** and other package keys merge into `.utils-bookrc.json`

### Projects with an existing agent-core rule

If you already have `.cursor/rules/my-agent-core.mdc` (`alwaysApply: true`), add to `.utils-bookrc.json`:

```json
"projectAgentCoreRule": ".cursor/rules/my-agent-core.mdc"
```

Then `init --force` injects a marked utils gate block. **`project-agent-gate.mdc` remains installed** for redundancy.

## Commands

| Command | Action |
|---------|--------|
| `pnpm update:utils-reuse` | **Reinstall + verify** gate from templates (no pnpm add) |
| `… update --yes --bump` | Optional: bump package then reinstall gate |
| `… update --accept-upstream` | Take package docs; discard local doc customizations |
| `… status` | Version drift, **gate verify**, deprecated files, merge conflicts |
| `… verify` | Detailed overwrite-tier gate file check (exit 1 on drift) |
| `node node_modules/agent-utils-reuse/bin/cli.mjs init` | First-time install |
| `… init --with-examples` | Setup + sample array utils |
| `… init --force` | Also refresh AGENTS.md snippet + project-core inject |
| `pnpm gen:utils-book` | Regenerate utils-book from `src/utils` |
| `pnpm check:utils-book` | Regenerate + `git diff` (CI gate) |
| `pnpm test:hooks` | Hook confirm + Verdict smoke tests |
| `pnpm test:update` | Update command regression test (package dev) |

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
| `installedPackageVersion` | *(written by `update`)* | Last synced template/package version |
| `gateFileHashes` | *(written by `update`)* | Content hashes for mergeable gate docs |
| `gateOverwriteHashes` | *(written by `update`)* | Content hashes for overwrite-tier gate files |

### Optional remind mode (soft Hook)

To disable Read/Verdict deny and show reminders only:

1. Set `"hookMode": "remind"` in `.utils-bookrc.json`
2. Run `init --force` or manually remove `sessionStart` / `postToolUse` / `afterAgentResponse` from `.cursor/hooks.json` (keep `preToolUse` only)

Rules still require Confirm + **`Verdict（最终）`** in chat — remind does not enforce that.

### confirm mode (default, v0.2.0)

`init --force` installs:

```json
{
  "hooks": {
    "sessionStart": [{ "command": "node .cursor/hooks/track-utils-reads.mjs --reset" }],
    "postToolUse": [
      { "command": "node .cursor/hooks/track-utils-reads.mjs", "matcher": "Read" },
      { "command": "node .cursor/hooks/track-utils-discovery.mjs", "matcher": "Grep|SemanticSearch" }
    ],
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

Init adds `.cursor/.utils-gate-reads.json`, `.cursor/.utils-gate-verdict.json`, and `.cursor/.utils-gate-discovery.json` to `.gitignore`.

### Known limits

- **Verdict detection is heuristic** — Hook requires individual Q1–Q4 tokens and Verdict outcome; cannot verify Q4 equivalence correctness or placement debt accuracy
- **Local helpers table detection** — markdown header + at least one data row; cannot verify table completeness vs planned helpers
- **Discovery detection is heuristic** — matches new `function` / `const fn =` in Write patches under feature paths
- **Update verify** — overwrite-tier files must match templates after `update`; run `verify` if unsure; may miss or false-positive edge cases
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

## JSDoc on exports (required in utilsDir)

Every **new or changed export** under `utilsDir` must have **`/** */`** immediately above the export. Prefer `@utils-book` for a one-line behavior summary, then run `pnpm gen:utils-book`.

```ts
/** @utils-book 数字数组升序排序，返回新数组 */
export function sortAsc(nums: number[]): number[] {
  return [...nums].sort((a, b) => a - b)
}
```

Without `@utils-book`, the generator uses the first description line in `/** */`, or `(无简介 — Confirm 前须 Read 实现)`.

## Preview output

Clone this repo and open [`examples/minimal/docs/agent-catalog/utils-book/`](examples/minimal/docs/agent-catalog/utils-book/) — sample generated book from two array utils.

## License

MIT
