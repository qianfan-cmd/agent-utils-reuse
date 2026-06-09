### Utils reuse (shared utilities only)

**Scope**: Discovery applies only to your configured utils directory (default `src/utils/`). Hooks and components use **featureLocal** when appropriate.

**Mandatory gate**: `.cursor/rules/utils-reuse-gate.mdc` (alwaysApply) — Read AGENTS + placement + utils-book before first business Write when utils logic may apply.

**Flow**: **Shortlist** (utils-book index → 1 chapter) → **Confirm** (five questions, read source) → **Verdict** → Write.

Details: `docs/agent-catalog/README.md`, `docs/agent-catalog/placement-decision.md` section 1.

#### Reuse philosophy

- Do not re-implement logic that already exists with the same semantics and storage/API contract.
- Single-export import from a larger module is fine.
- Summaries alone are not proof — answer the five Confirm questions after reading source.
- Cosmetic UI copy diff alone does not forbid reuse; if the ticket is silent, **ask the user** (placement section 1.5).
- If unsure after reading source but Q1–Q4 have no hard failure and Q5 is **no**, **prefer reuse** over duplicating logic in feature code.
- **No extend**: if you must change an existing export's default semantics → **newUtil** (new symbol), not patch the old one.

**Anti-patterns** (invalid reject reasons): label-only diff, "class has other methods", subset need, "lean component" — see `placement-decision.md` §1.2 and §6.

#### Shortlist (utils-book)

When the task may need a util:

1. **Read only** `docs/agent-catalog/utils-book/index.md`.
2. **Read only one relevant chapter**. Do not Read every chapter. If unsure, `Grep docs/agent-catalog/utils-book/`.
3. List **candidates** (`name @ path`).
4. Do not write a final **Verdict: reuse** from summaries alone.

For duplicate symbol names, see the index appendix.

#### Confirm (five questions)

For each candidate, **Read** utils source. Answer:

| # | Question |
|---|----------|
| Q1 | Input contract |
| Q2 | Output / persistence / API (**exclude** UI copy) |
| Q3 | Side effects |
| Q4 | Substitution: does `util(x)` match the `f(x)` you would write? |
| Q5 | Must you change the existing export? Yes → **newUtil**; no → prefer **reuse** |

**Before Write**, output **Discovery**, **Confirm**, and **Verdict** **in chat** — template in `placement-decision.md` §3.

**Do NOT** write `.utils-discovery-cache.json` or other cache files.

| Verdict | Meaning |
|---------|---------|
| **reuse** | Five questions pass, Q5 no |
| **newUtil** | Hard failure and shared; or Q5 yes |
| **featureLocal** | Hard failure, page-local only |

**Forbidden**: reuse without Confirm; duplicate implementation when reuse is proven; silent fork on cosmetic diff.

#### Cosmetic diff (ask user)

When Q1–Q4 pass and Q5 is no, but user-visible copy differs and the requirement is silent: ask before Write (placement §1.5).

After new utils exports → `pnpm gen:utils-book`. Skill: `.cursor/skills/reuse-before-create/SKILL.md`.
