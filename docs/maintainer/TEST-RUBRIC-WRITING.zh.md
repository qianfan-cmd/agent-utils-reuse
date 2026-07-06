# 测试卷编写建议（消费方项目）

本文件 **不属于 agent-utils-reuse Hook 逻辑**；供维护 acceptance / 金标准测试卷的工程师参考（任意已 init 门禁的业务仓库均可使用，无特殊项目名依赖）。

## 题面格式

每题建议显式标注：

```markdown
**金标准 #26** | 期望 symbol: `convertMentionTagsToHtml` | 推荐 D1: `mention HTML convertMentionTagsToHtml`
**禁止**: Read feature 组件源码（题面约束，Hook 不 enforce）
```

- **期望 symbol**：阅卷与 Agent 对齐的 util 名（**勿仅用业务题号**指代 util，避免 #11 Text 与 #26 Html 混淆）。
- **推荐 D1 关键词**：与 consumer `utils-index.json` 的 `searchText` / symbol 名对账；BACKFILL 不全时更新 index 或改关键词。
- 避免口头「第 16–20 题」与金标准 `#16–#20` 混用而不写期望 util 名。

### 示例对照表（模板 — 按你的 consumer 项目填写）

| 金标准 # | 期望 symbol | 推荐 D1 关键词 | 备注 |
|----------|-------------|----------------|------|
| #11 | `convertMentionTagsToText` | `mention text convertMentionTagsToText` | 勿与 #26 Html 混淆 |
| #26 | `convertMentionTagsToHtml` | `mention HTML convertMentionTagsToHtml` | 勿与 #11 Text 混淆 |
| #20 | `uploadFiles` | `upload batch uploadFiles` | sibling: uploadMultipleFiles, uploadSingleFile |
| #28 | — | `debounce` | 负例：期望 `noUtil(debounce)` |
| #27 | — | — | 纯 UI skeleton；Gate N/A / uiOnly |

## 与门禁的关系

| 测试意图 | 题面应写 | Hook 是否 enforce |
|----------|----------|-------------------|
| sibling 选型 | 期望 symbol + 需 reject 的 sibling | 是（`sibling_q4_missing`） |
| D1 零候选 + D2 | 关键词 + 期望 `noUtil(x)` 行 | 部分（`noutil_q4_invalid` on bulk Q4） |
| 纯 UI 区块 | `#27 skeleton 无 utils` | 是（uiOnly allow，v0.3.11+） |
| 禁止读 feature | 题面「禁止 Read 某 feature 组件源码」 | 否（Rules/人工阅卷） |
| 分轮增量 | 第一轮列 **新增 symbol**；后续 **Delta Confirm** | 是（`needsConfirm` / `alreadyCovered`，v0.3.12） |
| 同轮 Confirm+Write | **默认**单轮六步（`sameTurnAllow` 默认 true）；strict 设 `false` 或分两轮 | 是（默认 allow+remind；strict → `verdict_not_recorded`） |
| transcript 同轮（v0.3.18） | Confirm 在 assistant 回复、Write 在同轮；压测无需分两轮 | 是（`transcript_path` 回读 + eager record；debug `verdict_source`） |

## 8 symbol 分批压测模板（v0.3.18）

单轮超过 5 个 reuse symbol 时，题面或 Agent 应拆成两批：

**表 1（≤5 symbol）+ Write batch 1** — 先写前 5 个 import 对应区块。

```markdown
| Symbol | Read @ path | Q4 | Verdict |
| sym1 | … | … | reuse(sym1) |
…（≤5 行）
```

**表 2（剩余 symbol）+ Write batch 2** — Delta Confirm 补剩余 symbol 后再 Write。

测试专用可在 `.utils-bookrc.json` 设 `"maxImportSymbolsPerTurn": 8`（仅压测，生产保持默认 5）。

## 分轮增量卷

若故意分三轮追加同一文件，在题面说明：

- 第一轮：列出本批 **新增 symbol**
- 后续轮：**Delta Confirm** 即可（见 `placement-decision.md` §3）；Hook `needsConfirm` 空且 session 已 record → **allow 无需本轮 Verdict**

否则 Agent 可能每轮重出整表 — 属于体验预期，不是 Hook bug。

## KV / index 质量（consumer CI）

- 维护「推荐 D1 关键词」列与 `pnpm gen:utils-book` 生成的 `utils-index.json` **人工或 CI 对账**
- 可选：`check:utils-book` 确保 index 与源码 JSDoc 同步
