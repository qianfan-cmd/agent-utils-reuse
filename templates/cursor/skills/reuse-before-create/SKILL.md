---
name: reuse-before-create
description: >-
  Utils reuse Confirm gate — optional procedural guide. Mandatory rules in
  utils-reuse-gate.mdc and AGENTS.md; do not need to Read this file each task.
---

# Reuse Before Create — Confirm gate

**Read AGENTS.md → understand task → Discovery (when triggered) → Identify → Read export(s) in util source → Confirm（五问）→ Verdict → Write (later message)**

Mandatory rules: `.cursor/rules/utils-reuse-gate.mdc`, `AGENTS.md` utils section. This Skill is **optional** detail — Cursor may attach it by description; **no need to Read this file** if rules are followed.

Reference: `placement-decision.md` §1.5, §2 Discovery, Local helpers table.

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
| **D1** | Read `docs/agent-catalog/utils-book/index.md` → Read **1 chapter** → list candidates |
| **D2** | Grep / SemanticSearch under `utilsDir` (keywords from planned helpers) |

State D1 or D2 in Message A. Hook (v0.2.0) may deny Write of new local helpers without Discovery this session.

## Step 2 — Identify utils (mandatory)

List each util `symbol @ path` you will rely on (plan, import, grep, or Discovery).

## Step 3 — Read source (mandatory)

**Read** each **export/method you will call** in the **util source file** (partial Read / Grep within that file OK). **Do not** treat Read/Grep of another feature's usage as substitute for Read of util source.

**Same-file siblings**: Grep the util file for related exports (e.g. `fileToBase64` when reading `uploadSingleFile` in `imageUploadUtils.ts`).

## Step 4 — Local helpers table (mandatory when triggered)

One row per planned feature helper vs utils candidate. See `placement-decision.md` §3.

## Step 5 — Confirm（五问）(mandatory)

Substantive answers per util:

| # | 核对 |
|---|------|
| Q1 | 输入契约 |
| Q2 | 输出/存储/API（**不含**展示层文案） |
| Q3 | 副作用 |
| Q4 | 替换实验：`util(x)` ≡ 本任务拟写 `f(x)`？ |
| Q5 | 须改 util 内部？是 → **newUtil**；否 → 倾向 **reuse** |

## Step 5b — 展示层细小差异（问用户）

Q1–Q4 通过、Q5=否，但用户可见文案不同且需求未写明 → AskQuestion（placement §1.5）。

## Step 6 — Verdict（Write 前必输出，对话内）

Each util: `reuse(sym)` | `newUtil` | `featureLocal`. Compressed format OK if Q1–Q5 are substantive.

**newUtil**: each new export needs **`/** */`** immediately above (prefer `@utils-book` one-line summary) → `pnpm gen:utils-book`.

**禁止**写 `.utils-discovery-cache.json`。

## Hook confirm mode (v0.2.0)

`hookMode: confirm` → deny Write until util files Read + prior Verdict (when `@/utils`); deny new local helpers without Discovery. See README.

## Do Not

- Skip Discovery when adding local helpers · 无 Local helpers 表 · 无实质五问就 reuse · 写 cache JSON · extend 旧 export · utils 新 export 无 **`/** */`** · 抄组件纯函数未 Grep utils
