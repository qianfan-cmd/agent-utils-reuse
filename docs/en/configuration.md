# Configuration

[English](configuration.md) | [简体中文](../zh-CN/configuration.md) | [README](../../README.md)

`.utils-bookrc.json` at project root. Created/merged by `init`.

## Fields

| Field | Default | Description |
|-------|---------|-------------|
| `utilsDir` | `src/utils` | Directory to scan |
| `catalogDir` | `docs/agent-catalog` | Agent catalog root |
| `utilsBookDir` | `docs/agent-catalog/utils-book` | Generated human-readable book |
| `utilsIndexFile` | `docs/agent-catalog/utils-index.json` | Generated KV index (Agent D1) |
| `skillsDir` | `.cursor/skills` | For `skills.md` index |
| `agentsFile` | `AGENTS.md` | Merged by `init` |
| `jsdocTag` | `@utils-book` | One-line summary tag |
| `hookMode` | `off` | `off` \| `confirm` \| `remind` |
| `sameTurnAllow` | `true` | Same assistant turn Confirm + Write (confirm mode) |
| `maxImportSymbolsPerTurn` | `5` | Hard deny when patch exceeds without full Verdict |
| `agentsReadMode` | `tool` | `session` = AGENTS read at sessionStart |
| `lightGatePaths` | `[]` | Import-only gate (skip Local helpers) |
| `searchSynonyms` | `{}` | Merge synonym tokens into `searchText` |
| `crossFileSiblingGroups` | `[]` | Cross-file sibling hints for Q4 |
| `utilsImportAliases` | `["@/utils"]` | Import prefixes for Hook |
| `remindWritePaths` | `src/feature`, … | App paths scanned on Write |
| `sourceGlobs` | `src/**/*.{vue,ts,tsx}` | `code-before-edit.mdc` globs |
| `projectAgentCoreRule` | `null` | Merge utils gate into your alwaysApply rule |
| `installedPackageVersion` | *(written by update)* | Last synced version |
| `gateFileHashes` | *(written by update)* | Mergeable doc hashes |
| `gateOverwriteHashes` | *(written by update)* | Overwrite-tier file hashes |
| `requireDiscoveryForUtilGate` | `false`* | Util import Write requires Discovery session |
| `preferCliSearch` | `false`* | Require `cli` or `grep-index` Discovery (not D2-only) |
| `strictBatchLimit` | `false`* | Always deny patch with >5 import symbols |
| `allowBusinessDiscovery` | `false`* | Accept D1.5 feature-path Grep as Discovery |

\*When **`hookMode: confirm`**, these default to **`true`** unless set to `false` in bookrc.

## hookMode

| Mode | Write deny | hooks.json |
|------|------------|------------|
| **`off`** (default) | No | Empty |
| `confirm` | Yes | Full audit + preToolUse |
| `remind` | No | preToolUse reminder only |

Rules **always** require Confirm + `Verdict（最终）` in chat before Write.

```json
{ "hookMode": "off" }
```

Strict acceptance:

```json
{ "hookMode": "confirm", "sameTurnAllow": true }
```

Split-turn strict audit:

```json
{ "hookMode": "confirm", "sameTurnAllow": false }
```

## Compliance profile (acceptance testing)

Default **`hookMode: off`** is Rules-only — it **cannot** prove whether the Agent outputs Confirm in chat. For acceptance or consumer stress tests, merge fields from [`docs/agent-catalog/.utils-bookrc.compliance.json`](../agent-catalog/.utils-bookrc.compliance.json) into project-root `.utils-bookrc.json`, then run `pnpm update:utils-reuse --yes` (or `init --force`) so hooks are registered.

| Field | compliance value | Purpose |
|-------|------------------|---------|
| `hookMode` | `confirm` | Deny Write when Verdict / D1 / Read missing |
| `strictBatchLimit` | `true` | Deny single-turn patch with >5 `@/utils` imports (`batch_limit_exceeded`) |
| `agentsReadMode` | `tool` | Require full AGENTS.md Read in session (no limit/offset) |
| `allowBusinessDiscovery` | `true` | D1.5 feature Grep counts as Discovery; chat still needs `D1.5: Grep … → sym @ path` |
| `lightGatePaths` | e.g. `src/views/test` | Weaken Local helpers on test paths; **not** util Confirm |

Full runbook: [production-rollout.md § Acceptance mode](production-rollout.md#acceptance-mode).

### confirm mode hooks

When `hookMode: confirm` or `remind`, `init` registers:

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

Audit files are gitignored under `.cursor/.utils-gate-*.json`.

## Project with existing core rule

```json
"projectAgentCoreRule": ".cursor/rules/my-agent-core.mdc"
```

Then `init --force` injects a marked utils block. `project-agent-gate.mdc` remains for redundancy.

## Known limits

- Verdict detection is heuristic — cannot verify Q4 equivalence
- Thinking-only Confirm is invisible to Hook
- Shell Write bypasses hooks
- Cloud Agent may not wire `afterAgentResponse`
- v0.3.18: same-turn Confirm via `transcript_path` when preToolUse payload lacks assistant text

## Commands

| Command | Action |
|---------|--------|
| `pnpm upgrade:utils-reuse` | Latest package + gate |
| `pnpm update:utils-reuse` | Gate-only sync |
| `pnpm gen:utils-book` | Regenerate index + book |
| `pnpm check:utils-book` | CI: gen + git diff |
| `agent-utils-reuse uninstall --yes` | Remove gate + catalog (see [README § Uninstall](../../README.md#uninstall)) |

See [getting-started.md](getting-started.md) for upgrade flags and uninstall.
