# agent-utils-reuse

[English](README.md) | 简体中文

**防止 AI 编码 Agent 静默 fork 你的公共工具函数。** 本包为前端项目提供 **Confirm 门禁**（五问 + 聊天中的 `Verdict（最终）` 再 Write）、**KV 工具检索**（`utils-index.json`）以及 **Cursor Rules/Hook**。

## 为什么需要

| 痛点 | 本包做法 |
|------|----------|
| Agent 读过 `src/utils` 仍在业务文件里重写同类逻辑 | Write 前强制 **Confirm** + **Verdict** |
| 选中 util 后不做可复用证明 | **Read util 源码** ≠ 门禁完成 — 须在聊天输出 Confirm |
| `search` 用业务中文词搜不到 | 索引依赖 **`@utils-book` JSDoc** — 见下方步骤 4 补注释 |

## 你会得到什么

| 组件 | 作用 |
|------|------|
| **utils-index.json** + `search` CLI | Agent Discovery D1（关键词检索） |
| **utils-book/** | 人类可读目录（Agent **禁止**用来 Shortlist） |
| **Cursor Rules** | `utils-reuse-gate`、`pre-write-utils-checklist` 等 — `init` 自动安装 |
| **Hook**（可选） | `hookMode: confirm` 时无 Confirm 证据则硬拦 Write |
| **AGENTS.md** | 自动合并 utils 复用节 |

设计说明：[docs/design/utils-reuse-blog.md](docs/design/utils-reuse-blog.md)

## 快速开始

在**项目根目录**（含 `package.json`）执行。

### 1. 安装

```bash
pnpm add -D github:qianfan-cmd/agent-utils-reuse
# 或: pnpm add -D agent-utils-reuse
```

Windows / 本地路径：`pnpm add -D file:../agent-utils-reuse`

### 2. 初始化门禁

```bash
node node_modules/agent-utils-reuse/bin/cli.mjs init --force
```

会复制 Rules、hooks、`.utils-bookrc.json` 并合并 `AGENTS.md`。**在项目根打开 Cursor。**

**测 compliance（验收 Agent 是否输出 Confirm）**：默认 `hookMode: off` 仅 Rules 软约束，跳过 Confirm 仍能 Write。压测请合并 [`docs/agent-catalog/.utils-bookrc.compliance.json`](docs/agent-catalog/.utils-bookrc.compliance.json) 字段并 `pnpm update:utils-reuse --yes`；步骤见 [production-rollout §验收模式](docs/zh-CN/production-rollout.md#验收模式)。

### 3. 生成 utils 索引

```bash
pnpm gen:utils-book
```

需要 `utilsDir`（默认 `src/utils`）下有 `.ts` 文件。试用示例：

```bash
node node_modules/agent-utils-reuse/bin/cli.mjs init --with-examples
pnpm gen:utils-book
```

### 4. 为已有 export 补 `@utils-book`（推荐）

**何时需要：** `gen` 后大量符号 summary 为 `(无简介 — Confirm 前须 Read 实现)`；或 `search` 用团队常用中文词 0 结果。

**禁止手改 `utils-index.json`。** 在源码补 JSDoc 后重新 `gen`。

在新 Cursor Agent 会话中粘贴（将 `src/utils` 换成你的 `utilsDir`）：

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

然后：

```bash
pnpm gen:utils-book
node node_modules/agent-utils-reuse/bin/cli.mjs search "剪贴板 复制" --limit 8
```

完整说明：[docs/zh-CN/backfill-jsdoc.md](docs/zh-CN/backfill-jsdoc.md)

### 5. 日常 Agent 工作流

默认单轮六步（v0.3.14+）：**分析 → Discovery → Read util 源码 → Confirm + Verdict → 同轮 Write**。

```bash
node node_modules/agent-utils-reuse/bin/cli.mjs search "数组 排序" --limit 8
```

### 6. 后续升级

```bash
pnpm upgrade:utils-reuse
```

## hookMode 怎么选

| 模式 | 拦 Write | 适用 |
|------|----------|------|
| **`off`**（默认） | 否 | 日常开发 — Rules 已要求聊天 Confirm |
| `confirm` | 是 | 验收卷 / 严格审计 |
| `remind` | 否 | 仅提醒 |

```json
{ "hookMode": "off" }
```

详见：[docs/zh-CN/configuration.md](docs/zh-CN/configuration.md#hookmode)

## 最佳实践

- **默认 `hookMode: off`** — Rules 已要求 Write 前有 Confirm + `Verdict（最终）`。
- **Read util 源码 export** — 不能只看 feature 调用处。
- **Bulk 表**（≥3 symbol）：Symbol 列写 **import 名**（如 `UrlUtils`，不是 `UrlUtils.method`）。
- **>5 个 reuse symbol** 分批（每批 ≤5 + 一张表 + 部分 Write）。
- **验收**：`{ "hookMode": "confirm", "sameTurnAllow": true }` 后 `pnpm test:hooks .`

更多：[docs/zh-CN/best-practices.md](docs/zh-CN/best-practices.md)

## `init` 安装内容

| 路径 | 用途 |
|------|------|
| `AGENTS.md` | 合并 utils 复用节 |
| `.utils-bookrc.json` | 扫描路径、hook 模式 |
| `docs/agent-catalog/` | **Agent 运行时文档**（非人类快速上手） |
| `docs/agent-catalog/utils-index.json` | `gen` 后生成的 KV 索引 |
| `.cursor/rules/*.mdc` | Confirm 门禁 Rules |
| `.cursor/hooks/` | Hook 脚本（仅 `confirm` / `remind`） |

## 文档地图

| 受众 | 从这里开始 |
|------|------------|
| **人类** | 本文 · [README.md](README.md) |
| **深读** | [docs/zh-CN/](docs/zh-CN/getting-started.md) · [docs/en/](docs/en/getting-started.md) |
| **Cursor Agent** | 业务项目内 `docs/agent-catalog/placement-decision.md` |
| **维护者** | [docs/maintainer/TEST-RUBRIC-WRITING.zh.md](docs/maintainer/TEST-RUBRIC-WRITING.zh.md) |
| **版本史** | [docs/zh-CN/changelog-gate.md](docs/zh-CN/changelog-gate.md) |

## 常用命令

| 命令 | 作用 |
|------|------|
| `pnpm upgrade:utils-reuse` | 升级包 + 同步门禁 |
| `pnpm update:utils-reuse` | 仅同步门禁（不 `pnpm add`） |
| `pnpm gen:utils-book` | 重新生成索引与 utils-book |
| `agent-utils-reuse search "<关键词>"` | KV 检索（Agent D1） |
| `agent-utils-reuse uninstall --yes` | 一键卸载门禁（见下） |
| `pnpm test:hooks [projectRoot]` | Hook 冒烟测试 |

## 卸载门禁

**需 v0.3.20+**（含 `uninstall` 子命令）。一键移除：

| 会删除 | 不删除 |
|--------|--------|
| `.cursor/rules`、Hook 脚本、`reuse-before-create` skill | `src/utils` 上的 `@utils-book` JSDoc |
| `.utils-bookrc.json`、`.cursor/` 下 session 审计文件 | 你在 `catalogDir` 下自行添加的非门禁文件 |
| `docs/agent-catalog/`：可合并文档、`utils-index.json`、`utils-book/`、`skills.md`、snippet | |
| `AGENTS.md` 门禁标记块（及可选 `projectAgentCoreRule`） | |
| `.cursor/hooks.json` 中门禁条目；`package.json` 依赖与门禁 scripts | |

若 `catalogDir` 内仅剩门禁产物，会一并删除该目录（v0.3.23+）。非门禁文件会在 **Warnings** 中列出并保留。

**一键删除**（`--yes` 跳过确认提示，直接执行）：

```bash
pnpm exec agent-utils-reuse uninstall --yes
```

uninstall 会**同时修改** `package.json`：移除 `devDependencies` 里的 `agent-utils-reuse`，以及 `gen:utils-book`、`upgrade:utils-reuse` 等门禁 scripts（见上表「会删除」）。**业务源码不会动**。

建议再跑 `pnpm install`，让 `pnpm-lock.yaml` 和 `node_modules` 与改过的 `package.json` 一致（从 `node_modules` 里清掉该包）。不跑也能用项目，只是 lockfile / `node_modules` 里可能还留着旧依赖，直到你下次 install。

可选：先预览计划删除项（**不写盘**）：

```bash
pnpm exec agent-utils-reuse uninstall --dry-run
```

Git Bash / Windows 若命令找不到：

```bash
node node_modules/agent-utils-reuse/bin/cli.mjs uninstall --yes
```

（同样可选 `pnpm install` 同步 lockfile。）

## 开发本仓库

```bash
pnpm test:hooks
pnpm test:update
pnpm test:uninstall
```

示例输出：[examples/minimal/docs/agent-catalog/utils-book/](examples/minimal/docs/agent-catalog/utils-book/)

## License

MIT
