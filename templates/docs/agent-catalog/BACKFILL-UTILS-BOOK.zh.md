# 补全 @utils-book 摘要 — Agent 提示词

[English version](./BACKFILL-UTILS-BOOK.en.md)

## 何时需要

在以下情况使用本文档中的提示词（Cursor Agent 或人工对照）：

- 项目已有 **`src/utils/`**（或 `.utils-bookrc.json` 里的 `utilsDir`），但 **`pnpm gen:utils-book` 后** 很多符号 summary 为 `(无简介 — Confirm 前须 Read 实现)`
- Agent **D1** `agent-utils-reuse search` 用**中文需求词**常 0 结果，但 Grep 源码能发现已有 util
- 历史 utils **从未写过** `@utils-book` 一行摘要

**说明**：KV 检索（`utils-index.json` + search）主要依赖 **`@utils-book` 功能描述**。摘要不足是**索引信息不够**，不是门禁逻辑错误。补注释后重新 `gen` 即可。

## 规则（Agent / 人工）

1. 每个 **export** 正上方 **`/** ... */`** 块注释（紧贴 export，中间仅空行）；**不用**单行 `//`。
2. 推荐一行：**`@utils-book 一句话功能`** — 写符号做什么（入参/出/副作用可一句带过）。
3. **禁止**写 reuse 判决、Verdict、业务场景绑死（如「机台专用」）。
4. **No extend**：只加/改注释，**不**改 export 签名、实现或默认语义。
5. 已有 `/** */` 但无 `@utils-book` → 补 tag 或把首行改为功能描述。
6. `export { x } from '...'` 的 re-export 可跳过，除非需单独说明。

## 完成后

```bash
pnpm gen:utils-book
# 可选自测
node node_modules/agent-utils-reuse/bin/cli.mjs search "你的关键词" --limit 8
```

## 可复制 Agent 提示词

在新 Cursor Agent 会话中粘贴（将 `src/utils` 换成你项目的 `utilsDir`）：

```markdown
任务：为 `src/utils/` 下所有缺少有效 @utils-book 摘要的 export 补 JSDoc。

规则：
1. 在每个 export 正上方添加 `/** ... */`（中间仅空行），不要用单行 `//`。
2. 使用 `@utils-book 一句话功能描述` — 写该符号做什么（入参/出参/副作用可一句带过），不要写 reuse/Verdict/业务场景名。
3. 不要修改任何 export 的签名、实现或默认行为（No extend）。
4. 若已有 `/** */` 但无 @utils-book，补 @utils-book 行或把首行改为功能描述。
5. 跳过 re-export 行（`export { x } from`）除非需要给 re-export 符号单独说明。
6. 完成后列出改动的文件与符号清单。

**说明**：BACKFILL 会话只改 `utilsDir` 注释，**不替代**后续业务 feature 任务的 Message A 五问 + `Verdict（最终）`。

请先 Grep `src/utils` 找出无块注释或 utils-index 中 summary 为「无简介」的 export，再逐文件补全。不要 Write feature 代码。
```
