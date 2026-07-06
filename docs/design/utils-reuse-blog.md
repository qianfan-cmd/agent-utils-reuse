# 🤖 AI 写代码总在重复造轮子？我们把 Utils 复用门禁做进了 Agent 运行时（已开源）

---

让 Cursor / Claude Code 一类 Agent 在前端项目里实现功能，你大概率遇到过这种场面：

任务描述很清晰，Agent 也很「勤快」——Read 了几个文件，然后开始 Write。等 diff 出来一看：**业务目录里又多了一套和公共 `utils` 几乎一样的 regex / DOM 解析 / 序列化逻辑**。

更气人的是，它往往**读过**工具目录，甚至搜到过某个 `xxxUtils.ts`，最后却用「展示文案不一样」「组件要瘦」「这个文件里还有很多别的 export」之类的理由，**静默 fork** 了一份实现。

说实话，作为一个长期用 AI 辅助写业务的前端，我关心的不是 Agent「会不会写代码」，而是：**它能不能像资深同事一样，先证明「现有 util 能接」，再动手**。模型再强，重复实现带来的分叉维护成本都是真实的。

这篇文章把我们落地并开源的 **Utils 按需复用设计**（[agent-utils-reuse](https://github.com/qianfan-cmd/agent-utils-reuse)）拆开讲清楚——不绑定某个业务场景，重点是 **Agent 该怎么决策、文档和工程上怎么约束**。文中代码与路径均为**示意**。

---

## 一、我们要解决的本质问题

如果把「复用 utils」当成一次技术选型，失败模式通常长这样：

| 阶段 | 常见失败 | 后果 |
| --- | --- | --- |
| 发现 | 全库 Grep / 凭记忆猜路径 | 漏候选或误选同名符号 |
| 判断 | 只看索引一行摘要就 reject/reuse | 幻觉判决，和源码行为不一致 |
| 执行 | 展示层用词不同就复制实现 | 两套逻辑漂移，修 bug 修两遍 |
| 扩展 | 改已有 export 的默认语义去「凑合用」 | 隐性破坏旧调用方 |
| **时序** | Read 了 util 就认为「门禁过了」 | 无 Confirm 直接 Write，Hook/Rules 形同虚设 |

我们和「多写点注释」「提醒 Agent 要复用」的区别在于：**把复用证明写进流程，并用 Rules + 可选 Hook + 生成索引固化**。

| 维度 | 口头约定 | agent-utils-reuse |
| --- | --- | --- |
| 候选发现 | 自由 Grep 全库 | **D1**：`search` / Grep `utils-index.json`；零候选 → **D2** Grep `utilsDir` |
| 是否 reuse | 摘要 / 直觉 | **五问 Confirm**（必须 Read **util 源码 export**） |
| 细小差异 | Agent 自行脑补 | **问用户**（展示层未写明时） |
| 结论 | 模糊 | **`Verdict（最终）`**：reuse / partialReuse / newUtil / featureLocal / noUtil |
| 索引维护 | 手改文档 | **`pnpm gen:utils-book`** 生成 KV 索引 + 人类可读 book |
| Write 前证明 | 可有可无 | **聊天输出 Confirm + Verdict**；opt-in Hook 可硬拦 |

---

## 二、整体架构：Discovery → Confirm → Verdict → Write

核心不是「再多一份 README」，而是给 Agent 一条**可审计的决策管道**。v0.3.14 起默认支持**单轮六步**——同一条 assistant 回复里先 Confirm，再 Write：

```
┌────────────────────────────────────────────────────────────────────┐
│  任务入口（feature / bugfix / 新 util）                              │
└───────────────────────────────┬────────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────────┐
│  1 Analyze — Read AGENTS.md、业务代码与现有 import                   │
└───────────────────────────────┬────────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────────┐
│  2 Discovery（粗筛，不构成证明）                                     │
│  D1: agent-utils-reuse search "关键词" 或 Grep utils-index.json     │
│  D1 零候选 → D2: Grep/SemanticSearch utilsDir                       │
│  ※ 禁止用 Read utils-book/*.md 做 Shortlist（v0.3.0+）              │
└───────────────────────────────┬────────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────────┐
│  3 Identify — 列出 symbol @ path + 拟写/保留的 feature helper        │
└───────────────────────────────┬────────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────────┐
│  4 Read — Read 将调用的 util export 源码；同文件 sibling 须 Grep      │
│  ※ Read util ≠ 门禁完成                                              │
└───────────────────────────────┬────────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────────┐
│  5 Confirm — 分项 Q1–Q4（≥3 symbol 可用 Bulk 表）+ Verdict（最终）    │
│  展示层差异未写明 → AskQuestion                                       │
└───────────────────────────────┬────────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────────┐
│  6 Implement — Write / StrReplace（默认同轮，sameTurnAllow: true）    │
└────────────────────────────────────────────────────────────────────┘
```

**关键点：**

- **Discovery 永远不等于 reuse** — 索引和 search 只做「找候选」。
- **Read util 源码也不等于 reuse** — 必须在**用户可见聊天**里输出 Confirm + `Verdict（最终）`。
- **展示层差异 alone 不能否决 reuse** — 要么 reuse，要么问用户，禁止静默 fork。
- **No extend** — 必须改已有 export 才能用时，走 **newUtil**，不污染旧 API。

---

## 三、双轨索引：KV 给 Agent，Markdown 给人

v0.3.0 我们把 Agent 的 Discovery 从「读工具书 Markdown」改成了 **KV 检索**——这是和老版本博客最大的变化。

### 3.1 Agent 用什么？`utils-index.json` + search

公共 utils 往往有几十个文件、上百个 export。让 Agent 每次 Read 整本 `utils-book`，既浪费 token，也容易「摘要幻觉」。

现在的规定：

1. **D1（首选）**：`agent-utils-reuse search "数组 排序" --limit 8`，或 Grep `docs/agent-catalog/utils-index.json`
2. **D1 零候选**：必须 D2 — Grep / SemanticSearch `src/utils`（或你配置的 `utilsDir`）
3. 列出候选 `symbol @ path`，进入 Read + Confirm

这就像查词典的**倒排索引**：用业务关键词命中符号，而不是翻整本书。

### 3.2 人用什么？`utils-book/` 仍然保留

`pnpm gen:utils-book` 会同时生成：

| 产物 | 谁读 | 作用 |
| --- | --- | --- |
| `utils-index.json` | **Agent D1** | 符号、路径、摘要、searchText、sibling 提示 |
| `utils-book/*.md` | **人类** | 目录、分章表格、覆盖率统计 |
| `placement-decision.md` | **Agent** | 五问细则、范式、反模式（init 同步到业务项目） |

**Agent 禁止** Read `utils-book` 做 Shortlist——那是给人浏览和 Code Review 用的。

### 3.3 `@utils-book` 与 BACKFILL

KV search 的质量取决于 export 上的 **`@utils-book` 一行摘要**。历史项目里大量 util 没写注释时，中文 search 会 0 结果——这是**索引信息不足**，不是门禁 bug。

推荐流程：

1. 用 README 里的 **BACKFILL Agent 提示词**（或 `docs/agent-catalog/BACKFILL-UTILS-BOOK.zh.md`）批量补 JSDoc
2. `pnpm gen:utils-book` 重新生成索引
3. `search` 用业务词自测

合法示例：

```ts
/** @utils-book 将 ISO 日期格式化为 YYYY-MM-DD（本地时区） */
export function formatDateLocal(iso: string): string { ... }
```

- 块注释 `/** */` 紧贴 `export`；单行 `//` **不会**进索引
- 只写**功能**，不写 reuse 判决或「机台专用」等业务绑死文案

### 3.4 生成与 CI

```bash
pnpm gen:utils-book          # 扫描 utilsDir，重写 index + book
pnpm check:utils-book        # regen + git diff，防「改了源码忘了 gen」
```

终端会打印 **JSDoc 覆盖率**（`withSummary / symbols`）。覆盖率偏低时符号仍会被索引，但摘要列可能是 `(无简介 — Confirm 前须 Read 实现)`——此时 Agent 更不能凭摘要判决，必须 Read 源码。

---

## 四、五问 Confirm：什么叫「可复用证明」

索引摘要只能帮你 **Discovery**。真正的判决是 **架构师五问**（详见业务项目内的 `placement-decision.md`）：

| # | 问题 | 通过标准 |
| --- | --- | --- |
| **Q1 输入契约** | 类型、必填/可选、空值语义是否一致？ | 硬失败 → newUtil / featureLocal |
| **Q2 输出与存储/API** | 返回值、持久化、API 字段是否一致？ | **不含** UI 文案、i18n、按钮标签 |
| **Q3 副作用** | DOM / storage / API / 全局状态？ | 无或调用方可接受 |
| **Q4 替换实验** | `util(x)` ≡ 拟写的 `f(x)`？ | 展示层差异须单列，alone 不判 newUtil |
| **Q5 须改 util 内部？** | 是否必须改已有 export？ | **是** → **newUtil**；**否** → 倾向 **reuse** |

**充分结论**：Q1–Q4 通过且 Q5=否 → **Verdict: reuse(sym)**。

### 4.1 Bulk Confirm（≥3 个 symbol）

业务页一次 import 多个 util 时，可用压缩表（chat 在首个 Write 之前）：

```markdown
| Symbol | Read @ path | Q4（替换 + sibling 拒选） | Verdict |
| uploadFiles | imageUploadUtils.ts | 批处理 OK；reject uploadMultipleFiles | reuse(uploadFiles) |
| UrlUtils | url.ts | 静态方法差异见 Q4；reject sibling | reuse(UrlUtils.replaceX) |
```

- **Symbol 列写 import 绑定名**（如 `UrlUtils`，不是 `UrlUtils.method`）
- 单轮建议 ≤5 个 reuse symbol；更多则分批 Confirm + Write
- 禁止空泛「Q1–Q5 通过」——Hook 会拦

### 4.2 无效 reject 理由（反模式）

| 误判 | 正确做法 |
| --- | --- |
| 「展示文案不一样」 | Q2 不看展示层 → **reuse** 或 **问用户** |
| 「这个类里还有很多别的 export」 | 只 import 需要的一个 → **reuse** |
| 「需求只是它的子集」 | **reuse** 子集 API |
| 「组件要瘦」 | UI 编排留 featureLocal；纯函数仍走五问 |

### 4.3 Write 前输出示例（虚构）

```markdown
D1 "debounce": 0 candidates → D2: Grep path:src/utils "debounce"

Confirm uploadFiles:
- Q1 入参 File[]；Q2 返回 Promise<url[]>；Q3 调上传 API；Q4 与拟写 batch 一致；Q5 否

Verdict（最终）: reuse(uploadFiles)
```

**不得从文档抄 Verdict** — 每个任务都要 Read 源码自主 Confirm。

---

## 五、展示层细小差异：问用户，别替产品做决定

五问里最容易导致 fork 的，是 **Q2 的边界**：

- **算硬失败**：输出协议变了、持久化格式变了、API 字段语义变了
- **不算硬失败**：「图片」vs「参考图」、placeholder 用词不同

当 Q1–Q4 已过、Q5=否，但 UI 文案与需求不一致且**需求没写明**——Write 前 **AskQuestion**（见文末附录）。

用户选 A → **reuse**；选 B → **featureLocal** 或 **newUtil**。

---

## 六、Verdict 不止三选一

| Verdict | 含义 |
| --- | --- |
| **reuse(sym)** | 五问通过，Q5 否 |
| **partialReuse(sym)+featureLocal(wrapper)** | util 覆盖核心；页面做类型/文案包装 |
| **newUtil(name)** | 硬失败且应共享；或 Q5 是 |
| **noUtil(kw)** | D1/D2 无共享 export（如历史 debounce 只在组件里） |
| **featureLocal(reason)** | 强 UI/状态耦合，仅本页 |
| **featureLocal+placement debt** | 从别的 feature 抄来的纯函数，注明日后可抽 util |

**No extend** 再次强调：有一点差异 **不等于** 禁止 import；只有**必须改已有 export 的默认语义**时才 newUtil。

---

## 七、工程化落地：Rules 默认约束，Hook 可选硬拦

光写细则不够，Agent 会话一长还是会忘。我们把流程写进了 Cursor 运行时（`init` 一键安装）：

```
┌─────────────────────────────────────────────────────────────┐
│  AGENTS.md（合并 utils 复用节）— 单源真相摘要                  │
├─────────────────────────────────────────────────────────────┤
│  Cursor Rules（alwaysApply）— workspace / utils-reuse gate    │
├─────────────────────────────────────────────────────────────┤
│  placement-decision.md — 五问表、问用户、Bulk 范式             │
├─────────────────────────────────────────────────────────────┤
│  Skill（reuse-before-create）— 步骤清单                       │
├─────────────────────────────────────────────────────────────┤
│  Hook（hookMode，默认 off）                                   │
│    off     — Rules 约束 Confirm；不拦 Write（日常推荐）        │
│    confirm — 缺 Read/Verdict 时 deny Write（验收/压测）        │
│    remind  — allow + 提醒                                     │
├─────────────────────────────────────────────────────────────┤
│  gen + search CLI — 索引与 utils-book 同步                    │
└─────────────────────────────────────────────────────────────┘
```

### 7.1 同轮 Confirm 与 transcript（v0.3.18）

产品默认 **`sameTurnAllow: true`**：一条回复里先输出 Bulk 表 + `Verdict（最终）`，再调 Write。

压测中我们遇到一个真实问题：Cursor 的 preToolUse payload **常常没有 assistant 文本**，只有 `transcript_path`。v0.3.18 起 Hook 会从会话 transcript **回读 Confirm** 并 eager 落盘，合规 Agent 不再被误拦 `verdict_not_recorded`。

若 transcript 不可用，可设 `"sameTurnAllow": false` 分两轮，或让用户说「继续」后第二轮 Write。

### 7.2 刻意不做的事

- **不把业务场景判例写进规范** — Agent 会照抄跳过五问；场景放博客/复盘，规范保持范式级
- **不让 Agent Read utils-book 做 Discovery** — 避免 token 爆炸和摘要幻觉
- **不把 Read util 当成门禁完成** — Confirm 必须在聊天里可见

---

## 八、一次冒烟实验教会了我们什么

在「富文本 / 占位符 / 上传」类混合需求上压测，现象很有代表性（抽象后）：

| 现象 | 根因 | 修补 |
| --- | --- | --- |
| 读了 util 仍复制解析逻辑 | Read ≠ Confirm | 强制 Verdict；Hook deny `verdict_not_recorded` |
| 合规 Bulk Confirm 仍被拦 Write | payload 无文本、verdict 落盘太晚 | transcript 回读 + eager record（v0.3.18） |
| 「参考图」vs「图片」reject | 展示层塞进 Q2 | Q2 排除 UI；问用户协议 |
| 9 symbol 零 Confirm 仍 Write | fail-open 漏洞 | v0.3.17 关闭；`maxImportSymbolsPerTurn` 默认 5 |
| 中文 search 0 结果 | 无 `@utils-book` | BACKFILL + regen index |

**Agent 缺的不是「更多文档」，而是「证明链」和「对细小差异的交互协议」。**

---

## 九、验收清单

**给人 / Agent 冒烟：**

1. 明显可复用 util → 书面五问 → **reuse**
2. validate 入参模型不符 → **featureLocal**
3. 无 export、需跨处共享 → **newUtil** + regen
4. 摘要像、实现 IO 不同 → 禁止误 **reuse**
5. 展示层未写明 → **问用户**，禁止静默 fork
6. opt-in `hookMode: confirm`：跳过 Confirm 直接 Write → **deny**

**工程检查：**

```bash
pnpm check:utils-book
pnpm test:hooks .          # 在 agent-utils-reuse 仓库里跑，传入项目根
node node_modules/agent-utils-reuse/bin/cli.mjs verify
```

---

## 十、如果我要在自己的项目里做一套

不必照搬文件布局，可按阶段推进：

| 阶段 | 做什么 |
| --- | --- |
| **1. 最小闭环** | AGENTS + 五问 + Write 前 Verdict |
| **2. 索引** | `gen:utils-book` + `@utils-book` 注释规范 |
| **3. BACKFILL** | 历史 util 补摘要，提升中文 search |
| **4. 反模式 + 问用户** | 展示层/子集/类体积 alone 无效 |
| **5. 门禁** | `init` 装 Rules；验收开 `hookMode: confirm` |
| **6. CI** | `check:utils-book` 防索引腐烂 |

**经验顺序**：先五问证明链，再索引；没有证明链，目录越全 Agent 越会「看了等于会了」。

---

## 十一、结语

读完这套设计，我最大的感受是：**竞争力不只在模型，更在 Agent 工程化的深度**。

KV 索引解决「找得到」；五问解决「证明得了」；问用户解决「别替产品静默分叉」；`gen` + `check` 解决「索引别腐烂」；Rules + 可选 Hook 解决「长会话别忘」。

同样的基座模型，配上 **Discovery → Read 源码 → Confirm → Verdict → Write** 这条管道，复用行为可以天差地别。

如果你也在用 Cursor 写业务代码，不妨从 **一张五问表 + `pnpm gen:utils-book`** 开始——不必等「完美知识库」才上门禁。

**规范面前，复用有据。证明链，需要一点工程直觉。** 希望这篇文章能帮你建立这种直觉。

---

## 十二、开源仓库与快速上手

同一套设计已开源：**[agent-utils-reuse](https://github.com/qianfan-cmd/agent-utils-reuse)**（Agent 工具函数复用编码约束）。

在**业务项目根目录**（含 `package.json`）：

```bash
pnpm add -D github:qianfan-cmd/agent-utils-reuse#main

node node_modules/agent-utils-reuse/bin/cli.mjs init --force

pnpm gen:utils-book
```

- **人类文档**：[README](https://github.com/qianfan-cmd/agent-utils-reuse#readme) · [README.zh-CN](https://github.com/qianfan-cmd/agent-utils-reuse/blob/main/README.zh-CN.md)
- **BACKFILL 提示词**：README 步骤 4 可直接复制给 Agent
- **示例输出**：[examples/minimal/utils-book](https://github.com/qianfan-cmd/agent-utils-reuse/tree/main/examples/minimal/docs/agent-catalog/utils-book)
- **升级门禁**：`pnpm upgrade:utils-reuse`（在**声明了依赖的子包目录**执行，如 monorepo 里的前端 app）

维护者建议给 release 打 semver tag（如 `v0.3.19`），消费者可写 `github:qianfan-cmd/agent-utils-reuse#v0.3.19`，避免一直跟 floating `#main`。

如果这篇文章对你有帮助，欢迎到 GitHub **Star / Issue / PR**——我们在真实 Cursor 压测里迭代 Hook，也欢迎你用业务项目反馈踩坑。

---

## 附录：AskQuestion 示意（展示层差异）

当五问已通过、仅芯片文案未在需求里写明时，Agent 在 Write 前应 structured 地问用户：

```markdown
逻辑可复用 `tagsToPlainText`，但展示层有一处未在需求写明：

- 现有 util 在编辑器芯片上显示：「图片」
- 本需求 UI 稿写的是：「参考图」

请选择：
A) reuse — 接受 util 现状（芯片显示「图片」），业务逻辑不 fork
B) 定制 — 在组件内做展示层包装，或 newUtil 新符号；不修改旧 export

推荐 A（逻辑已对齐，维护成本更低）。请选 A 或 B。
```

用户选 A → **reuse**；选 B → **featureLocal** 或 **newUtil**。选项 A 必须写清**现有行为的事实**，不能写 Agent 的猜测。
