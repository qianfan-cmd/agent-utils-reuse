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

## hookMode

| 场景 | 配置 |
|------|------|
| 日常开发 | `hookMode: off` |
| 验收 / 硬门禁 | `hookMode: confirm`（默认启用 Discovery/分批/D1.5） |
| 仅分轮 | `sameTurnAllow: false` |

启用 confirm 前：`pnpm gen:utils-book` → `agent-utils-reuse status` → `agent-utils-reuse search "<关键词>"`。

v0.3.18：`confirm` 下可从 `transcript_path` 读同轮 Confirm。

## Bulk Confirm（≥3 symbol）

- **Symbol 列**写 import 名（`UrlUtils`，非 `UrlUtils.method`）
- Q4 须 `reject sibling`（同文件多 export 时）
- 每轮 ≤5 reuse symbol，多则分批

## 两类任务

| 任务 | 五问？ |
|------|--------|
| 业务 feature | **要** |
| 索引维护 BACKFILL / gen | **不要** — 不写 feature |

## Discovery

- D1：search 或 Grep `utils-index.json` — **禁止** Read utils-book 做 Shortlist
- D1 零候选 → 必做 D2
- Confirm 中写明 D1/D2 结果

## deny 排查

读 `agent_message` 的 `denyReason`、`missingReads`、`needsConfirm` 等。

日志：`.cursor/.utils-gate-hook-debug.log`

## 参考

- `docs/agent-catalog/placement-decision.md`
- [TEST-RUBRIC-WRITING.zh.md](../maintainer/TEST-RUBRIC-WRITING.zh.md)
