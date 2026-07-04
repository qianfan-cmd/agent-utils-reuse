# 测试卷编写建议（消费方项目）

本文件 **不属于 agent-utils-reuse Hook 逻辑**；供维护 acceptance / 金标准测试卷的工程师参考（任意已 init 门禁的业务仓库均可使用，无特殊项目名依赖）。

## 题面格式（必写 symbol，勿只用业务题号）

每题建议显式标注 **期望 symbol** 与 **D1 关键词**（阅卷与 Agent 共用 `utils-index.json` symbol 名，**不在本包维护题号映射**）：

```markdown
**金标准 #26** | 期望 symbol: `convertMentionTagsToHtml` ONLY
**D1 关键词**: mention HTML convert
**禁止**: Read 某 feature 组件源码（题面约束，Hook 不 enforce）
```

**错误示例**：仅写「需求 11 HTML 版」—— Agent 无法区分金标准 #11（Text）与 #26（Html）。

**正确示例**：

```markdown
**期望 symbol**: `convertMentionTagsToText` | D1: mention text plain
**期望 symbol**: `convertMentionTagsToHtml` | D1: mention HTML convert
```

## 推荐 D1 关键词列（与 index 同步）

维护方可在消费方仓库附录维护「题面 ↔ D1 关键词 ↔ 期望 symbol」表；每次 `pnpm gen:utils-book` 后跑 `pnpm check:utils-book` 确保 index 与 `@utils-book` 摘要一致。

| 场景 | D1 关键词示例 | 期望 symbol（示例） |
|------|---------------|---------------------|
| mention HTML | mention HTML convert | convertMentionTagsToHtml |
| mention 纯文本 | mention text plain | convertMentionTagsToText |
| 批量上传 | upload batch parallel | uploadFiles |
| debounce 负例 | debounce | noUtil(debounce) |

## 与门禁的关系

| 测试意图 | 题面应写 | Hook 是否 enforce |
|----------|----------|-------------------|
| sibling 选型 | 期望 symbol + 需 reject 的 sibling | 是（`sibling_q4_missing`） |
| D1 零候选 + D2 | 关键词 + 期望 `noUtil(x)` 行 | 部分（D1 叙事 on addsHelper；noUtil Q4 轻校验 v0.3.12+） |
| 纯 UI 区块 | skeleton 无 utils | 是（uiOnly allow，v0.3.11+） |
| 禁止读 feature | 题面「禁止 Read 某 feature 组件源码」 | 否（Rules/人工阅卷；`forbiddenReadPaths` 为 future opt-in） |

## 分轮增量卷

若故意分三轮追加同一文件，在题面说明：

- 第一轮：列出本批 **新增 symbol**
- 后续轮：**Delta Confirm 最小格式**（见 `placement-decision.md` §3）— 仅 `needsConfirm` 行 + Gate N/A

否则 Agent 可能每轮重出整表 — 属于体验预期，不是 Hook bug。

## KV / BACKFILL

测试卷依赖的 D1 关键词须出现在 `utils-index.json` 的 `searchText` 中；BACKFILL 不全时 Agent 会走 D2 SemanticSearch，更难证明「优先 KV」。消费方 CI 建议：`pnpm check:utils-book`。
