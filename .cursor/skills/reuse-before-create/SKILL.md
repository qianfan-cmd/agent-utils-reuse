---
name: reuse-before-create
description: >-
  Utils reuse Confirm gate — optional procedural guide. Mandatory rules in
  utils-reuse-gate.mdc and AGENTS.md; do not need to Read this file each task.
---

# Reuse Before Create — Confirm gate

**Read AGENTS.md → understand task → Identify → Read util source → Confirm（五问 per symbol）→ Verdict → Write (later message)**

Mandatory rules: `.cursor/rules/utils-reuse-gate.mdc`, `AGENTS.md` utils section. This Skill is **optional** detail — Cursor may attach it by description; **no need to Read this file** if rules are followed.

Reference: `placement-decision.md` §1.6 post-selection proof, §3 Confirm phase, §1.5 edge cases.

## When to Use

- Implement / fix features that **import or call** `utilsDir` (default `src/utils/`)
- Plan approved → Implement touching mention/upload/prompt/format/validate utils
- Adding **local pure helpers** in feature code (FileReader, dataUrl, validate, etc.)

## Step 0 — Read AGENTS + understand task

Read `AGENTS.md`. Read / Grep **business code**, spec, **existing imports** so Confirm has context.

## Step 1 — Discovery (mandatory when triggered)

**Trigger**: gate applies **or** adding/rewriting local pure helpers in feature.

| 代号 | 动作 |
|------|------|
| **D1** | **Preferred**: `agent-utils-reuse search "<keywords>" --limit 8` — **or** Grep `docs/agent-catalog/utils-index.json` → list candidates |
| **D2** | Grep / SemanticSearch under `utilsDir` (keywords from planned helpers) |

**Forbidden for Shortlist**: Read/Grep `utils-book/*.md` (human-only, v0.3.0).

State D1 or D2 in Confirm phase. Hook may deny Write of new local helpers without Discovery this session.

## Step 2 — Identify (mandatory)

List each util `symbol @ path` **and** each planned/**retained** feature helper.

## Step 3 — Read source (mandatory)

**Read** each **export/method you will call** in the **util source file** (partial Read / Grep within that file OK). **Do not** treat Read/Grep of another feature's usage as substitute for Read of util source.

**Same-file siblings**: Grep the util file for related exports (e.g. `fileToBase64` when reading `uploadSingleFile` in `imageUploadUtils.ts`).

For component-only candidates: Read component + Grep utilsDir before Verdict.

## Step 4 — Local helpers table (mandatory when triggered)

One row per planned/**retained** feature helper vs utils/component candidate. See `placement-decision.md` §3. Hook requires table header + at least one data row when adding helpers.

## Step 5 — Confirm（五问）(mandatory per symbol)

**Each util + each Local helpers row** — Q1, Q2, Q3, Q4 must appear **separately**. Forbidden: `Q1-Q5 通过`.

| # | 核对 |
|---|------|
| Q1 | 输入契约 |
| Q2 | 输出/存储/API（**不含**展示层文案） |
| Q3 | 副作用 |
| Q4 | 替换实验：`util(x)` ≡ 拟写 `f(x)`？无 export → 写明无可 import reuse 对象 |
| Q5 | 须改 util 内部？是 → **newUtil**；否 → 倾向 **reuse** |

## Step 5b — 展示层细小差异（问用户）

Q1–Q4 通过、Q5=否，但用户可见文案不同且需求未写明 → AskQuestion（placement §1.5）。

## Step 6 — Verdict（Write 前必输出，对话内）

Per row:

- `reuse(sym)`
- `partialReuse(sym)+featureLocal(wrapper)`
- `newUtil(name)`
- `featureLocal(reason)`
- `featureLocal+placement debt(ref→candidate)`

**newUtil**: each new export needs **`/** */`** immediately above (prefer `@utils-book`) → `pnpm gen:utils-book`.

**禁止**写 `.utils-discovery-cache.json`。

## Hook confirm mode (v0.2.1)

Default **`hookMode: off`** — Rules only. Opt-in **`hookMode: confirm`** → deny Write until Read + Verdict + Discovery + Local helpers table. See README.

## Do Not

- Skip Discovery when adding local helpers · 无 Local helpers 表 · 空泛五问 · 写 cache JSON · extend 旧 export · utils 新 export 无 **`/** */`** · 抄组件纯函数未标 placement debt · 跳过文件中已有 helper 的重 Confirm
