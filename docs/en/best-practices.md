# Best practices

[English](best-practices.md) | [简体中文](../zh-CN/best-practices.md)

## Single-turn workflow (default)

| Step | Action |
|------|--------|
| 1 Analyze | Read `AGENTS.md`; read business code + imports |
| 2 Discovery | D1 `search` or Grep `utils-index.json`; zero → D2 Grep `utilsDir` |
| 3 Identify | List `symbol @ path` + planned feature helpers |
| 4 Read | Read **util source exports** you will call; Grep same-file siblings |
| 5 Confirm | Bulk table or per-symbol Q1–Q4 + `Verdict（最终）` in chat |
| 6 Implement | Write / StrReplace **same assistant turn** (default `sameTurnAllow: true`) |

**Read util ≠ gate complete.** Confirm in chat is mandatory.

## hookMode

| Scenario | Setting |
|----------|---------|
| Daily development | `hookMode: off` — Rules enforce Confirm |
| Acceptance / hard gate | `hookMode: confirm`, `sameTurnAllow: true` |
| Split-turn only | `sameTurnAllow: false` |

Before agent tasks with utils reuse:

```bash
pnpm gen:utils-book
agent-utils-reuse status
agent-utils-reuse verify-index
```

v0.3.18: with `confirm`, same-turn Confirm can be read from Cursor `transcript_path` when preToolUse payload lacks assistant text.

## Bulk Confirm (≥3 symbols)

```markdown
| Symbol | Read @ path | Q4（替换 + sibling 拒选） | Verdict |
| UrlUtils | src/utils/url.ts | OK; reject sibling | reuse(UrlUtils.replaceX) |
```

- **Symbol column** = import binding name (`UrlUtils`, not `UrlUtils.method`)
- Q4 must mention sibling `reject` when same-file siblings exist
- **≤5 reuse symbols per turn** — split into multiple Confirm + Write rounds

## Two task types — do not mix

| Task | Five-question gate? |
|------|---------------------|
| Feature work (`@/utils`, views) | **Yes** |
| Index maintenance (BACKFILL, `gen`) | **No** — do not Write feature code |

## Discovery

- D1: `agent-utils-reuse search` or Grep `utils-index.json` — **not** Read `utils-book/*.md`
- D1 zero candidates → mandatory D2 Grep `utilsDir`
- State D1/D2 outcome in Confirm chat

## Verdict types

| Verdict | Meaning |
|---------|---------|
| `reuse(sym)` | Q1–Q4 pass, Q5 no |
| `partialReuse(sym)+featureLocal(wrapper)` | Core in util; page wraps |
| `newUtil(name)` | Must change util or shared new export |
| `noUtil(sym)` | No shared export after D1/D2 |
| `featureLocal(reason)` | Page-only |

## Deny debugging

When Write is denied in `confirm` mode, read `agent_message` JSON: `denyReason`, `missingReads`, `needsConfirm`, `siblingMissing`, `bulkViolations`.

Debug log: `.cursor/.utils-gate-hook-debug.log`

## References

- Agent rules: `docs/agent-catalog/placement-decision.md` (in your project after init)
- Maintainer test rubric: [docs/maintainer/TEST-RUBRIC-WRITING.zh.md](../maintainer/TEST-RUBRIC-WRITING.zh.md)
