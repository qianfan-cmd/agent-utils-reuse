# Agent guidelines

<!-- agent-utils-reuse:start -->
### Utils reuse (shared utilities only)

**Agent single source of truth**: This file (`AGENTS.md`). Read the **full** file before modifying source — **no** `limit`/`offset`. See `.cursor/rules/workspace-agent-gate.mdc`.

**Scope**: Only your configured utils directory (default `src/utils/`). Components/hooks use **featureLocal** when appropriate.

**Mandatory gate** (`.cursor/rules/utils-reuse-gate.mdc`) — **NOT exempt**: existing `@/utils` in file, WIP wiring, no new import.

Before first business Write when gate applies:

1. Read `AGENTS.md` in full
2. Understand task / read business code and existing imports
3. **Identify** each util `symbol @ path`
4. **Read** each export/method you will call (partial Read OK)
5. **Confirm (Q1–Q5) + `Verdict（最终）`** in chat — substantive per util (**Message A, no Write tools**)
6. Then Write (**Message B**)

**Read util files does NOT complete the gate** — Verdict in chat is a separate hard step.

**Optional**: utils-book Shortlist; `placement-decision.md` for §1.5 edge cases.

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

**Before Write**, output **Confirm** and **`Verdict（最终）`** per util.

**Do NOT** write `.utils-discovery-cache.json` or gate cache files.

| Verdict | Meaning |
|---------|---------|
| **reuse** | Five questions pass, Q5 no |
| **newUtil** | Hard failure and shared; or Q5 yes |
| **featureLocal** | Hard failure, page-local only |

**Plan → Implement**: **`Verdict（最终）`** in a **prior assistant message** before first business Write/StrReplace; earlier Read/Search allowed. Do not combine Verdict and first Write in one message.

**Hook** (default `hookMode: confirm`, v0.1.9): deny Write until util files Read **and** prior-chat Verdict recorded.

After new utils exports → `pnpm gen:utils-book`.
<!-- agent-utils-reuse:end -->

### 7. Agent workflow

1. **Understand** the task; read related specs if any.
2. **Design briefly**: where new UI/logic lives; minimal data flow.
<!-- agent-utils-reuse:workflow-inject -->
   - If shared utils may be needed: output **Confirm (Q1-Q5) + Verdict（最终）** in chat before Write (see utils reuse section in AGENTS.md).
3. **Implement** with minimal scope; run typecheck when done.

