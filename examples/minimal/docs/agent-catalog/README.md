# Agent catalog — Utils reuse (runtime docs)

**This directory is for Cursor Agent**, not the human install guide.

Humans: read the package [README.md](../../../README.md) or [README.zh-CN.md](../../../README.zh-CN.md) — especially **Backfill @utils-book** and Quick start.

## Two task types

| Task | Five-question gate? |
|------|---------------------|
| **Feature work** — `@/utils`, views, hooks | **Yes** — single-turn six steps in [`placement-decision.md`](placement-decision.md) §0 |
| **Index maintenance** — BACKFILL, `pnpm gen:utils-book` | **No** — do not Write feature code; see [`BACKFILL-UTILS-BOOK.en.md`](BACKFILL-UTILS-BOOK.en.md) |

```text
Read util / search / gen index ≠ gate complete
Confirm (chat) → Implement (Write) — same assistant turn by default
```

## Files

| Path | Maintained | Purpose |
|------|------------|---------|
| [`utils-index.json`](utils-index.json) | Generated | Agent Discovery D1 — KV index |
| [`utils-book/`](utils-book/) | Generated | Human-only book — **Agent must not Read for Shortlist** |
| [`placement-decision.md`](placement-decision.md) | Package merge | Five questions, Verdict, examples |
| [`MERGE-AGENTS.md`](MERGE-AGENTS.md) | Package merge | How `init` merges `AGENTS.md` |
| [`BACKFILL-UTILS-BOOK.en.md`](BACKFILL-UTILS-BOOK.en.md) | Package merge | Backfill `@utils-book` — Agent prompt (EN) |
| [`BACKFILL-UTILS-BOOK.zh.md`](BACKFILL-UTILS-BOOK.zh.md) | Package merge | 补全 `@utils-book` — Agent 提示词 |
| [`skills.md`](skills.md) | Generated | Agent Skills index |

## Agent workflow (summary)

1. **Discovery** — D1 `search` / Grep `utils-index.json`, or D2 Grep `utilsDir` — see `placement-decision.md` §2
2. **Local helpers** table — one row per planned/retained feature helper
3. **Confirm** — per-symbol Q1–Q4 + Q5; Read util **source** exports
4. **Verdict** — reuse / partialReuse / newUtil / noUtil / featureLocal
5. **Write** — after Confirm in chat (same turn default)

Full rules: [`placement-decision.md`](placement-decision.md), project `AGENTS.md`, `.cursor/rules/utils-reuse-gate.mdc`.

## Commands (project root)

```bash
pnpm gen:utils-book
node node_modules/agent-utils-reuse/bin/cli.mjs search "keywords" --limit 8
```

Human backfill / gen FAQ: [docs/en/backfill-jsdoc.md](../../../docs/en/backfill-jsdoc.md) · [docs/zh-CN/backfill-jsdoc.md](../../../docs/zh-CN/backfill-jsdoc.md)
