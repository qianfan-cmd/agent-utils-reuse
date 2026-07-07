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

## AGENTS.md: once per session

Recommended in `.utils-bookrc.json`:

```json
{ "agentsReadMode": "session" }
```

- **`session`**: sessionStart counts as AGENTS read (with alwaysApply Rules)
- **`tool`** (default): full Read **each task** (no `limit`/`offset`)

## hookMode tiers

| Mode | Write deny | When |
|------|------------|------|
| **`off`** (default) | No | Daily dev — Rules enforce Confirm |
| **`remind`** | No | Allow + reminder in `agent_message`; track violations |
| **`confirm`** | Yes | Acceptance / PR self-check — Discovery, batch, sibling hard gate |

Before tasks with `confirm`:

```bash
pnpm gen:utils-book
agent-utils-reuse status
agent-utils-reuse search "mention"
```

**Default stays `off`** — opt in to `confirm` when you need hard deny.

## sameTurnAllow and audit

| Setting | Behavior |
|---------|----------|
| `true` (default) | Same turn requires **detectable** Confirm in chat + session util Read |
| `false` | No eager same-turn Confirm; split turns or payload/transcript evidence |

Hooks audit **user-visible chat + session Read only**, not thinking. v0.3.18: `confirm` can read same-turn Confirm from `transcript_path`.

## Layered gate (v0.3.22)

| Layer | When |
|-------|------|
| uiOnly | template/style only, no script util delta |
| delta new import | patch adds binding |
| delta newCall | existing import, first `Binding.method` in patch |
| sameSymbol | already Confirmed, params/copy only |

See `placement-decision.md` §1.6.1.

## Discovery / Confirm fixed format

```
D1 "upload": 3 → [uploadSingleFile @ src/utils/upload.ts, …]
D1 "kw": 0 → D2 path:src/utils "kw"
D2 path:src/utils "kw": N → [sym @ path, …]
```

Bulk Q4: `<chosen> OK; reject <sibling> (<reason>)` or `<chosen> OK; no sibling`.

## Bulk Confirm (≥3 symbols)

```markdown
| Symbol | Read @ path | Q4（替换 + sibling 拒选） | Verdict |
| UrlUtils | src/utils/url.ts | OK; reject sibling (reason) | reuse(UrlUtils) |
```

- **Symbol column** = import binding (`UrlUtils`; newCall use `UrlUtils.method`)
- Q4 must include `reject <sibling>` or `no sibling`
- **≤5 reuse symbols per turn** — split rounds

## Two task types

| Task | Five-question gate? |
|------|---------------------|
| Feature work (`@/utils`, views) | **Yes** |
| Index maintenance (BACKFILL, `gen`) | **No** |

## Deny debugging

Read `agent_message`: `denyReason`, `missingReads`, `needsConfirm`, `siblingMissing`.

Debug log: `.cursor/.utils-gate-hook-debug.log`

## References

- SSOT: `.cursor/rules/utils-reuse-gate.mdc`
- `docs/agent-catalog/placement-decision.md`
- [TEST-RUBRIC-WRITING.zh.md](../maintainer/TEST-RUBRIC-WRITING.zh.md)
