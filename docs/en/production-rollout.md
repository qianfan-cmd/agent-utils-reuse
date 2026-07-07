# Production rollout and acceptance

[English](./production-rollout.md) | [简体中文](../zh-CN/production-rollout.md) | [Configuration](configuration.md)

Run at the **business project root** (directory with `package.json`).

## Day-to-day rollout

1. `pnpm add -D github:qianfan-cmd/agent-utils-reuse#v0.3.23` (or npm / `file:` local path)
2. `node node_modules/agent-utils-reuse/bin/cli.mjs init --force`
3. `pnpm gen:utils-book`
4. Backfill `@utils-book` on legacy exports ([backfill.md](backfill.md))
5. Optional CI: `pnpm check:utils-book`
6. Periodic `pnpm upgrade:utils-reuse`

Default **`hookMode: off`**: Rules require Confirm; **no** Write deny. Teams can stay on `off` until the flow is familiar, then enable `confirm`.

## Acceptance mode

Use this to verify the Agent **actually** outputs Confirm in chat (e.g. multi-symbol test pages in ai-web). Under **`off`**, skipping Confirm still allows Write — compliance tests **must** use the confirm profile below.

### 1. Enable compliance profile

Merge fields from [`docs/agent-catalog/.utils-bookrc.compliance.json`](../agent-catalog/.utils-bookrc.compliance.json) into project-root `.utils-bookrc.json` (keep your `utilsDir`, `remindWritePaths`, etc.), then:

```bash
pnpm update:utils-reuse --yes
# or node node_modules/agent-utils-reuse/bin/cli.mjs init --force
```

Confirm `.cursor/hooks.json` is **non-empty** (`sessionStart`, `postToolUse`, `preToolUse`, `afterAgentResponse`).

### 2. Fresh session and prerequisites

1. Start a **new** Cursor Agent session (`sessionStart` resets audit)
2. **Read** full `AGENTS.md` with the Read tool (**no** `limit`/`offset`)
3. Task prompt must state: **Confirm text before first Write in chat** — exploration (Grep/Read) ≠ Confirm

### 3. Post-stress verification

From the **agent-utils-reuse** repo:

```bash
pnpm test:hooks /path/to/your-project-root
```

In the consumer project: `node node_modules/agent-utils-reuse/bin/cli.mjs status`, `verify-index`.

On deny, read `.cursor/.utils-gate-hook-debug.log` for `denyReason`, `needsConfirm`, `missingReads`.

### 4. Seven-symbol test page (5+2 batching)

For heavy tasks (e.g. canvas upload test page):

| Turn | Confirm (chat, before Write) | Write |
|------|------------------------------|-------|
| **1** | D1 or `D1.5: Grep <feature> → sym @ path` + Bulk table **≤5** util rows; Local helpers (or exempt via `lightGatePaths`) | First 5 import blocks in `test.vue` |
| **2** | **Delta Confirm**: remaining symbol rows + `Gate N/A — <ui-only block>` | Remaining imports / wiring |

With `strictBatchLimit: true`, 7 imports in one turn without full Verdict → **`batch_limit_exceeded`**.

Rubric: [TEST-RUBRIC-WRITING.zh.md](../maintainer/TEST-RUBRIC-WRITING.zh.md) §8-symbol batch template.

### 5. Common deny reasons

| denyReason | Meaning | Fix |
|------------|---------|-----|
| `verdict_not_recorded` | Grep/Read done, no Confirm in chat | Output Bulk table + `Verdict（最终）` in same turn before Write |
| `d1_outcome_missing` | Discovery in session, no D1 line in chat | Add `D1 "kw": N → [sym @ path]` or D1.5 line |
| `batch_limit_exceeded` | >5 imports in one turn | Split 5+2 |
| `missing_reads` | Util source not Read | Read exports, then Confirm |
| `missing_agents_read` | AGENTS not Read in full | Read full AGENTS.md |

## Hook smoke (maintainers / CI)

```bash
pnpm test:hooks [projectRoot]
pnpm test:hook-discovery [projectRoot]
pnpm test:verdict-substance
```

## References

- [configuration.md](configuration.md) — compliance fields
- [placement-decision.md](../agent-catalog/placement-decision.md) §3 — Confirm format and heavy-task playbook
- [best-practices.md](best-practices.md)
