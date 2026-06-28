# agent-utils-reuse

**Agent utils reuse gate** — Confirm (five questions) + Verdict in chat before Write.

Stop AI coding agents from silently forking your shared utilities. **v0.3.0**: **KV utils retrieval** — Agent Discovery D1 uses `utils-index.json` + `agent-utils-reuse search` (not Markdown utils-book). **v0.2.1**: post-selection proof with individual Q1–Q4 per symbol.

- **utils-index + search CLI** — keyword search over generated KV index (Agent Discovery D1)
- **utils-book generator** — human-readable Markdown + `utils-index.json` from same scan
- **Confirm gate** — substantive Q1–Q5 **per util and per Local helpers row** + **`Verdict（最终）`** before Write
- **Discovery gate** — search / Grep index or Grep `utilsDir` before adding util-semantics local helpers
- **Cursor templates** — full Rules stack; **Write Hook opt-in** (`hookMode: confirm`)

> 设计说明：[docs/utils-reuse-blog.md](./docs/utils-reuse-blog.md)

## How constraints work (v0.2.1)

| Layer | Role |
|-------|------|
| **Rules (auto-installed)** | `workspace-agent-gate` + `project-agent-gate` + `utils-reuse-gate` + `code-before-edit` — refreshed every **`upgrade:utils-reuse`** or **`update:utils-reuse`** |
| **Hook (default confirm)** | Rules + Write deny until AGENTS.md Read + Confirm + Verdict; set `off` for Rules-only |
| **AGENTS.md** | Merged snippet on init; `--force` refreshes marker block |

**Two-phase workflow**: Message A = Identify + Discovery (when triggered) + Local helpers table + **per-symbol Confirm (Q1–Q4 separately)** + Verdict (no Write tools); Message B = Write (later message). **Read** must target **util source exports** you will call — feature import/call sites alone do not count.

**Any project** gets the same stack after init — test projects (e.g. ai-web) do not need hand-edited rules.

**Optional**: `projectAgentCoreRule` in `.utils-bookrc.json` to inject the same utils bullets into **your** existing alwaysApply rule (`init --force`).

Open Cursor at the **project root**. Test hooks: `pnpm test:hooks [projectRoot]`, `pnpm test:hook-discovery [projectRoot]`, `pnpm test:search-utils-index [projectRoot]`, and `pnpm test:verdict-substance`.

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

# 2. Ensure src/utils exists, then generate index + book
pnpm gen:utils-book
# Agent Discovery D1 (from project root):
node node_modules/agent-utils-reuse/bin/cli.mjs search "数组 排序" --limit 8

# 3. Existing utils missing @utils-book? Backfill JSDoc (Agent prompt in catalog docs):
#    docs/agent-catalog/BACKFILL-UTILS-BOOK.en.md  (English)
#    docs/agent-catalog/BACKFILL-UTILS-BOOK.zh.md  (中文)
#    Then run pnpm gen:utils-book again.

# 4. Later — upgrade to latest package + gate (one command):
pnpm upgrade:utils-reuse
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
| `docs/agent-catalog/utils-index.json` | **Generated** KV index — **Agent Discovery D1** |
| `docs/agent-catalog/utils-book/` | **Generated** human-readable book (Agent **must not** Read for Shortlist) |
| `.cursor/rules/workspace-agent-gate.mdc` | **Read AGENTS.md first** (alwaysApply) |
| `.cursor/rules/code-before-edit.mdc` | Source globs — Confirm before Write |
| `.cursor/rules/project-agent-gate.mdc` | **alwaysApply checklist** — any project |
| `.cursor/rules/utils-reuse-gate.mdc` | Mandatory Confirm gate (alwaysApply) |
| `.cursor/rules/pre-write-utils-checklist.mdc` | Message A/B HARD STOP before Write (alwaysApply) |
| `.cursor/rules/reuse-first.mdc` | Summary Rule |
| `.cursor/hooks/` | Hook scripts (installed); **registered in hooks.json only when `hookMode: confirm` or `remind`** |

### Upgrade v0.3.7 → v0.3.8

```bash
pnpm upgrade:utils-reuse
pnpm test:hooks
pnpm test:verdict-substance
```

**Batch Confirm + reliable confirm (v0.3.8):**

- **Default `hookMode: confirm`** — Write deny until full **`AGENTS.md`** Read + util Read + chat Confirm + **`Verdict（最终）`**
- **Bulk Confirm table** (≥3 symbols): `| Symbol | 候选 | Q1 | Q2 | Q3 | Q4 | Verdict |` — Hook accepts per-row Q columns
- **`utils-index.json` `siblingsByPath`** — same-file multi-export → Q4 must mention sibling in chat
- **Discovery chat**: D1 candidates or `D1 "<kw>": 0 candidates → D2: ...` (page comments ≠ proof)
- **Hook fixes**: exact-path Read audit; newUtil new file Write; arrow helpers; unresolved import still requires Verdict

**Acceptance / flow testing**: batch harness needs `hookMode: confirm` + table Confirm; selection-only tests may use `off`.

**Maintainers**: push git tags (`git tag v0.3.8 && git push origin v0.3.8`).

### Upgrade v0.3.6 → v0.3.7

```bash
pnpm upgrade:utils-reuse
pnpm test:hooks
```

**Gate/KV test feedback (v0.3.7):**

- **confirm hook**: deny JSON includes **`missingReads`** and **`staleSymbols`** (symbol-granular Verdict)
- **Discovery audit** `via`: `cli` | `grep-index` | `d2-utils-dir`
- **Rules**: D1 zero candidates → mandatory D2; sibling Grep; **Gate N/A**; Confirm must Read util source (not index/feature-only)
- **patchAddsLocalHelper**: template-only `.vue` StrReplace no longer triggers addsHelper chain

**Maintainers**: push git tags (`git tag v0.3.7 && git push origin v0.3.7`).

### Upgrade v0.3.5 → v0.3.6

```bash
pnpm upgrade:utils-reuse
pnpm test:hooks
```

**Default Write Hook off (v0.3.6):**

- **`hookMode: off`** is the new default — **no `preToolUse` Write deny**; Confirm + Verdict enforced by Rules only
- Avoids Agent Shell bypass when hook timing/heuristics fail in Cursor
- Opt-in hard gate: set `"hookMode": "confirm"` in `.utils-bookrc.json`, then `pnpm update:utils-reuse --yes`
- **`hookMode: remind`** — preToolUse allow + reminder only (no deny)

**Maintainers**: push git tags (`git tag v0.3.6 && git push origin v0.3.6`).

### Upgrade v0.3.4 → v0.3.5

```bash
pnpm upgrade:utils-reuse
pnpm test:hooks
```

**Verdict audit closure (v0.3.5):**

- **Buffer-level BOM strip** (`EF BB BF`) — fixes fail-closed when all hooks crash on stdin parse
- **Absolute-path Discovery** — Grep `E:/proj/src/utils` now records discovery (prefer relative `src/utils`)
- **Local helpers table headers** — accepts `| Helper |`, `| 本地函数 |`, `Local helpers`, etc.
- **`patchAddsLocalHelper`** — scans only `<script>` blocks in `.vue` (CSS/template patches no longer false-positive)
- **Hook parse errors** include `err.message` in deny text; debug keys logged to `.utils-gate-hook-debug.log`

**Maintainers**: push git tags (`git tag v0.3.5 && git push origin v0.3.5`).

### Upgrade v0.3.3 → v0.3.4

```bash
pnpm upgrade:utils-reuse
pnpm test:hooks
```

**Same-turn Confirm→Write (v0.3.4):**

- **Confirm then Implement in one assistant response** — no user "继续" required
- **BOM-safe hook stdin** — fixes fail-closed when Cursor sends UTF-8 BOM
- **Eager Verdict record** in preToolUse when assistant text is in hook payload
- **`afterAgentThought`** hook for early Verdict capture
- D1 Discovery: `search` or Grep **`utils-index.json`** (repo-wide business Grep ≠ D1)

**Maintainers**: push git tags (`git tag v0.3.4 && git push origin v0.3.4`).

### Upgrade v0.3.2 → v0.3.3

```bash
pnpm upgrade:utils-reuse
pnpm test:hooks
```

**Gate hardening (all init projects, not ai-web-specific):**

- **Hook fail-closed** — `hookMode: confirm` errors deny Write (no silent allow)
- **Session Read → Write** — after Read under `utilsDir`, Write under `remindWritePaths` without prior assistant `Verdict（最终）` → deny (even if patch has no `@/utils` import)
- **`pre-write-utils-checklist.mdc`** — alwaysApply Message A/B reminder
- **Catalog docs** — two task types (index maintenance vs business Write); BACKFILL does not replace five-question gate

**Maintainers**: push git tags (`git tag v0.3.3 && git push origin v0.3.3`) so GitHub installs resolve versions.

### Upgrade v0.3.1 → v0.3.2

```bash
pnpm upgrade:utils-reuse
```

**New**: `upgrade:utils-reuse` — resolves latest GitHub semver tag (or npm `@latest`), runs `pnpm add`, then syncs gate. `update:utils-reuse` remains gate-only (for `file:` local dev).

**Maintainers**: push git tags (`git tag v0.3.2 && git push origin v0.3.2`) so GitHub installs resolve versions.

### Upgrade v0.3.0 → v0.3.1

```bash
pnpm upgrade:utils-reuse
```

**Docs only**: bilingual backfill guides `docs/agent-catalog/BACKFILL-UTILS-BOOK.zh.md` and `.en.md` — copy-paste Agent prompts to add missing `@utils-book` JSDoc on existing exports, then `pnpm gen:utils-book`. No Hook/search algorithm changes.

### Upgrade v0.2.1 → v0.3.0

```bash
pnpm upgrade:utils-reuse
pnpm gen:utils-book
pnpm test:hooks
pnpm test:hook-discovery
pnpm test:search-utils-index
pnpm test:verdict-substance
```

**Behavior change**: **KV retrieval** — Agent Discovery D1 is `agent-utils-reuse search` or Grep `utils-index.json`. **Read `utils-book/*.md` no longer counts as Discovery.** Markdown utils-book is human-only. New file: `docs/agent-catalog/utils-index.json`. Hook adds `Shell` postToolUse for search command.

### Upgrade v0.2.0 → v0.2.1

```bash
pnpm upgrade:utils-reuse
pnpm test:hooks
pnpm test:hook-discovery
pnpm test:verdict-substance
```

**Behavior change**: **Post-selection proof** — Hook rejects hollow Confirm (`Q1-Q5 通过` without individual Q1–Q4). Adding local helpers requires prior Message A with **Local helpers** table + substantive Verdict (Discovery still required). See `placement-decision.md` §1.6.

### Upgrade v0.1.9 → v0.2.0

```bash
pnpm upgrade:utils-reuse
pnpm test:hooks
pnpm test:hook-discovery
```

**Behavior change**: **Discovery gate** — Write under feature paths that **adds new local function helpers** requires this session: Read `utils-book/index.md` (D1) **or** Grep/SemanticSearch under `utilsDir` (D2). Rules require **Discovery + Local helpers table** in Message A. New audit: `.cursor/.utils-gate-discovery.json`; new hook: `track-utils-discovery.mjs` on Grep/SemanticSearch.

### Upgrade v0.1.8 → v0.1.9

```bash
pnpm upgrade:utils-reuse
pnpm test:hooks
```

**Breaking behavior change**: `hookMode: confirm` now denies Write when util files were Read but chat **Verdict（最终）** was not recorded in a prior assistant message. New hook: `afterAgentResponse` → `track-utils-verdict.mjs`.

### Upgrade / update (general)

**Recommended — one command** (latest package + gate sync):

```bash
pnpm upgrade:utils-reuse
```

Resolves the newest GitHub semver tag (for `github:owner/repo#…`), npm `@latest`, or reinstalls a `file:` link, then syncs Rules/Hooks/Docs.

**Gate-only** (no lockfile / no `pnpm add` — use when developing the package via `file:`):

```bash
pnpm update:utils-reuse
```

**`file:` local dev**: if your linked package is **newer** than `node_modules`, `update` syncs templates from the **link** without re-running `pnpm add`. Run `agent-utils-reuse status` or `verify` to check drift.

What **`upgrade`** does:

1. Resolve latest version spec → `pnpm add -D …`
2. Everything **`update`** does below

What **`update`** (gate reinstall) does:

1. Sync **overwrite-tier gate files** from templates — rules, hooks, skill, `hooks.json`, AGENTS snippet, gitignore audit lines
2. **Verify** overwrite files match templates (exit 1 if not — no silent partial success)
3. Remove deprecated gate files; prune obsolete `.utils-bookrc.json` keys
4. Write `installedPackageVersion`, `gateFileHashes`, `gateOverwriteHashes`
5. Merge-tier docs (`placement-decision.md`, …) still use hash conflict sidecars

What it **does not** do (`update` alone): `pnpm add`, lockfile changes, or modifying `src/**` / `utils-book/`.

| Command / flag | Action |
|----------------|--------|
| `pnpm upgrade:utils-reuse` | **Recommended** — latest package + reinstall + verify gate |
| `pnpm update:utils-reuse` | Gate-only sync from node_modules or newer `file:` link |
| `… upgrade --tag v0.3.2` | Pin version instead of auto-latest |
| `… upgrade --dry-run` | Show resolved spec + planned gate reinstall |
| `… update --bump` | Legacy: bump using existing dep channel (not auto-latest) |
| `--accept-upstream` | Take package docs; discard local doc customizations |
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
| `pnpm upgrade:utils-reuse` | **Recommended** — latest package + reinstall + verify gate |
| `pnpm update:utils-reuse` | Gate-only sync (no `pnpm add`; `file:` local dev) |
| `… upgrade --tag v0.3.2` | Pin version on upgrade |
| `… upgrade --dry-run` | Preview resolved spec + gate reinstall |
| `… update --accept-upstream` | Take package docs; discard local doc customizations |
| `… status` | Version drift, **gate verify**, deprecated files, merge conflicts |
| `… verify` | Detailed overwrite-tier gate file check (exit 1 on drift) |
| `node node_modules/agent-utils-reuse/bin/cli.mjs init` | First-time install |
| `… init --with-examples` | Setup + sample array utils |
| `… init --force` | Also refresh AGENTS.md snippet + project-core inject |
| `pnpm gen:utils-book` | Regenerate utils-index.json + utils-book from `src/utils` |
| `… search "<query>" [--limit N] [--json]` | Keyword search utils-index (Agent D1) |
| `pnpm check:utils-book` | Regenerate + git diff index + book (CI gate) |
| `pnpm test:search-utils-index` | Search CLI smoke tests |
| `pnpm test:hooks` | Hook confirm + Verdict smoke tests |
| `pnpm test:update` | Update command regression test (package dev) |

`init` does **not** generate the book — run `gen` after you have `.ts` files under `utilsDir`.

## Configuration (`.utils-bookrc.json`)

| Field | Default | Description |
|-------|---------|-------------|
| `utilsDir` | `src/utils` | Directory to scan |
| `catalogDir` | `docs/agent-catalog` | Agent catalog root |
| `utilsBookDir` | `docs/agent-catalog/utils-book` | Generated human-readable book |
| `utilsIndexFile` | `docs/agent-catalog/utils-index.json` | Generated KV index (Agent D1) |
| `skillsDir` | `.cursor/skills` | For `skills.md` index |
| `agentsFile` | `AGENTS.md` | Agent guide file merged by `init` |
| `jsdocTag` | `@utils-book` | One-line summary tag in JSDoc |
| `hookMode` | `confirm` | `confirm` = Write deny (default v0.3.8); `off` = Rules only; `remind` = allow + reminder |
| `utilsImportAliases` | `["@/utils"]` | Import prefixes for Hook (merged disk + patch) |
| `remindWritePaths` | `src/feature`, … | App paths scanned for `@/utils` on Write |
| `sourceGlobs` | `src/**/*.{vue,ts,tsx}` | Default for `code-before-edit.mdc` |
| `projectAgentCoreRule` | `null` | Optional path to merge utils gate into your alwaysApply core rule |
| `installedPackageVersion` | *(written by `update`)* | Last synced template/package version |
| `gateFileHashes` | *(written by `update`)* | Content hashes for mergeable gate docs |
| `gateOverwriteHashes` | *(written by `update`)* | Content hashes for overwrite-tier gate files |

### hookMode (v0.3.8)

| Mode | Write deny | hooks.json |
|------|------------|------------|
| **`confirm`** (default) | Yes | Full audit + preToolUse deny gate |
| `off` | No | Empty — no hooks registered |
| `remind` | No | `preToolUse` only (allow + reminder) |

Rules **always** require Confirm + **`Verdict（最终）`** in chat before Write.

**Rules-only** (no tool deny):

```json
{ "hookMode": "off" }
```

### confirm mode (opt-in)

`init --force` installs:

```json
{
  "hooks": {
    "sessionStart": [{ "command": "node .cursor/hooks/track-utils-reads.mjs --reset" }],
    "postToolUse": [
      { "command": "node .cursor/hooks/track-utils-reads.mjs", "matcher": "Read" },
      { "command": "node .cursor/hooks/track-utils-discovery.mjs", "matcher": "Grep|SemanticSearch|Shell" }
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

- **Verdict detection is heuristic** — Hook requires individual Q1–Q4 or bulk Confirm table rows; cannot verify Q4 equivalence
- **Thinking-only Confirm** — not visible to Hook; must output Confirm in **user-visible chat**
- **Local helpers / bulk table detection** — markdown header + data rows; cannot verify completeness vs planned helpers
- **Discovery detection is heuristic** — matches new `function` / `const fn =` / arrow helpers in Write patches
- **Shell bypass** — Agent Shell Write bypasses hooks; reducing false denies is the main lever
- **Same-turn Verdict + Write** — supported when assistant text is in preToolUse payload (`tryEagerRecordVerdict`)
- **Cloud Agent** — `afterAgentResponse` may not be wired; Rules still apply
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
