### Utils Confirm gate (agent-utils-reuse — do not remove)

- **Applies** when editing feature `.vue`/`.ts` with **existing `@/utils` imports or util calls** — **WIP / no new import NOT exempt**.
- **Read util ≠ gate complete.** **Confirm phase**: Discovery (when triggered) + **Local helpers** table + **Confirm (Q1–Q4 per symbol, separately)** + **`Verdict（最终）`**. **Implement phase**: Write (same assistant response).
- **Before first business Write**: full Read **`AGENTS.md`** (no limit/offset) → understand task → Identify → Read export(s) **in util source** → Confirm + Verdict in chat (**Confirm phase**, no Write).
- **Implement phase**: Write in a **later message** than Verdict.
- Default **`hookMode: off` (v0.3.6)**: Rules-only Confirm + Verdict; opt-in **`hookMode: confirm`** for hard deny.
- Details: `.cursor/rules/utils-reuse-gate.mdc`, `.cursor/rules/workspace-agent-gate.mdc`, `.cursor/rules/project-agent-gate.mdc`.
- **Do not** write `.utils-discovery-cache.json`.
