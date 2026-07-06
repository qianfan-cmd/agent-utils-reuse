# Agent 能力目录 — Utils 检索与复用

本目录帮助 Cursor Agent **在公共 utils 目录中按需复用工具函数**：先 **KV 检索（search / Grep index）**，再 **Confirm（五问）**，必要时 **问用户**（展示层细小差异），最后 Verdict。

**强制总闸（v0.3.6）**：`utils-reuse-gate.mdc` + `pre-write-utils-checklist.mdc` — **选中后证明**（§1.6）：每个 util + Local helpers 行须 **分项 Q1–Q4** + Verdict；禁止空泛「Q1–Q5 通过」。默认 **`hookMode: off`**（Rules 约束，不拦 Write）；opt-in **`hookMode: confirm`** 时 Hook **fail-closed** deny Write。

## 两类任务，勿混淆

| 任务 | 典型操作 | Message A 五问？ |
|------|----------|------------------|
| **业务实现** | `src/views` 等接 `@/utils`、改 feature 代码 | **必须** — **单轮六步**（§0 placement-decision）：Discovery → Read util → Confirm → **同轮** Write（`sameTurnAllow` 默认 true） |
| **索引维护** | 补 `@utils-book` → `pnpm gen:utils-book` → search 自测 | **不要** Write feature；见 [BACKFILL](./BACKFILL-UTILS-BOOK.zh.md) |

```text
业务 Write：Confirm 阶段（chat）→ Implement 阶段（Write/StrReplace，**同一 assistant 轮**）
Read util / search / gen index 均 ≠ gate complete
```

## 业务 Write 门禁（Agent 必读）

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

细则：[`placement-decision.md`](placement-decision.md)、项目 `AGENTS.md` 中的 utils 复用节。Write 前 checklist：`.cursor/rules/pre-write-utils-checklist.mdc`。

### Hook 验收（任意 init 项目）

Cursor 开在**项目根**。默认 **`hookMode: off`**；需硬门禁时设 `hookMode: confirm`：

1. Agent **Read** 某 `utilsDir` 文件 → `.cursor/.utils-gate-reads.json` 应出现该路径
2. assistant 在**首个 Write 工具之前**输出分项 Q1–Q4 + `Verdict（最终）` → `.cursor/.utils-gate-verdict.json` 中 `recorded: true`（同轮 preToolUse 亦可记录）
3. 随后 Write `remindWritePaths` 下文件 → **allow**；若跳过步骤 2 直接 Write → **deny**

```bash
pnpm test:hooks              # 或 node .../scripts/test-hook-confirm.mjs .
pnpm update:utils-reuse      # 刷新 hooks + rules 到 v0.3.3+
```

异常日志（可选）：`.cursor/.utils-gate-hook-error.log`

---

## 索引维护（gen / search / BACKFILL）

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
| `withSummary` | 有**任意**块注释摘要的符号数（**含**普通 JSDoc 首行，**不要求** `@utils-book`） |
| `symbols` | 可索引符号总数 |
| 终端 `JSDoc coverage: X/Y (Z%)` | 同上：`withSummary / symbols`，**不是** search 质量分数 |

某符号的 `summary` 不应再是 `(无简介 — Confirm 前须 Read 实现)`；`searchText` 应包含你写的中文关键词。

### 为什么终端 99% 但感觉「还有很多空描述」？

常见误会 — **三类「看起来空」的东西不一样**：

| 你看到的 | 在哪 | 是否算进 99% | 怎么处理 |
|----------|------|--------------|----------|
| `(无简介 — Confirm 前须 Read 实现)` | `utils-index.json` → `summary` | **否**（缺摘要） | 在 export 上补 `@utils-book` 后再 `gen` |
| `re-export from \`./time\`` | `utils-index.json`（barrel `index.ts`） | **否**（re-export 不计入覆盖率） | 在 re-export 上方补 `@utils-book`，或忽略 barrel 只索引实现文件 |
| `utils 根目录 — centerMessage` | **`utils-book/*.md` 文件「用途」行** | **否**（文件级 fallback，不是 symbol summary） | 在文件顶部 import 前加 `/** @utils-book 文件用途 */` |

**结论**：`pnpm gen:utils-book` 成功后，若 `utils-index.json` 里 **几乎找不到「无简介」**，说明 symbol 级索引已更新；终端 99% 往往表示 **130 个里只有 1 个**（常见是 `index.ts` 的 re-export）仍缺有效摘要。

**在项目根自检弱摘要**（Git Bash / WSL）：

```bash
cd /path/to/your-project
node -e "
const j=require('./docs/agent-catalog/utils-index.json');
const weak=[];
for (const [k,arr] of Object.entries(j.symbols)) {
  for (const e of arr) {
    if (!e.summary || e.summary.includes('无简介') || e.summary.startsWith('re-export'))
      weak.push(k + ' @ ' + e.path + ' → ' + e.summary);
  }
}
console.log('弱摘要数量:', weak.length);
weak.forEach(w => console.log(' -', w));
console.log('stats:', j.stats);
"
```

再用 search 验证业务词（比看百分比更可靠）：

```bash
node node_modules/agent-utils-reuse/bin/cli.mjs search "剪贴板 复制" --limit 8
```

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
| 终端 99% 但 index 里仍有个别 re-export | 正常；barrel `index.ts` 的 re-export 不计入覆盖率 | 在 re-export 行上方补 `@utils-book`，或接受 99% |
| utils-book 里「用途: utils 根目录 — xxx」 | 文件头无 `@utils-book`，与 symbol summary 无关 | 可选：文件顶部补文件级 `@utils-book` |
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

### `utils-index.json` 末尾 `ambiguous` 块

**无 `summary` 是设计**：仅列出**同名多路径**符号，提醒禁止仅凭名字 reuse。完整摘要与 `searchText` 在上方 **`symbols`** 对象中。
