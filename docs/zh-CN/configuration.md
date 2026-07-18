# 配置说明

[English](../en/configuration.md) | 简体中文 | [README](../../README.zh-CN.md)

项目根目录 `.utils-bookrc.json`，由 `init` 创建/合并。

## 字段

| 字段 | 默认 | 说明 |
|------|------|------|
| `utilsDir` | `src/utils` | 扫描目录 |
| `catalogDir` | `docs/agent-catalog` | Agent 目录根 |
| `utilsBookDir` | `docs/agent-catalog/utils-book` | 生成的 human book |
| `utilsIndexFile` | `docs/agent-catalog/utils-index.json` | KV 索引（Agent D1） |
| `skillsDir` | `.cursor/skills` | Skills 索引 |
| `agentsFile` | `AGENTS.md` | init 合并 |
| `jsdocTag` | `@utils-book` | 摘要标签 |
| `hookMode` | `off` | `off` \| `confirm` \| `remind` |
| `sameTurnAllow` | `true` | 同轮 Confirm + Write |
| `maxImportSymbolsPerTurn` | `5` | 超限硬拦 |
| `agentsReadMode` | `tool` | `session` 会话视为已读 AGENTS |
| `lightGatePaths` | `[]` | 仅审计 import |
| `searchSynonyms` | `{}` | 同义词并入 searchText |
| `crossFileSiblingGroups` | `[]` | 跨文件 sibling |
| `utilsImportAliases` | `["@/utils"]` | import 前缀 |
| `remindWritePaths` | `src/feature` 等 | Write 扫描路径 |
| `sourceGlobs` | `src/**/*.{vue,ts,tsx}` | code-before-edit |
| `projectAgentCoreRule` | `null` | 注入自有 core rule |
| `installedAgentTargets` | `["cursor"]`（init 写入） | 已安装的 IDE：`cursor` / `claude` / `codex` |
| `requireDiscoveryForUtilGate` | `false`* | util import Write 须 Discovery |
| `preferCliSearch` | `false`* | 须 cli 或 grep-index Discovery |
| `strictBatchLimit` | `false`* | patch >5 import 一律 deny |
| `allowBusinessDiscovery` | `false`* | 承认 D1.5 业务反查 |

\* **`hookMode: confirm`** 时默认 **`true`**，可在 bookrc 显式设 `false` 关闭。

## 多 Agent 目标（v0.4.0+）

CLI 在 `init` / `update` / `uninstall` / `verify` 上支持：

- 默认：仅 **Cursor**
- `--claude`：Claude Code（`.claude/settings.json` + `.claude/rules/*.md`）
- `--codex`：OpenAI Codex（`.codex/hooks.json` + `.agents/skills/`）
- `--all`：三端同仓

`hookMode`、Discovery、Confirm 规则**一份** bookrc，三端共用；各 IDE 目录下 hooks/审计文件**隔离**。

详见 [multi-agent-targets.md](multi-agent-targets.md)。

## hookMode

| 模式 | 拦 Write | hooks 配置 |
|------|----------|------------|
| **`off`**（默认） | 否 | Cursor: 空 hooks.json；Claude/Codex: 无门禁 hooks |
| `confirm` | 是 | 各 IDE 对应 hooks 配置 |
| `remind` | 否 | 仅 PreToolUse 提醒 |

Rules 始终要求聊天 Confirm + `Verdict（最终）`。

```json
{ "hookMode": "off" }
```

验收：

```json
{ "hookMode": "confirm", "sameTurnAllow": true }
```

严格分轮：

```json
{ "hookMode": "confirm", "sameTurnAllow": false }
```

## 验收 / Compliance 配置模板

默认 **`hookMode: off`** 仅 Rules 软约束，**无法**验证 Agent 是否在 chat 输出 Confirm。压测或 consumer 验收时，合并 [`docs/agent-catalog/.utils-bookrc.compliance.json`](../agent-catalog/.utils-bookrc.compliance.json) 中的字段到项目根 `.utils-bookrc.json`，然后 `pnpm update:utils-reuse --yes`（或 `init --force`）确保 hooks 注册。

| 字段 | compliance 值 | 用途 |
|------|----------------|------|
| `hookMode` | `confirm` | 缺 Verdict / D1 / Read 时硬拦 Write |
| `strictBatchLimit` | `true` | 单轮 patch >5 个 `@/utils` import → `batch_limit_exceeded` |
| `agentsReadMode` | `tool` | 须 session 内 Read 全量 AGENTS.md（禁 limit） |
| `allowBusinessDiscovery` | `true` | D1.5 业务 Grep 计入 Discovery；chat 仍须写 `D1.5: Grep … → sym @ path` |
| `lightGatePaths` | 如 `src/views/test` | 测试页弱化 Local helpers 强制，**不弱化** util Confirm |

完整验收步骤见 [production-rollout.md §验收模式](production-rollout.md#验收模式)。

## 已有 core rule

```json
"projectAgentCoreRule": ".cursor/rules/my-agent-core.mdc"
```

`init --force` 注入 utils 块；`project-agent-gate.mdc` 仍保留。

## 已知限制

- Verdict 检测为启发式
- 仅 thinking 的 Confirm Hook 不可见
- Shell Write 绕过 Hook
- v0.3.18：`transcript_path` 支持同轮 Confirm

## 命令

| 命令 | 作用 |
|------|------|
| `pnpm upgrade:utils-reuse` | 升级包 + 门禁 |
| `pnpm update:utils-reuse` | 仅同步门禁 |
| `pnpm gen:utils-book` | 重新生成 index + book |
| `pnpm check:utils-book` | CI：gen + git diff |
| `agent-utils-reuse uninstall --yes` | 卸载门禁与 catalog（见 [README 卸载](../../README.zh-CN.md#卸载门禁)） |

详见 [getting-started.md](getting-started.md)（含升级参数与卸载）。
