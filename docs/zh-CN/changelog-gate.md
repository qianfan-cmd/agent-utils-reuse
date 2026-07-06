# 门禁与包版本史

[English](../en/changelog-gate.md) | 简体中文 | [README](../../README.zh-CN.md)

v0.3.19 起从 README 迁出。升级后建议：

```bash
pnpm upgrade:utils-reuse
pnpm test:hooks
```

## v0.3.21

**门禁流程补强**

- **`hookMode: confirm`** 默认启用完整流程（Discovery/分批/D1.5）；bookrc 可显式 `false` 关闭单项
- **`status` Index health**；`verify-index` 命令
- **D1.5 业务反查**
- 新增 deny：`missing_discovery_for_util`、`prefer_cli_search`（仅 confirm 模式）

## v0.3.20

**`uninstall` 子命令** — 一键移除门禁文件、`docs/agent-catalog`、生成的 index/book、合并的 `AGENTS.md` 块，以及 `package.json` 中的依赖与脚本。不删除 `src/utils` JSDoc。可用 `--dry-run` 预览。

```bash
agent-utils-reuse uninstall --yes
pnpm install
```

## v0.3.17 → v0.3.18

**同轮 Confirm 证据通道（P0）**

- `transcript_path` 回读 assistant Confirm
- preToolUse eager `recordVerdict`；`verdictSource` 审计
- 大 Write 解析降级（>16KB 跳过巨型 tool_input）
- Symbol 归一化：`UrlUtils.method` → `UrlUtils`
- Discovery `grep_payload_path` debug

transcript 不可用：`sameTurnAllow: false` 或分两轮。

## v0.3.16 → v0.3.17

**关闭 fail-open（P0）**

- 删除 `parse_fallback allow`
- `sameTurnBypass` 须有 Confirm 证据
- `maxImportSymbolsPerTurn` 默认 5
- `addsHelper` 与 `sameTurnAllow` 解耦

## v0.3.15 → v0.3.16

- `parseHookJsonSafe` 部分解析
- 同轮 Write 修复（v0.3.17 收紧 parse_fallback）

## v0.3.14 → v0.3.15

- 默认 `hookMode: off`

## v0.3.13 → v0.3.14

- 默认 `sameTurnAllow: true`；单轮六步

## 更早版本

详见 [英文 changelog](../en/changelog-gate.md)（v0.3.12 至 v0.1.8 完整列表）。

## 升级命令

| 命令 | 作用 |
|------|------|
| `pnpm upgrade:utils-reuse` | 包 + 门禁 |
| `pnpm update:utils-reuse` | 仅门禁 |
| `update --accept-upstream` | 采用上游文档 |

验收：`agent-utils-reuse verify`；`pnpm test:hooks .`
