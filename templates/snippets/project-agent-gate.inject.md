### Utils Confirm gate (agent-utils-reuse — do not remove)

- **Applies** when editing feature `.vue`/`.ts` with **existing `@/utils` imports or util calls** — **WIP / no new import NOT exempt**.
- **Before first business Write**: full Read **`AGENTS.md`** (no limit/offset) → understand task → Identify → Read export(s) → **Confirm (Q1–Q5) + `Verdict（最终）`** in chat (earlier Read/Search OK).
- Default **`hookMode: confirm`**: deny Write until util files Read this session; chat Verdict still required.
- Details: `.cursor/rules/utils-reuse-gate.mdc`, `.cursor/rules/workspace-agent-gate.mdc`, `.cursor/rules/project-agent-gate.mdc`.
- **Do not** write `.utils-discovery-cache.json`.
