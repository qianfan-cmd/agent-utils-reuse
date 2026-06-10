### Utils reuse (shared utilities only)

**Agent single source of truth**: This file (`AGENTS.md`). Cursor Rules require reading the **full** file before modifying source — not rule summaries alone. See `.cursor/rules/workspace-agent-gate.mdc`.

**Scope**: Only your configured utils directory (default `src/utils/`). Components/hooks use **featureLocal** when appropriate.

**Mandatory gate**: `.cursor/rules/utils-reuse-gate.mdc` — **Confirm (Q1–Q5) + Verdict（最终） in chat** before first business Write when utils logic may apply. **WIP obvious reuse is NOT exempt.**

**Optional**: Shortlist via `docs/agent-catalog/utils-book/index.md` + one chapter when unsure which util.

**Flow**: Identify utils → **Read util source** → **Confirm + Verdict in chat** → Write.

Details: `docs/agent-catalog/placement-decision.md` §1, §3.

#### Reuse philosophy

- Do not re-implement logic that already exists with the same semantics and storage/API contract.
- Single-export import from a larger module is fine.
- Summaries alone are not proof — answer Confirm after **reading util source**.
- Cosmetic UI copy diff alone does not forbid reuse; if the ticket is silent, **ask the user** (placement §1.5).
- **No extend**: changing an existing export's default semantics → **newUtil**.

#### Confirm (five questions) — mandatory

For **each** util you will import or call, **Read** its source file, then answer in chat:

| # | Question |
|---|----------|
| Q1 | Input contract |
| Q2 | Output / persistence / API (**exclude** UI copy) |
| Q3 | Side effects |
| Q4 | Substitution: does `util(x)` match the `f(x)` you would write? |
| Q5 | Must you change the existing export? Yes → **newUtil**; no → prefer **reuse** |

**Before Write**, output **Confirm** and **Verdict（最终）** — template in `placement-decision.md` §3.

**Do NOT** write `.utils-discovery-cache.json` or gate cache files.

| Verdict | Meaning |
|---------|---------|
| **reuse** | Five questions pass, Q5 no |
| **newUtil** | Hard failure and shared; or Q5 yes |
| **featureLocal** | Hard failure, page-local only |

**Plan → Implement**: First Implement assistant message must include Verdict when the plan touches `@/utils`.

**Hook** (default `hookMode: remind` in `.utils-bookrc.json`): Write shows a reminder on utils / app paths. Optional `confirm` mode may deny until util sources were Read — see package README.

After new utils exports → `pnpm gen:utils-book`. Skill: `.cursor/skills/reuse-before-create/SKILL.md`.
