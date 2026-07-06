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
| `requireDiscoveryForUtilGate` | `false`（`hookMode: confirm` 时为 `true`） | util import Write 须 Discovery |
| `preferCliSearch` | `false`（`confirm` 时为 `true`） | 须 cli 或 grep-index Discovery |
| `strictBatchLimit` | `false`（`confirm` 时为 `true`） | patch >5 import 一律 deny |
| `allowBusinessDiscovery` | `true` | 承认 D1.5 业务反查 |

## confirm 模式下的标准流程

**`hookMode: confirm`** 时默认启用完整门禁流程（Discovery、分批、Read + Verdict）；可用显式 `false` 关闭单项。任务前：`pnpm gen:utils-book` → `agent-utils-reuse status` / `verify-index`。

## hookMode

| 模式 | 拦 Write | hooks.json |
|------|----------|------------|
| **`off`**（默认） | 否 | 空 |
| `confirm` | 是 | 完整审计 |
| `remind` | 否 | 仅提醒 |

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

见 [getting-started.md](getting-started.md)。
