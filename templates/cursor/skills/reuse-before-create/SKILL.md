---
name: reuse-before-create
description: >-
  Mandatory Confirm gate before Write when using shared utils. Read util source,
  output five questions + Verdict in chat. Shortlist from utils-book optional.
  hookMode confirm denies Write until util source Read. No cache JSON files.
---

# Reuse Before Create — Confirm gate

**Identify → Read util source → Confirm（五问）→ Verdict → Write**

Optional when unsure: Shortlist from utils-book. Mandatory: **Confirm + Verdict in chat**.

细则：`AGENTS.md` utils 节、`placement-decision.md` §1、§3、`.cursor/rules/utils-reuse-gate.mdc`。

## When to Use

- Implement / fix features that **import or call** `utilsDir` (default `src/utils/`)
- Plan approved → Implement touching mention/upload/prompt/format/validate utils

## Step 0 — Identify utils (mandatory)

List each util file/symbol you will rely on (including **existing** imports in WIP — not exempt).

## Step 1 — Shortlist (optional)

Only if candidates are unclear:

| 步骤 | 动作 |
|------|------|
| S1 | Read `docs/agent-catalog/utils-book/index.md` |
| S2 | Read **1** chapter |
| S3 | List candidates `name @ path` |

## Step 2 — Confirm（五问）(mandatory)

**Read** each util source under `utilsDir`:

| # | 核对 |
|---|------|
| Q1 | 输入契约 |
| Q2 | 输出/存储/API（**不含**展示层文案） |
| Q3 | 副作用 |
| Q4 | 替换实验：`util(x)` ≡ 拟写 `f(x)`？ |
| Q5 | 须改 util 内部？是 → **newUtil**；否 → 倾向 **reuse** |

## Step 2b — 展示层细小差异（问用户）

Q1–Q4 通过、Q5=否，但用户可见文案不同且需求未写明 → AskQuestion（§1.5）。

## Step 3 — Verdict（Write 前必输出，对话内）

```markdown
**Confirm（五问）**
- Q1 … Q5 …（每个 util）

**Verdict（最终）**：reuse(`sym`) | newUtil | featureLocal
```

**禁止**写 `.utils-discovery-cache.json`。

## Hook confirm mode

`hookMode: confirm` → Write denied until util sources **Read** this session. Read source, output Confirm+Verdict, then Write again.

## Do Not

- Skip Confirm because reuse is obvious · 无五问就 reuse · 写 cache JSON · extend 旧 export
