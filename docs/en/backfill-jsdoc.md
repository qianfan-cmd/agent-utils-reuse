# Backfill @utils-book JSDoc

[English](backfill-jsdoc.md) | [简体中文](../zh-CN/backfill-jsdoc.md) | [README § Step 4](../../README.md#4-backfill-utils-book-on-existing-exports-recommended)

Canonical Agent prompts (synced to consumer projects on init):

- `docs/agent-catalog/BACKFILL-UTILS-BOOK.en.md`
- `docs/agent-catalog/BACKFILL-UTILS-BOOK.zh.md`

## When to backfill

- After `pnpm gen:utils-book`, many symbols show `(无简介 — Confirm 前须 Read 实现)`
- `agent-utils-reuse search` returns no hits for task keywords, but Grep under `utilsDir` finds helpers
- Legacy utils never had `@utils-book`

Missing summaries mean **insufficient index data**, not a gate bug. Re-run `gen` after backfill.

## Standard flow

```text
1. Add JSDoc (manual or Agent prompt below)
      ↓
2. pnpm gen:utils-book  (at project root)
      ↓
3. Smoke test: search with business keywords
      ↓
4. git commit utils-index.json + utils-book/
```

Example:

```ts
/** @utils-book Copy text to system clipboard */
export function copyToClip(text: string) { ... }
```

- Block comment `/** */` immediately above `export` (whitespace only between)
- Single-line `//` is **not** scanned
- **No extend** — comments only, do not change signatures or behavior

## Copy-paste Agent prompt

See [README](../../README.md#4-backfill-utils-book-on-existing-exports-recommended) for the embedded prompt, or use [BACKFILL-UTILS-BOOK.en.md](../../docs/agent-catalog/BACKFILL-UTILS-BOOK.en.md).

After backfill:

```bash
pnpm gen:utils-book
node node_modules/agent-utils-reuse/bin/cli.mjs search "clipboard copy" --limit 8
```

## Verify index

Check `utils-index.json` `stats`:

| Field | Meaning |
|-------|---------|
| `withSummary` | Exports with any block-comment summary |
| `symbols` | Total indexed symbols |

Terminal `JSDoc coverage: X/Y` is `withSummary / symbols` — not search quality.

### Three kinds of “empty”

| What you see | Where | Fix |
|--------------|-------|-----|
| `(无简介 — Confirm 前须 Read 实现)` | `utils-index.json` summary | Add `@utils-book` on export, re-`gen` |
| `re-export from './time'` | barrel `index.ts` | Add comment above re-export or ignore |
| `utils root — foo` in utils-book | file-level fallback | Optional file-level `@utils-book` |

### Weak summary self-check

```bash
node -e "
const j=require('./docs/agent-catalog/utils-index.json');
const weak=[];
for (const [k,arr] of Object.entries(j.symbols)) {
  for (const e of arr) {
    if (!e.summary || e.summary.includes('无简介') || e.summary.startsWith('re-export'))
      weak.push(k + ' @ ' + e.path);
  }
}
console.log('weak:', weak.length); weak.forEach(w => console.log(' -', w));
"
```

## FAQ

| Symptom | Cause | Fix |
|---------|-------|-----|
| `gen` but summary still 无简介 | Not block comment / not above export | BACKFILL rules, re-`gen` |
| 99% coverage but re-export weak | barrel re-exports excluded from coverage | Accept or annotate re-export |
| `gen` in wrong directory | Not project root | `cd` to root with `package.json` |
| Chinese search 0 hits | No Chinese in `@utils-book` line | Add business terms, re-`gen` |
| Hand-edited index overwritten | Expected — index is generated | Edit `src/utils` only |

Optional CI: `pnpm check:utils-book`

## New exports

Every new export under `utilsDir` needs `/** */` above it. After **newUtil**, run `pnpm gen:utils-book`.

BACKFILL does **not** replace the five-question Confirm gate for feature implementation tasks.
