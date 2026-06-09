# Agent 能力目录 — Utils 工具书

本目录帮助 Cursor Agent **在公共 utils 目录中按需复用工具函数**：先 Shortlist（index → 1 章），再 **Confirm（五问）**，必要时 **问用户**（展示层细小差异），最后 Verdict。

**强制总闸**：`pnpm agent-utils-reuse init` 会安装 **`.cursor/rules/utils-reuse-gate.mdc`**（alwaysApply）。Agent 在可能涉及 utils 逻辑的任务上，须 Read 本目录 + 输出 Discovery/Confirm/Verdict **于对话中**（不写 cache JSON），再 Write 业务代码。

## 文件说明

| 路径 | 维护 | 用途 |
|------|------|------|
| [`utils-book/index.md`](utils-book/index.md) | **脚本生成** | 全书目录、章链接、同名符号附录 |
| [`utils-book/{章}.md`](utils-book/) | **脚本生成** | 每章：文件用途 + 符号一行摘要 + 行号 |
| [`placement-decision.md`](placement-decision.md) | **手写** | 可复用证明（五问）、问用户、范式示例 |
| [`MERGE-AGENTS.md`](MERGE-AGENTS.md) | **手写** | `init` 如何自动处理 `AGENTS.md` |
| [`skills.md`](skills.md) | **脚本生成** | 项目 Agent Skills 索引 |

## 工作流

1. Read **`utils-book/index.md`** → Read **1 章** → **Shortlist**
2. **Confirm（五问）**：Read utils 源码；**不得**从文档抄 Verdict
3. 逻辑可 reuse、仅展示层差异且需求未写明 → **问用户**（placement §1.5）
4. 输出 **Discovery + Confirm + Verdict**（reuse / newUtil / featureLocal）
5. **newUtil** 后 **`pnpm gen:utils-book`**

细则：[`placement-decision.md`](placement-decision.md)、项目 `AGENTS.md` 中的 utils 复用节。

## 生成命令

```bash
pnpm gen:utils-book
pnpm check:utils-book   # 可选 CI 门禁
```

## 提高摘要质量（可选）

```ts
/** @utils-book 本符号做什么（一句话） */
```

无摘要时：`(无简介 — Confirm 前须 Read 实现)`。`@utils-book` 只描述功能，不写 reuse 判决。
