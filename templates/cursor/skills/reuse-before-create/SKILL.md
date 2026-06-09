---
name: reuse-before-create
description: >-
  Use when implementing features that may need shared utils. Shortlist from
  utils-book, Confirm with five questions after reading source, ask user on
  cosmetic diff, then Verdict (reuse, newUtil, featureLocal). Prefer reuse.
  Mandatory gate rule utils-reuse-gate.mdc always applies.
---

# Reuse Before Create — Utils 工具书

**Shortlist → Confirm（五问）→（必要时问用户）→ Verdict → Write**

细则：项目 `AGENTS.md` utils 复用节、`docs/agent-catalog/placement-decision.md` §1、§1.5。

## When to Use

- 实现功能、修 bug、可能用到公共 utils
- 即将 Write utils 目录或在业务代码中 `import` utils
- 编辑 feature/components 但任务涉及上传、解析、格式化、mention 等逻辑

## Step 1 — Shortlist

| 步骤 | 动作 |
|------|------|
| S1 | Read `docs/agent-catalog/utils-book/index.md` |
| S2 | Read **1** 章（选章提示仅作导航，不预设 Verdict） |
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

当 Q1–Q4 通过、Q5=否，但用户可见文案/标签等与拟写不同，且**需求未写明**：

1. **AskQuestion**（或对话中结构化二选一）。
2. **选项 A（reuse）**：写清符号名 + **源码中的实际展示/输出**（事实，非猜测）。
3. **选项 B（定制）**：featureLocal 或 **newUtil**；**不** extend 旧 export。
4. 推荐 A（逻辑已对齐），说明 B 的维护成本。

**可不问**：需求已指定文案；或差异对用户不可见。

## Step 3 — Verdict（Write 前必输出）

在**对话**中输出（**不要**写 `.utils-discovery-cache.json`）：

```markdown
**Discovery**：index + 章 X；候选 `sym` @ path

**Confirm（五问）**
- Q1 … Q5 …

**用户确认（若适用）**
- 差异点：…
- A（与 `sym` 现状一致）：…
- B（定制）：…
- 用户选择：A | B

**Verdict（最终）**：reuse(`sym`) | newUtil | featureLocal
```

## 示例 — 时间 reuse

```
Discovery：_root；候选 formatRelativeTime @ time.ts

Confirm：Q1–Q4 一致，Q5 否

Verdict（最终）：reuse(formatRelativeTime)
```

## 示例 — validate 误 reuse

```
Discovery：validate 相关

Confirm：Q1 要 File，本页要字段规则 → 硬失败

Verdict（最终）：featureLocal
```

## 示例 — 问用户（模板，按当次任务填写）

```
Confirm：Q1–Q4 通过，Q5 否；展示层占位用词与 util 不同，需求未写明

用户确认：
- 差异点：<例如芯片或 plain 占位符用词>
- A reuse — `<symbol>` 现状（Read 源码）：<实际字符串/DOM>
- B 定制：<产品要的文案> → featureLocal 或 newUtil
- 用户选择：A

Verdict（最终）：reuse(<symbol>)  // 若选 B 则按 B 调整
```

## Do Not

- 无五问就 reuse · 展示层 alone 就 fork · extend 旧 export · 从规范抄某业务 Verdict
- 写 `.utils-discovery-cache.json` 或其它 gate cache 文件
