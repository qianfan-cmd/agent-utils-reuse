# Utils 按需复用 — Shortlist → Confirm（五问）→ Verdict

> 配套：项目 `AGENTS.md` utils 复用节、`.cursor/skills/reuse-before-create/SKILL.md`

**范围**：仅公共 **utils 目录**（默认 `src/utils/`）。hooks / components / feature 不在 utils-book Shortlist；可 **featureLocal** 自写。

---

## 0. 复用原则（默认宽松）

1. **已实现勿重写** — 同语义、同存储/API 契约的逻辑，禁止在 feature 再抄纯函数实现。
2. **子集 / 单函数 import** — 只 `import` 并调用需要的一个 export 即可。
3. **仅五问硬失败或 Q5=是** 才 **newUtil** / **featureLocal**；展示层用词、类体积 **不能** 单独否决 reuse。
4. **有疑虑但无真不一致** → **偏向 reuse**，禁止 duplicate implementation。

**No extend**：Q5=是 时 → **newUtil** 新符号；**不是**「有一点差异就不 import」。

---

## 1. 可复用证明（架构师标准）

> **在不动已有 export 签名与默认语义的前提下，用该 util 替换 feature 里拟新写的同语义逻辑，业务契约与风险均可接受。**

- 仅凭工具书摘要 → **不构成证明**（只能 Shortlist）。
- 必须 **Read** utils 源码后，用 **五问** 书面 Confirm；**不得**从本文档抄针对某业务的 Verdict。

### 1.1 Confirm 五问

| # | 问题 | 通过标准 |
|---|------|----------|
| **Q1 输入契约** | 类型、必填/可选、空值/非法值语义是否一致？ | 硬失败 → newUtil / featureLocal |
| **Q2 输出与存储/API** | 返回值、持久化串、后端字段含义是否一致？ | **不含** UI 文案、i18n、标签等**展示层** |
| **Q3 副作用** | DOM / storage / API / 全局状态是否可接受？ | 无或调用方可接受 |
| **Q4 替换实验** | 典型 + 边界输入上，`util(x)` ≡ 拟写的 `f(x)`？ | 展示层差异须单列，**alone 不判 newUtil** |
| **Q5 须改 util 内部？** | 是否必须改已有 export 才能满足？ | **是** → **newUtil**；**否** → 倾向 **reuse** |

**充分结论**：Q1–Q4 通过且 Q5=否 → **Verdict: reuse**。

### 1.2 无效 reject 理由

| 误判 | 正确做法 |
|------|----------|
| 展示层文案不同 | Q2 不看展示层 → **reuse** 或 **§1.5 问用户** |
| 类里还有很多 export | 只调一个 → **reuse** |
| 需求是子集 | **reuse** 子集 API |
| util 更大、未走到的分支 | 不算污染 |
| 「组件要瘦」 | 编排 featureLocal；纯函数仍走五问 |

### 1.3 不能证明 reuse

| 类型 | Verdict |
|------|---------|
| **A. 真不一致** | Q1–Q4 硬失败 → **newUtil** 或 **featureLocal** |
| **B. 必须 extend** | Q5=是 → **newUtil** |
| **无 export** | **newUtil** 或暂 **featureLocal** |

### 1.5 细小差异 — 向用户确认

当 Q1–Q4 通过、Q5=否，但**用户可见**展示层差异且需求**未写明**：

- Write 前向用户确认（AskQuestion 或结构化二选一）。
- 选项 A：符号名 + **源码中的实际行为**；选项 B：featureLocal 或 **newUtil**（No extend）。

---

## 2. Shortlist

| 步骤 | 动作 |
|------|------|
| S1 | **只 Read** `utils-book/index.md` |
| S2 | **只 Read 1 章** |
| S3 | 列出候选 `name @ path` |
| S4 | 不确定时 `Grep` utils-book 目录 |

---

## 3. Write 前固定输出

```markdown
**Discovery**：index + 章 X；候选 `sym` @ path

**Confirm（五问）**
- Q1 … Q5 …

**Verdict（最终）**：reuse(`sym`) | newUtil | featureLocal
```

---

## 4. Verdict 三选一

| Verdict | 动作 |
|---------|------|
| **reuse** | `import` 已有 export |
| **newUtil** | 新符号 + `pnpm gen:utils-book` |
| **featureLocal** | 不写/不改公共 utils |

---

## 5. 范式示例（非穷尽）

| 模式 | 典型 Verdict |
|------|--------------|
| 格式化 IO 一致 | **reuse** |
| validate 入参模型不符 | **featureLocal** |
| 须改已有 export | **newUtil** |
| 仅展示层差异未写明 | **问用户** |

---

## 6. 反模式

- 无五问就 reuse · extend 旧 export · 展示层差异时静默 fork · 仅读摘要就判决

---

## 7. 验收 prompt

1. 明显可复用 util → 五问 → **reuse**
2. 入参不符 → **featureLocal**
3. 无 export 要共享 → **newUtil** + regen
4. 改 utils 前无 Discovery+五问 → Hook 应提醒
