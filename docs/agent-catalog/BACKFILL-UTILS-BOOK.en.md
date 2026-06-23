# Backfill @utils-book summaries — Agent prompt

[中文版](./BACKFILL-UTILS-BOOK.zh.md)

## When to use this

Use the prompt below (Cursor Agent or manual checklist) when:

- You already have **`src/utils/`** (or `utilsDir` in `.utils-bookrc.json`), but after **`pnpm gen:utils-book`** many symbols show `(无简介 — Confirm 前须 Read 实现)` / no useful summary
- Agent **D1** `agent-utils-reuse search` returns **no hits** for task keywords (especially non-English), yet Grep under utils finds existing helpers
- Legacy utils were never annotated with **`@utils-book`**

**Note**: KV retrieval (`utils-index.json` + search) depends on **`@utils-book` one-line behavior summaries**. Missing summaries mean **insufficient index data**, not a gate bug. Re-run `gen` after backfill.

## Rules (Agent / manual)

1. **`/** ... */` block comment** immediately above each **export** (whitespace only between comment and export). **No** single-line `//`.
2. Prefer: **`@utils-book one-line behavior`** — what the symbol does (inputs/outputs/side effects in one sentence).
3. **Do not** write reuse verdicts, Verdict labels, or ticket-specific scenario text.
4. **No extend**: comments only — **do not** change signatures, implementations, or default semantics.
5. Existing `/** */` without `@utils-book` → add the tag or replace the first line with behavior text.
6. Skip `export { x } from '...'` re-exports unless a separate note is needed.

## After backfill

```bash
pnpm gen:utils-book
# optional smoke test
node node_modules/agent-utils-reuse/bin/cli.mjs search "your keywords" --limit 8
```

## Copy-paste Agent prompt

Paste into a **new** Cursor Agent session (replace `src/utils` with your `utilsDir`):

```markdown
Task: Add @utils-book JSDoc to every export under `src/utils/` that lacks a valid one-line summary.

Rules:
1. Place a `/** ... */` block comment immediately above each export (only blank lines between comment and export). Do not use single-line `//`.
2. Use `@utils-book one-line behavior description` — what the symbol does (inputs/outputs/side effects in one sentence). Do not write reuse/Verdict/ticket-specific scenario text.
3. Do not change any export signature, implementation, or default behavior (No extend).
4. If `/** */` exists but lacks @utils-book, add the tag or replace the first line with behavior text.
5. Skip re-export lines (`export { x } from`) unless a separate note is required.
6. When done, list changed files and symbols.

**Note**: BACKFILL only updates `utilsDir` comments. It does **not** replace Message A (five questions + `Verdict（最终）`) for later **feature** implementation tasks.

First Grep `src/utils` for exports missing block comments or entries whose utils-index summary is the no-summary placeholder. Backfill file by file. Do not Write feature code.
```
