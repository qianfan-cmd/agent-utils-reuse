### Utils Confirm gate (agent-utils-reuse — do not remove)

- **Applies** when editing feature `.vue`/`.ts` with **existing `@/utils` imports or util calls** — **WIP / no new import NOT exempt**.
- **Read util ≠ gate complete.** **Message A** (no Write): Confirm (Q1–Q5) + **`Verdict（最终）`**. **Message B**: Write.
- **Before first business Write**: full Read **`AGENTS.md`** (no limit/offset) → understand task → Identify → Read export(s) → Confirm + Verdict in chat.
- Default **`hookMode: confirm` (v0.1.9)**: deny Write until util files Read **and** prior-chat Verdict recorded.
- Details: `.cursor/rules/utils-reuse-gate.mdc`, `.cursor/rules/workspace-agent-gate.mdc`, `.cursor/rules/project-agent-gate.mdc`.
- **Do not** write `.utils-discovery-cache.json`.
