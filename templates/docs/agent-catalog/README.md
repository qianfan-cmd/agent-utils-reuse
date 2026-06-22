# Agent 能力目录 — Utils 检索与复用

本目录帮助 Cursor Agent **在公共 utils 目录中按需复用工具函数**：先 **KV 检索（search / Grep index）**，再 **Confirm（五问）**，必要时 **问用户**（展示层细小差异），最后 Verdict。

**强制总闸（v0.3.0）**：`utils-reuse-gate.mdc` — **选中后证明**（§1.6）：每个 util + Local helpers 行须 **分项 Q1–Q4** + Verdict；禁止空泛「Q1–Q5 通过」。`hookMode: confirm` 时：未 Read util 源码会 **deny** Write（有 `@/utils`）；新增本地 helper 未 Discovery / 无 Local helpers 表 / 空泛五问 会 **deny** Write。

## 文件说明

| 路径 | 维护 | 用途 |
|------|------|------|
| [`utils-index.json`](utils-index.json) | **脚本生成** | **Agent Discovery D1** — KV 符号索引 + 摘要 |
| [`utils-book/index.md`](utils-book/index.md) | **脚本生成** | **人类只读** — 目录与章链接（Agent **禁止** Read 做 Shortlist） |
| [`utils-book/{章}.md`](utils-book/) | **脚本生成** | **人类只读** — 章内符号表 |
| [`placement-decision.md`](placement-decision.md) | **手写** | 可复用证明（五问）、问用户、范式示例 |
| [`MERGE-AGENTS.md`](MERGE-AGENTS.md) | **手写** | `init` 如何自动处理 `AGENTS.md` |
| [`skills.md`](skills.md) | **脚本生成** | 项目 Agent Skills 索引 |

## 工作流

1. **Discovery（D1 search / Grep `utils-index.json`，或 D2 Grep `utilsDir`）** — 触发时必做；见 [`placement-decision.md`](placement-decision.md) §2
2. **Local helpers 对照表** — 每个拟写/保留 feature helper 一行（Message A；Hook 检测表头+数据行）
3. **Confirm（五问 per symbol）**：分项 Q1–Q4 + Q5；Read utils 源码；**不得**从文档抄 Verdict
4. 逻辑可 reuse、仅展示层差异且需求未写明 → **问用户**（placement §1.5）
5. 输出 **Discovery + Confirm + Verdict**（reuse / partialReuse+wrapper / newUtil / featureLocal / featureLocal+placement debt）
6. **newUtil** 后 **`pnpm gen:utils-book`**

细则：[`placement-decision.md`](placement-decision.md)、项目 `AGENTS.md` 中的 utils 复用节。

## 生成与检索命令

```bash
pnpm gen:utils-book          # 生成 utils-index.json + utils-book/*.md
agent-utils-reuse search "数组 排序" --limit 8   # Agent D1 首选
pnpm check:utils-book        # 可选 CI 门禁
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

无摘要时 index 中 summary 为 `(无简介 — Confirm 前须 Read 实现)`，search 质量下降。
