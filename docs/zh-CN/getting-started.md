# 快速上手

[English](../en/getting-started.md) | 简体中文 | [README](../../README.zh-CN.md)

[README 快速开始](../../README.zh-CN.md#快速开始) 的扩展说明。

## 环境要求

- Node.js 18+
- 在 **Cursor** 中打开**项目根目录**（含 `package.json`，init 后有 `AGENTS.md`）
- `pnpm` 或 `npm`

## 安装

```bash
pnpm add -D github:qianfan-cmd/agent-utils-reuse
# 或: pnpm add -D agent-utils-reuse
# 本地: pnpm add -D file:../agent-utils-reuse
```

## 初始化

```bash
node node_modules/agent-utils-reuse/bin/cli.mjs init --force
```

| 参数 | 作用 |
|------|------|
| `--force` | 刷新 `AGENTS.md` 片段与 project-core 注入 |
| `--with-examples` | 复制示例 array utils 到 `src/utils` |
| `--accept-upstream` | init 时采用包内文档（少用） |

Windows 若命令找不到：

```bash
node node_modules/agent-utils-reuse/bin/cli.mjs init --force
```

## 生成索引

`init` **不会**自动 `gen`。`utilsDir` 下有 export 后：

```bash
pnpm gen:utils-book
```

自检：

```bash
node node_modules/agent-utils-reuse/bin/cli.mjs search "数组 排序" --limit 8
```

## 补全已有 utils 注释

见 [backfill-jsdoc.md](backfill-jsdoc.md) 或 [README 步骤 4](../../README.zh-CN.md#4-为已有-export-补-utils-book推荐)。

## 升级

```bash
pnpm upgrade:utils-reuse   # 推荐：包 + 门禁
pnpm update:utils-reuse    # 仅同步门禁
```

诊断：`node node_modules/agent-utils-reuse/bin/cli.mjs status` / `verify`

版本史：[changelog-gate.md](changelog-gate.md)

## 文档合并冲突

可合并文档（`placement-decision.md` 等）冲突时保留本地文件，上游副本为 `*.utils-reuse-upstream`。手动合并或 `update --accept-upstream`。

## 验收

- `agent-utils-reuse verify` → OK
- `pnpm test:hooks .`
- `hookMode: confirm`：Read util → 聊天 Confirm → Write → allow

## Windows 测 Hook

用 PowerShell，勿用 Git Bash 管道：

```powershell
node ../agent-utils-reuse/scripts/test-hook-confirm.mjs .
```

## 下一步

- [配置](configuration.md)
- [最佳实践](best-practices.md)
- [补全 JSDoc](backfill-jsdoc.md)
