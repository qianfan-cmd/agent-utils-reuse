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
| [`BACKFILL-UTILS-BOOK.zh.md`](BACKFILL-UTILS-BOOK.zh.md) | **手写** | 补全 `@utils-book` — 中文 Agent 提示词 |
| [`BACKFILL-UTILS-BOOK.en.md`](BACKFILL-UTILS-BOOK.en.md) | **手写** | Backfill `@utils-book` — English Agent prompt |
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

在项目根目录执行（含 `package.json` 与 `.utils-bookrc.json` 的目录；**不是**只打开 `docs/agent-catalog/` 子目录）：

```bash
pnpm gen:utils-book          # 重新生成 utils-index.json + utils-book/*.md
agent-utils-reuse search "数组 排序" --limit 8   # Agent D1 首选
pnpm check:utils-book        # 可选 CI 门禁
```

Windows 若 `agent-utils-reuse` 不在 PATH：

```bash
node node_modules/agent-utils-reuse/bin/cli.mjs gen
node node_modules/agent-utils-reuse/bin/cli.mjs search "剪贴板 复制" --limit 8
```

---

## 补完 `@utils-book` 后如何更新 `utils-index.json`

**`utils-index.json` 是脚本生成的，禁止手改。** 你在 `src/utils/`（或 `.utils-bookrc.json` 里的 `utilsDir`）补好块注释后，必须 **重新跑生成命令**，索引才会带上新摘要。

### 标准流程（任意消费项目）

```text
1. 补 JSDoc（人工或 BACKFILL Agent 提示词）
      ↓
2. 在项目根：pnpm gen:utils-book
      ↓
3. 自检 search 能否命中中文关键词
      ↓
4. git add + commit utils-index.json 与 utils-book/*.md
```

**步骤 1 — 补注释**（示例）：

```ts
/** @utils-book 将文本写入系统剪贴板 */
export function copyToClip(text: string) { ... }
```

- 块注释 **`/** ... */`** 紧贴在 `export` 上方（中间仅空行）
- 单行 `//` **不会**被扫描进索引
- 批量补全见 [BACKFILL-UTILS-BOOK.zh.md](./BACKFILL-UTILS-BOOK.zh.md) / [BACKFILL-UTILS-BOOK.en.md](./BACKFILL-UTILS-BOOK.en.md)

**步骤 2 — 重新生成索引**（在**项目根**执行）：

```bash
cd /path/to/your-project    # 项目根（含 package.json），不是 docs/agent-catalog
pnpm gen:utils-book
```

生成器会：

- 扫描 `utilsDir` 下所有 export 的 `@utils-book` 摘要
- **覆盖写入** `docs/agent-catalog/utils-index.json`（路径以 `.utils-bookrc.json` 的 `utilsIndexFile` 为准）
- 同时更新 `docs/agent-catalog/utils-book/*.md`

若未安装 `gen:utils-book` script，可直接：

```bash
node node_modules/agent-utils-reuse/bin/cli.mjs gen
```

**步骤 3 — 验证是否生效**：

```bash
# 用业务中文词试搜（应出现刚补过摘要的符号）
node node_modules/agent-utils-reuse/bin/cli.mjs search "剪贴板 复制" --limit 8

# 或直接看 index 里该符号的 summary / searchText 是否已变
# （Windows PowerShell 示例）
grep -i "copyToClip\|剪贴板" docs/agent-catalog/utils-index.json
```

打开 `utils-index.json` 可核对顶部的 `stats`：

| 字段 | 含义 |
|------|------|
| `withSummary` | 有有效 `@utils-book` 的符号数 |
| `weakSummary` | 仍为「无简介」的符号数 — **补注释后应下降或为 0** |

某符号的 `summary` 不应再是 `(无简介 — Confirm 前须 Read 实现)`；`searchText` 应包含你写的中文关键词。

**步骤 4 — 提交**（团队 / CI 需要一致索引时）：

```bash
git add docs/agent-catalog/utils-index.json docs/agent-catalog/utils-book/
git commit -m "chore: regen utils-index after @utils-book backfill"
```

可选 CI：`pnpm check:utils-book`（会先 gen 再 `git diff`，有未提交变更则失败）。

### 本仓库 `examples/minimal` 示例

若在 **agent-utils-reuse** 包里跑 minimal 示例：

```bash
cd examples/minimal
pnpm gen:utils-book
# 输出：examples/minimal/docs/agent-catalog/utils-index.json
node ../../bin/cli.mjs search "剪贴板" --limit 8 --cwd .
```

### 常见问题

| 现象 | 原因 | 处理 |
|------|------|------|
| 跑了 `gen` 但 summary 仍是「无简介」 | 注释不是块注释、不在 export 正上方、或缺少 `@utils-book` | 按 BACKFILL 规则改源码后再 `gen` |
| 在子目录执行 `gen` 报错 | 当前目录不是项目根 | `cd` 到含 `package.json` 的根目录 |
| search 中文仍 0 结果 | 摘要里没写对应中文词 | 在 `@utils-book` 一行加上业务用语（如「剪贴板」「复制」）后再 `gen` |
| 改了 index 又被覆盖 | 正常 — index 每次 gen 都会重写 | 只改 `src/utils` 里的 JSDoc，不要手改 JSON |

---

## 提高摘要质量（新建 export 必填）

**KV search 依赖 `@utils-book` 摘要**。无有效摘要时，index 中为 `(无简介 — Confirm 前须 Read 实现)`，中文/语义 Shortlist 会明显变弱 — 这是**索引信息不足**，不是门禁缺陷。

**已有大量历史 utils、未写注释？** 使用补全指南（含可复制 Agent 提示词）：

- 中文：[BACKFILL-UTILS-BOOK.zh.md](./BACKFILL-UTILS-BOOK.zh.md)
- English: [BACKFILL-UTILS-BOOK.en.md](./BACKFILL-UTILS-BOOK.en.md)

在 **`src/utils/`**（或 `.utils-bookrc.json` 中的 `utilsDir`）里，**每个 export 上方必须有**块注释 `/** ... */`（紧贴 export，中间仅空行）。**推荐**：

```ts
/** @utils-book 本符号做什么（一句话） */
export function myUtil(...) { ... }
```

- 只写功能，不写 reuse 判决或业务场景绑定。
- 不用单行 `//` 代替（生成器不读）。
- **newUtil** 或新增 export 后执行 **`pnpm gen:utils-book`**。

无摘要时 index 中 summary 为 `(无简介 — Confirm 前须 Read 实现)`，search 质量下降 — 见 [BACKFILL-UTILS-BOOK.zh.md](./BACKFILL-UTILS-BOOK.zh.md) / [BACKFILL-UTILS-BOOK.en.md](./BACKFILL-UTILS-BOOK.en.md)。
