---
name: reuse-before-create
description: >-
  Use when implementing features that may need shared utils. Shortlist from
  utils-book, Confirm with five questions after reading source, ask user on
  cosmetic diff, then Verdict (reuse, newUtil, featureLocal). Prefer reuse.
---

# Reuse Before Create — Utils 工具书

**Shortlist → Confirm（五问）→（必要时问用户）→ Verdict → Write**

细则：项目 `AGENTS.md` utils 复用节、`docs/agent-catalog/placement-decision.md` §1、§1.5。

## When to Use

- 实现功能、修 bug、可能用到公共 utils
- 即将 Write utils 目录或在业务代码中 `import` utils

## Step 1 — Shortlist

| 步骤 | 动作 |
|------|------|
| S1 | Read `docs/agent-catalog/utils-book/index.md` |
| S2 | Read **1** 章 |
| S3 | 列出候选 `name @ path` |
| S4 | 不确定 → `Grep docs/agent-catalog/utils-book/` |

**禁止**：此处写最终 `Verdict: reuse`。

## Step 2 — Confirm（五问）

对每个候选 Read utils 源码：

| # | 核对 |
|---|------|
| Q1 | 输入契约 |
| Q2 | 输出/存储/API（**不含**展示层文案） |
| Q3 | 副作用 |
| Q4 | 替换实验：`util(x)` ≡ 拟写 `f(x)`？ |
| Q5 | 须改 util 内部？是 → **newUtil**；否 → 倾向 **reuse** |

## Step 2b — 展示层细小差异（问用户）

当 Q1–Q4 通过、Q5=否，但用户可见文案与拟写不同，且**需求未写明**：

1. **AskQuestion**（或结构化二选一）。
2. **选项 A（reuse）**：符号名 + **源码中的实际行为**。
3. **选项 B（定制）**：featureLocal 或 **newUtil**；**不** extend 旧 export。

## Step 3 — Verdict（Write 前必输出）

```markdown
**Discovery**：index + 章 X；候选 `sym` @ path

**Confirm（五问）**
- Q1 … Q5 …

**Verdict（最终）**：reuse(`sym`) | newUtil | featureLocal
```

## Do Not

- 无五问就 reuse · 展示层 alone 就 fork · extend 旧 export · 从规范抄某业务 Verdict
