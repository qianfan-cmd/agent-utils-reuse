# 最佳实践

[English](../en/best-practices.md) | 简体中文

## 单轮六步（默认）

| 步骤 | 动作 |
|------|------|
| 1 分析 | 读 `AGENTS.md`、业务代码与 import |
| 2 Discovery | D1 search / Grep index；零候选 → D2 Grep utilsDir |
| 3 Identify | 列出 symbol + 拟写 helper |
| 4 Read | Read **util 源码 export**；Grep 同文件 sibling |
| 5 Confirm | Bulk 表或分项 Q1–Q4 + `Verdict（最终）` |
| 6 Implement | 同轮 Write（`sameTurnAllow` 默认 true） |

**Read util ≠ 门禁完成。**

## AGENTS.md：每 session 读一次

推荐在 `.utils-bookrc.json` 设置：

```json
{ "agentsReadMode": "session" }
```

- **`session`**：sessionStart 视为已读 AGENTS（配合 alwaysApply Rules）
- **`tool`**（默认）：每任务仍须 **全文 Read**（禁 limit/offset）

## hookMode 三档

| 模式 | Write 拦截 | 适用 |
|------|------------|------|
| **`off`**（默认） | 否 | 日常开发 — Rules 约束 Confirm |
| **`remind`** | 否 | 放行 + agent_message 提醒；便于统计违规 |
| **`confirm`** | 是 | 验收 / PR 自检 — Discovery、分批、sibling 硬拦 |

启用 `confirm` 前：

```bash
pnpm gen:utils-book
agent-utils-reuse status
agent-utils-reuse search "<关键词>"
```

**不改默认 `off`** — 需要硬拦时显式开 `confirm`。

## sameTurnAllow 与审计

| 设置 | 行为 |
|------|------|
| `true`（默认） | 同轮 chat 须有 **可检测** Confirm 文本 + session Read util |
| `false` | 禁止同轮 eager Confirm；须分轮或 payload/transcript 证据 |

Hook **只审计 user-visible chat + session Read**，**不**读 thinking。v0.3.18：`confirm` 下可从 `transcript_path` 补读同轮 Confirm。

## 分层 gate（v0.3.22）

| 层级 | 何时 |
|------|------|
| uiOnly | 仅 template/style，无 script util 增量 |
| delta 新 import | patch 新增 binding |
| delta newCall | 已有 import，patch 首次 `Binding.method` |
| sameSymbol | 已 Confirm，仅改参数/文案 |

详见 `placement-decision.md` §1.6.1。

## Discovery / Confirm 固定格式

```
D1 "upload": 3 → [uploadSingleFile @ src/utils/upload.ts, …]
D1 "kw": 0 → D2 path:src/utils "kw"
D2 path:src/utils "kw": N → [sym @ path, …]
```

Bulk Q4：`<chosen> OK; reject <sibling> (<reason>)` 或 `<chosen> OK; no sibling`。

## Bulk Confirm（≥3 symbol）

- **Symbol 列**写 import 名（`UrlUtils`；newCall 写 `UrlUtils.method`）
- Q4 须 `reject sibling` 或 `no sibling`
- 每轮 ≤5 reuse symbol，多则分批

## 两类任务

| 任务 | 五问？ |
|------|--------|
| 业务 feature | **要** |
| 索引维护 BACKFILL / gen | **不要** — 不写 feature |

## deny 排查

读 `agent_message` 的 `denyReason`、`missingReads`、`needsConfirm` 等。

日志：`.cursor/.utils-gate-hook-debug.log`

## 参考

- 详规 SSOT：`.cursor/rules/utils-reuse-gate.mdc`
- `docs/agent-catalog/placement-decision.md`
- [TEST-RUBRIC-WRITING.zh.md](../maintainer/TEST-RUBRIC-WRITING.zh.md)
