# Agent guidelines

<!-- agent-utils-reuse:start -->
### Utils reuse (shared utilities only)

**Scope**: Discovery applies only to your configured utils directory (default `src/utils/`). Hooks and components use **featureLocal** when appropriate.

**Flow**: **Shortlist** (utils-book index → 1 chapter) → **Confirm** (five questions, read source) → **Verdict** → Write.

Details: `docs/agent-catalog/README.md`, `docs/agent-catalog/placement-decision.md` section 1.

#### Reuse philosophy

- Do not re-implement logic that already exists with the same semantics and API contract.
- Single-export import from a larger module is fine.
- Summaries alone are not proof — answer the five Confirm questions after reading source.
- Cosmetic UI copy diff alone does not forbid reuse; if the ticket is silent, **ask the user** (placement section 1.5).
- **No extend**: if you must change an existing export's default semantics → **newUtil** (new symbol), not patch the old one.

#### Five questions (Confirm)

| # | Question |
|---|----------|
| Q1 | Input contract |
| Q2 | Output / persistence / API (**exclude** UI copy) |
| Q3 | Side effects |
| Q4 | Substitution: does `util(x)` match the `f(x)` you would write? |
| Q5 | Must you change the existing export? Yes → **newUtil**; no → prefer **reuse** |

**Before Write**, output **Discovery**, **Confirm**, and **Verdict**.

| Verdict | Meaning |
|---------|---------|
| **reuse** | Five questions pass, Q5 no |
| **newUtil** | Hard failure and shared; or Q5 yes |
| **featureLocal** | Hard failure, page-local only |

After new utils exports → `pnpm gen:utils-book`. Skill: `.cursor/skills/reuse-before-create/SKILL.md`.
<!-- agent-utils-reuse:end -->
