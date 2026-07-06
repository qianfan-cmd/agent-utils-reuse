# 补全 @utils-book JSDoc

[English](../en/backfill-jsdoc.md) | 简体中文 | [README 步骤 4](../../README.zh-CN.md#4-为已有-export-补-utils-book推荐)

Agent 提示词权威副本（init 同步到业务项目）：

- `docs/agent-catalog/BACKFILL-UTILS-BOOK.zh.md`
- `docs/agent-catalog/BACKFILL-UTILS-BOOK.en.md`

## 何时需要

- `pnpm gen:utils-book` 后大量 `(无简介 — Confirm 前须 Read 实现)`
- 中文 `search` 0 结果，但 Grep `utilsDir` 有实现
- 历史 utils 从未写 `@utils-book`

摘要不足是**索引信息不够**，不是门禁 bug。补注释后重新 `gen`。

## 标准流程

```text
1. 补 JSDoc（人工或 Agent 提示词）
      ↓
2. 项目根：pnpm gen:utils-book
      ↓
3. search 自测业务关键词
      ↓
4. 提交 utils-index.json 与 utils-book/
```

示例：

```ts
/** @utils-book 将文本写入系统剪贴板 */
export function copyToClip(text: string) { ... }
```

- `/** */` 紧贴 `export` 上方；单行 `//` 不扫描
- **No extend** — 只改注释

## 可复制提示词

见 [README.zh-CN.md](../../README.zh-CN.md#4-为已有-export-补-utils-book推荐) 或 [BACKFILL-UTILS-BOOK.zh.md](../../docs/agent-catalog/BACKFILL-UTILS-BOOK.zh.md)。

完成后：

```bash
pnpm gen:utils-book
node node_modules/agent-utils-reuse/bin/cli.mjs search "剪贴板 复制" --limit 8
```

## 验证索引

`utils-index.json` 顶部 `stats`：`withSummary` / `symbols`。

### 三类「看起来空」

| 现象 | 位置 | 处理 |
|------|------|------|
| 无简介 | index summary | export 补 `@utils-book` 再 gen |
| re-export | barrel index.ts | 可忽略或补注释 |
| utils 根目录 — xxx | utils-book 文件用途行 | 可选文件级 `@utils-book` |

### 弱摘要自检

```bash
node -e "
const j=require('./docs/agent-catalog/utils-index.json');
const weak=[];
for (const [k,arr] of Object.entries(j.symbols)) {
  for (const e of arr) {
    if (!e.summary || e.summary.includes('无简介') || e.summary.startsWith('re-export'))
      weak.push(k + ' @ ' + e.path);
  }
}
console.log('弱摘要:', weak.length); weak.forEach(w => console.log(' -', w));
"
```

## 常见问题

| 现象 | 原因 | 处理 |
|------|------|------|
| gen 后仍无简介 | 非块注释/位置不对 | 按 BACKFILL 规则 |
| 99% 但 re-export 弱 | barrel 不计覆盖率 | 可接受 |
| 子目录 gen 失败 | 非项目根 | cd 到含 package.json 的根 |
| 中文 search 0 | 摘要无中文词 | `@utils-book` 加业务用语 |
| 手改 index 被覆盖 | 正常 | 只改 src/utils |

可选 CI：`pnpm check:utils-book`

## 新建 export

每个新 export 须有 `/** */`；**newUtil** 后 `pnpm gen:utils-book`。

BACKFILL **不替代**业务 feature 的五问 Confirm。
