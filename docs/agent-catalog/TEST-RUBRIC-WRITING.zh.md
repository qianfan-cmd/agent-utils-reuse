# 测试卷编写建议（消费方项目）

本文件 **不属于 agent-utils-reuse Hook 逻辑**；供维护 acceptance / 金标准测试卷的工程师参考（任意已 init 门禁的业务仓库均可使用，无特殊项目名依赖）。

## 题面格式

每题建议显式标注：

```markdown
**金标准 #26** | 期望 symbol: `convertMentionTagsToHtml` ONLY（勿与 #18 混淆）
**禁止**: Read feature 组件源码（题面约束，Hook 不 enforce）
```

避免口头「第 16–20 题」与金标准 `#16–#20` 混用而不写期望 util 名。

## 与门禁的关系

| 测试意图 | 题面应写 | Hook 是否 enforce |
|----------|----------|-------------------|
| sibling 选型 | 期望 symbol + 需 reject 的 sibling | 是（`sibling_q4_missing`） |
| D1 零候选 + D2 | 关键词 + 期望 `noUtil(x)` 行 | 部分（D1 叙事 on addsHelper） |
| 纯 UI 区块 | `#27 skeleton 无 utils` | 是（uiOnly allow，v0.3.11+） |
| 禁止读 feature | 题面「禁止 Read 某 feature 组件源码」 | 否（Rules/人工阅卷） |

## 分轮增量卷

若故意分三轮追加同一文件，在题面说明：

- 第一轮：列出本批 **新增 symbol**
- 后续轮：**Delta Confirm** 即可（见 `placement-decision.md` §3）

否则 Agent 可能每轮重出整表 — 属于体验预期，不是 Hook bug。
