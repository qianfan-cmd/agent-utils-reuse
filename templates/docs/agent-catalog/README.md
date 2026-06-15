# Agent 能力目录 — Utils 工具书

本目录帮助 Cursor Agent **在公共 utils 目录中按需复用工具函数**：先 Shortlist（index → 1 章），再 **Confirm（五问）**，必要时 **问用户**（展示层细小差异），最后 Verdict。

**强制总闸（v0.2.0）**：`utils-reuse-gate.mdc` — **Discovery（§2）** 在门禁适用或拟写 feature 本地 helper 时必做；**Confirm（五问）+ Verdict** 不可跳过；Message A 须含 **Local helpers** 对照表。`hookMode: confirm` 时：未 Read util 源码会 **deny** Write（有 `@/utils`）；新增本地 helper 未 Discovery 会 **deny** Write。

## 文件说明

| 路径 | 维护 | 用途 |
|------|------|------|
| [`utils-book/index.md`](utils-book/index.md) | **脚本生成** | 全书目录、章链接、同名符号附录 |
| [`utils-book/{章}.md`](utils-book/) | **脚本生成** | 每章：文件用途 + 符号一行摘要 + 行号 |
| [`placement-decision.md`](placement-decision.md) | **手写** | 可复用证明（五问）、问用户、范式示例 |
| [`MERGE-AGENTS.md`](MERGE-AGENTS.md) | **手写** | `init` 如何自动处理 `AGENTS.md` |
| [`skills.md`](skills.md) | **脚本生成** | 项目 Agent Skills 索引 |

## 工作流

1. **Discovery（D1 index → 1 章，或 D2 Grep `utilsDir`）** — 触发时必做；见 [`placement-decision.md`](placement-decision.md) §2
2. **Local helpers 对照表** — 每个拟写 feature helper 一行（Message A）
3. **Confirm（五问）**：Read utils 源码；**不得**从文档抄 Verdict
4. 逻辑可 reuse、仅展示层差异且需求未写明 → **问用户**（placement §1.5）
5. 输出 **Discovery + Confirm + Verdict**（reuse / newUtil / featureLocal）
6. **newUtil** 后 **`pnpm gen:utils-book`**

细则：[`placement-decision.md`](placement-decision.md)、项目 `AGENTS.md` 中的 utils 复用节。

## 生成命令

```bash
pnpm gen:utils-book
pnpm check:utils-book   # 可选 CI 门禁
```

## 提高摘要质量（新建 export 必填）

在 **`src/utils/`**（或 `.utils-bookrc.json` 中的 `utilsDir`）里，**每个 export 上方必须有**块注释 `/** ... */`（紧贴 export，中间仅空行）。**推荐**：

```ts
/** @utils-book 本符号做什么（一句话） */
export function myUtil(...) { ... }
```

- 只写功能，不写 reuse 判决或业务场景绑定。
- 不用单行 `//` 代替（生成器不读）。
- **newUtil** 或新增 export 后执行 **`pnpm gen:utils-book`**。

无摘要时 utils-book 显示 `(无简介 — Confirm 前须 Read 实现)`，Shortlist 质量下降。
