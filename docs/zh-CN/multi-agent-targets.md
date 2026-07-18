# 多 Agent 工具支持（Cursor / Claude Code / Codex）

v0.4.0 起，`agent-utils-reuse` 可在同一业务仓库内按 IDE **并行**安装门禁，默认行为不变（仅 Cursor）。

## CLI 目标选择

| 命令 | 默认 | 可选 flag |
|------|------|-----------|
| `init` | 仅 `.cursor/` | `--claude` / `--codex` / `--all` |
| `update` / `upgrade` | 已安装的 targets（bookrc 无则 cursor） | 同上 |
| `uninstall` | 仅卸 Cursor | 同上 |
| `verify` | cursor | 同上 |

示例：

```bash
agent-utils-reuse init                    # Cursor only（与 v0.3.x 相同）
agent-utils-reuse init --claude --yes     # 仅 Claude Code
agent-utils-reuse init --codex --yes      # 仅 OpenAI Codex
agent-utils-reuse init --all --yes        # 三端同仓
agent-utils-reuse update --claude --yes
agent-utils-reuse uninstall --codex --yes # 保留 Cursor + 共享 AGENTS.md
```

## 各 IDE 安装路径

| IDE | Rules | Hooks 配置 | Skills |
|-----|-------|------------|--------|
| **Cursor** | `.cursor/rules/*.mdc` | `.cursor/hooks.json` | `.cursor/skills/` |
| **Claude Code** | `.claude/rules/*.md`（由 `.mdc` 转换） | `.claude/settings.json` | `.claude/skills/` |
| **Codex** | 主要靠根目录 `AGENTS.md` | `.codex/hooks.json` | `.agents/skills/` |

**共享（装一次）**：`AGENTS.md`、`docs/agent-catalog/`、`.utils-bookrc.json`、`gen` / `search` CLI。

**隔离**：各 IDE 目录下独立的 hooks、rules、session 审计文件（`.utils-gate-*.json`）。

## Hook 行为

- **Cursor**：stdout JSON `{ permission: "deny", agent_message }`（与 v0.3.x 相同）
- **Claude / Codex**：stderr + **exit 2**（及可选 stdout `permissionDecision` JSON）

业务逻辑在 `templates/shared/hooks/`，各 IDE 目录下为薄 wrapper + `_shared/` 副本。

## 配置

`.utils-bookrc.json` 可选记录：

```json
{
  "installedAgentTargets": ["cursor", "claude", "codex"]
}
```

`hookMode`、`utilsDir` 等仍为**一份**配置，三端共用。

## 注意事项

### Claude Code

- 规则正文 SSOT 仍为 `templates/cursor/rules/*.mdc`；`init` 时转换为 `.claude/rules/*.md`。
- 可选生成 `CLAUDE.md` 短指针块（指向 `AGENTS.md` + `.claude/rules/`）。

### OpenAI Codex

- 软约束主要靠 **AGENTS.md**（Codex 原生读取）。
- 项目 `.codex/` 需在 Codex 中 **trust** 后 hooks 才会加载；Rules 仍可通过 AGENTS.md 生效。
- 安装后可在 Codex 内运行 `/hooks` 审查 hook 定义。

### 卸载

- `uninstall --claude` 只移除 Claude 产物；若仍有 Cursor/Codex，`AGENTS.md` 与 catalog **保留**。
- 最后一个 target 卸载时，才剥离 `AGENTS.md`、`.utils-bookrc.json`、依赖与 scripts。

## 验收测试

```bash
pnpm test:hooks
pnpm test:hook-claude
pnpm test:hook-codex
pnpm test:init-multi-target
```
