### Utils reuse (shared utilities only)

**Agent single source of truth**: This file (`AGENTS.md`). Cursor Rules require reading the **full** file before modifying source — not rule summaries alone. See `.cursor/rules/workspace-agent-gate.mdc`.

**Scope**: Only your configured utils directory (default `src/utils/`). Components/hooks use **featureLocal** when appropriate.

**Mandatory gate**: `.cursor/rules/utils-reuse-gate.mdc` — before first business Write when utils may apply:

1. Read `AGENTS.md`
2. Understand task / read business code and existing imports
3. **Identify** each util `symbol @ path`
4. **Read** each export/method you will call (partial Read OK)
5. **Confirm (Q1–Q5) + Verdict（最终）** in chat — substantive per util
6. Then Write

**WIP obvious reuse is NOT exempt.**

**Optional**: utils-book Shortlist; read `placement-decision.md` or Skill for edge cases (§1.5 ask-user).

#### Reuse philosophy

- Do not re-implement logic that already exists with the same semantics and storage/API contract.
- Single-export import from a larger module is fine — Read only what you call.
- Summaries alone are not proof — Confirm after **reading called export(s)**.
- Cosmetic UI copy diff alone does not forbid reuse; if the ticket is silent, **ask the user** (placement §1.5).
- **No extend**: changing an existing export's default semantics → **newUtil**.

#### Confirm (five questions) — mandatory

For **each** util you will import or call, answer in chat (substantive; compressed OK):

| # | Question |
|---|----------|
| Q1 | Input contract |
| Q2 | Output / persistence / API (**exclude** UI copy) |
| Q3 | Side effects |
| Q4 | Substitution: does `util(x)` match the `f(x)` you would write for **this task**? |
| Q5 | Must you change the existing export? Yes → **newUtil**; no → prefer **reuse** |

**Before Write**, output **Confirm** and **Verdict（最终）** per util. See `placement-decision.md` §3 for a recommended chat format (not mandatory).

**Do NOT** write `.utils-discovery-cache.json` or gate cache files.

| Verdict | Meaning |
|---------|---------|
| **reuse** | Five questions pass, Q5 no |
| **newUtil** | Hard failure and shared; or Q5 yes |
| **featureLocal** | Hard failure, page-local only |

**Plan → Implement**: Verdict must appear **before the first business Write/StrReplace**; earlier Read/Search messages are allowed.

**Hook** (default `hookMode: remind`): reminder on Write. Optional `confirm` mode — see package README.

After new utils exports → `pnpm gen:utils-book`.
