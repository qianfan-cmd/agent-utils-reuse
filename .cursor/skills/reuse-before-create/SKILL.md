---
name: reuse-before-create
description: >-
  Utils reuse Confirm gate — optional procedural guide. Mandatory rules in
  utils-reuse-gate.mdc and AGENTS.md; do not need to Read this file each task.
---

# Reuse Before Create — Confirm gate

**Read AGENTS.md → understand task/business code → Identify → Read export(s) → Confirm（五问）→ Verdict → Write**

Mandatory rules: `.cursor/rules/utils-reuse-gate.mdc`, `AGENTS.md` utils section. This Skill is **optional** detail — Cursor may attach it by description; **no need to Read this file** if rules are followed.

Optional when unsure: Shortlist from utils-book. Optional reference: `placement-decision.md` §1.5.

## When to Use

- Implement / fix features that **import or call** `utilsDir` (default `src/utils/`)
- Plan approved → Implement touching mention/upload/prompt/format/validate utils

## Step 0 — Read AGENTS + understand task

Read `AGENTS.md`. Read / Grep **business code**, spec, **existing imports** so Confirm has context.

## Step 1 — Identify utils (mandatory)

List each util `symbol @ path` you will rely on (plan, import, grep, or Shortlist — source line optional).

## Step 2 — Shortlist (optional)

Only if candidates are unclear:

| 步骤 | 动作 |
|------|------|
| S1 | Read `docs/agent-catalog/utils-book/index.md` |
| S2 | Read **1** chapter |
| S3 | List candidates `name @ path` |

## Step 3 — Read source (mandatory)

**Read** each **export/method you will call** (partial Read / Grep OK; whole file not required).

## Step 4 — Confirm（五问）(mandatory)

Substantive answers per util:

| # | 核对 |
|---|------|
| Q1 | 输入契约 |
| Q2 | 输出/存储/API（**不含**展示层文案） |
| Q3 | 副作用 |
| Q4 | 替换实验：`util(x)` ≡ 本任务拟写 `f(x)`？ |
| Q5 | 须改 util 内部？是 → **newUtil**；否 → 倾向 **reuse** |

## Step 4b — 展示层细小差异（问用户）

Q1–Q4 通过、Q5=否，但用户可见文案不同且需求未写明 → AskQuestion（placement §1.5）。

## Step 5 — Verdict（Write 前必输出，对话内）

Each util: `reuse(sym)` | `newUtil` | `featureLocal`. Compressed format OK if Q1–Q5 are substantive.

**禁止**写 `.utils-discovery-cache.json`。

## Hook confirm mode (optional)

`hookMode: confirm` → may deny Write until util files Read this session. See README.

## Do Not

- Skip Confirm because reuse is obvious · 无实质五问就 reuse · 写 cache JSON · extend 旧 export
