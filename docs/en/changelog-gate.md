# Gate & package changelog

[English](changelog-gate.md) | [简体中文](../zh-CN/changelog-gate.md) | [README](../../README.md)

Upgrade notes moved from README (v0.3.19+). After any upgrade:

```bash
pnpm upgrade:utils-reuse
pnpm test:hooks
```

## v0.3.17 → v0.3.18

**Same-turn Confirm evidence channel (P0)**

- `transcript_path` readback when preToolUse payload has no assistant text
- Eager `recordVerdict` at check entry; audit keeps `verdictSource`
- Large Write parse degrade: stdin >16KB skips giant `tool_input`; path-only partial continues gate
- Symbol normalize: `reuse(UrlUtils.method)` + `import UrlUtils`
- Discovery debug: `grep_payload_path`

If transcript unavailable: `"sameTurnAllow": false` or split turns.

## v0.3.16 → v0.3.17

**Hook fail-closed fix (P0)**

- Removed `parse_fallback allow` — parse failure → `denyReason: parse_error`
- `sameTurnBypass` requires Confirm evidence
- Import-driven deny checklist on `verdict_not_recorded`
- `maxImportSymbolsPerTurn` (default 5) → `batch_limit_exceeded`
- `addsHelper` decoupled from `sameTurnAllow`
- `agentsReadMode: session`, `lightGatePaths`, KV `searchSynonyms` / `crossFileSiblingGroups`

## v0.3.15 → v0.3.16

- `parseHookJsonSafe` partial extract on broken JSON
- Gate reorder: uiOnly / sameTurnBypass before addsHelper
- v0.3.16 only: `parse_fallback allow` (removed in v0.3.17)
- `track-utils-verdict` partial stdin for Chinese Bulk Confirm

## v0.3.14 → v0.3.15

- Default `hookMode: off` again — Rules-only, no Write deny
- `hooks.json` empty by default

## v0.3.13 → v0.3.14

- `sameTurnAllow: true` by default for confirm projects
- Single-turn standard flow in `placement-decision.md` §0

## v0.3.12 → v0.3.13

- `sameTurnAllow: true` opt-in: allow+remind when reads + AGENTS OK
- Verdict marker accepts `Verdict (最终):` half-width

## v0.3.11 → v0.3.12

- `sessionCoversPatch` / delta symbol merge
- `noUtil` Q4 validation (`noutil_q4_invalid`)
- D1 siblings in search output

## v0.3.10 → v0.3.11

- #27 uiOnly allow for template/style-only patches
- Delta Confirm rules; Q4 sibling templates

## v0.3.9 → v0.3.10

- `patchGitignore` includes agents-read audit file

## v0.3.8 → v0.3.9

- Bulk compact 4-column Confirm table (≥3 symbols)
- `getBulkRowViolations`, `noUtil(sym)`, >5 symbol remind

## v0.3.7 → v0.3.8

- Default `hookMode: confirm` (later reverted to `off` in v0.3.15)
- Bulk 7-column table; `siblingsByPath` in index

## v0.3.6 → v0.3.7

- Deny JSON: `missingReads`, `staleSymbols`
- Discovery audit `via` labels

## v0.3.5 → v0.3.6

- Default `hookMode: off` introduced
- `hookMode: remind` added

## v0.3.4 → v0.3.5

- BOM strip; absolute-path Discovery; script-only addsHelper

## v0.3.3 → v0.3.4

- Same-turn Confirm+Write; eager Verdict in preToolUse

## v0.3.2 → v0.3.3

- Hook fail-closed; session Read → Write deny without Verdict
- `pre-write-utils-checklist.mdc`

## v0.3.1 → v0.3.2

- `upgrade:utils-reuse` command

## v0.3.0 → v0.3.1

- Bilingual BACKFILL guides

## v0.2.1 → v0.3.0

**KV retrieval** — D1 is `search` / Grep `utils-index.json`; utils-book human-only

## v0.2.0 → v0.2.1

Post-selection proof — hollow Confirm rejected

## v0.1.9 → v0.2.0

Discovery gate for local helpers

## v0.1.8 → v0.1.9

`afterAgentResponse` Verdict tracking

## Upgrade commands

| Command | Action |
|---------|--------|
| `pnpm upgrade:utils-reuse` | Latest package + gate sync |
| `pnpm update:utils-reuse` | Gate-only |
| `upgrade --tag vX.Y.Z` | Pin version |
| `update --accept-upstream` | Take package docs |

What `update` syncs: overwrite-tier rules/hooks; merge-tier docs with hash conflicts.

Post-update: `agent-utils-reuse verify` → OK; `pnpm test:hook-discovery .`
