### Utils reuse (shared utilities only)

**Agent single source of truth**: This file (`AGENTS.md`). Read the **full** file before modifying source — **no** `limit`/`offset`. See `.cursor/rules/workspace-agent-gate.mdc`.

**Scope**: Only your configured utils directory (default `src/utils/`). Components/hooks use **featureLocal** when appropriate.

**Mandatory gate** (`.cursor/rules/utils-reuse-gate.mdc`) — **NOT exempt**: existing `@/utils` in file, WIP wiring, no new import, **existing local helpers still in use**.

Before first business Write when gate applies:

1. Read `AGENTS.md` in full
2. Understand task / read business code and existing imports
3. **Discovery (when triggered)**: D1 `agent-utils-reuse search "<keywords>"` or Grep `utils-index.json`, **or** D2 Grep/SemanticSearch `utilsDir`. **Forbidden**: Read/Grep `utils-book/*.md` for Shortlist (v0.3.0)
4. **Identify** each util `symbol @ path` **and** each planned/retained feature helper
5. **Read** each export/method you will call in the **util source file** — partial Read OK; Grep **within that util file** OK; **same-file sibling** exports must be checked
6. **Confirm phase** (chat, before first Write tool — **not thinking-only**):
   - Discovery line (when triggered); D1 zero → `D1 "<kw>": 0 candidates → D2: ...` in chat
   - **Local helpers** (1–2 symbol) or **Bulk compact** (≥3 symbols):

     | Symbol | Read @ path | Q4（替换 + sibling 拒选） | Verdict |

   - **Confirm (五问 per symbol)** — legacy: Q1–Q4 separately; **bulk compact**: one Q4 cell per row (Q1–Q3 implied pass unless Q4 says must change util → newUtil); forbidden: `Q1-Q5 通过`
   - **`Verdict（最终）`** per row — six types below
   - **>5 reuse symbols**: split into batches (≤5 per Confirm + Write)
7. Then Write (**Implement phase** — same assistant response, after Confirm text)

**Read util files does NOT complete the gate** — post-selection proof (Confirm + Verdict) is a separate hard step.

**Cross-feature copy**: Before copying pure functions from another feature component, run Discovery D1/D2. If only in a component, featureLocal OK — **placement debt** + convergence candidate in Message A.

`placement-decision.md` §1.6 judgment tree, §3 Message A format, §1.5 edge cases.

#### Reuse philosophy

- Do not re-implement logic that already exists with the same semantics and storage/API contract.
- Single-export import from a larger module is fine — Read only what you call.
- Summaries alone are not proof — Confirm after **reading called export(s) in util source**, not only call sites in feature files.
- Cosmetic UI copy diff alone does not forbid reuse; if the ticket is silent, **ask the user** (placement §1.5).
- **No extend**: changing an existing export's default semantics → **newUtil**.

#### Confirm (five questions) — mandatory per symbol

For **each** util you will import or call **and each Local helpers table row**, answer in chat:

| # | Question |
|---|----------|
| Q1 | Input contract |
| Q2 | Output / persistence / API (**exclude** UI copy) |
| Q3 | Side effects |
| Q4 | Substitution: does `util(x)` match the `f(x)` you would write? If no utils export, state "no importable reuse object" |
| Q5 | Must you change the existing export? Yes → **newUtil**; no → prefer **reuse** |

**Forbidden**: `Q1-Q5 通过`, `五问通过`, or Verdict without individual Q1–Q4 lines.

**Do NOT** write `.utils-discovery-cache.json` or gate cache files.

| Verdict | Meaning |
|---------|---------|
| **reuse(sym)** | Q1–Q4 pass, Q5 no |
| **partialReuse(sym)+featureLocal(wrapper)** | Util covers core; page wraps types/messages/fields |
| **newUtil(name)** | Hard failure and shared; or Q5 yes |
| **noUtil(sym)** | D1/D2: no shared export for this keyword; not featureLocal |
| **featureLocal(reason)** | Page-local only; strong UI/state coupling |
| **featureLocal+placement debt** | Copied from component; note extraction candidate |

**Plan → Implement**: **`Verdict（最终）`** in chat **before** first business Write/StrReplace (same assistant turn OK). Earlier Read/Search allowed.

**Hook** (default `hookMode: confirm`, v0.3.9): Write deny until AGENTS.md Read + Confirm + Verdict; bulk compact validates Read + Q4 per row. Set `off` for Rules-only.

#### Export JSDoc (utilsDir — mandatory)

When you **add or materially change** an export under utilsDir (default `src/utils/`):

- **`/** ... */` block comment immediately above** each export (generator does not use `//`).
- Prefer **`@utils-book 一句话功能描述`** — behavior only, not reuse Verdict.
- **KV search** uses these summaries in `utils-index.json`. Without them, D1 search has too little data — not a gate bug. Backfill existing exports: `docs/agent-catalog/BACKFILL-UTILS-BOOK.en.md` | `BACKFILL-UTILS-BOOK.zh.md`.
- After **newUtil** / new exports: **`pnpm gen:utils-book`**.

```ts
/** @utils-book 按 key 对对象数组去重，保留首次出现 */
export function uniqueByKey<T>(...) { ... }
```

After new utils exports → `pnpm gen:utils-book`.
