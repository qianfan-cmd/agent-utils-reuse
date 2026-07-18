# Workspace agent gate (mandatory)

Open Cursor at the **project root** (`package.json` + `AGENTS.md`).

## Before modifying source or config

1. **Read `AGENTS.md` in full** — no `limit`/`offset`. 推荐 `"agentsReadMode": "session"`（每 session 一次）。
2. **Understand the task** — Read/Grep business code and existing imports.
3. **When utils gate applies** — follow **[`utils-reuse-gate.md`](utils-reuse-gate.md)**（Identify → Discovery → Read util → Confirm + Verdict → Write，同轮可）。

## Utils detail (SSOT)

**[`.claude/rules/utils-reuse-gate.md`](utils-reuse-gate.md)** · `docs/agent-catalog/placement-decision.md` §1.6

## Hook

默认 **`hookMode: off`**。硬拦 opt-in **`confirm`**；**`remind`** 仅提醒。见 `docs/zh-CN/best-practices.md`。

## Do NOT

- Treat Read util as gate complete
- Write before **`Verdict（最终）`** when gate applies
- Write `.utils-discovery-cache.json`
