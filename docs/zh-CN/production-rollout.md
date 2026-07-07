# 生产落地与验收

[English](../en/production-rollout.md) | 简体中文 | [配置说明](configuration.md)

在业务项目根（含 `package.json`）按序推进。

## 日常落地

1. `pnpm add -D github:qianfan-cmd/agent-utils-reuse#v0.3.23`（或 npm / `file:` 本地路径）
2. `node node_modules/agent-utils-reuse/bin/cli.mjs init --force`
3. `pnpm gen:utils-book`
4. 为历史 export 补 `@utils-book`（见 [backfill.md](backfill.md)）
5. CI 可选 `pnpm check:utils-book`
6. 定期 `pnpm upgrade:utils-reuse`

默认 **`hookMode: off`**：Rules 要求 Confirm，**不拦** Write。日常开发可先 off，待团队熟悉流程后再开 `confirm`。

## 验收模式

用于验证 Agent **是否真的**在 chat 输出 Confirm（如 ai-web 多 symbol 测试页）。**off 模式下跳过 Confirm 仍能 Write** — 测 compliance 必须用本节的 confirm 配置。

### 1. 启用 compliance 配置

将 [`docs/agent-catalog/.utils-bookrc.compliance.json`](../agent-catalog/.utils-bookrc.compliance.json) 字段**合并**到项目根 `.utils-bookrc.json`（保留你的 `utilsDir`、`remindWritePaths` 等），然后：

```bash
pnpm update:utils-reuse --yes
# 或 node node_modules/agent-utils-reuse/bin/cli.mjs init --force
```

确认 `.cursor/hooks.json` **非空**（含 `sessionStart`、`postToolUse`、`preToolUse`、`afterAgentResponse`）。

### 2. 新会话与前置

1. **新开** Cursor Agent 会话（`sessionStart` 会 `--reset` 审计）
2. 用 **Read 工具**完整读 `AGENTS.md`（**禁** `limit`/`offset`）
3. 题面写明：**「Confirm 文本须在首个 Write 之前出现在 chat」** — exploration（Grep/Read）≠ Confirm

### 3. 压测后验收

在 **agent-utils-reuse 仓库**内：

```bash
pnpm test:hooks /path/to/your-project-root
```

consumer 项目内可选：`node node_modules/agent-utils-reuse/bin/cli.mjs status`、`verify-index`。

deny 后读 `.cursor/.utils-gate-hook-debug.log`，对照 JSON 的 `denyReason`、`needsConfirm`、`missingReads`。

### 4. 7-symbol 测试页期望编排（5+2 分批）

对齐「多 util + 重实现」场景（如 canvas 上传测试页）：

| 轮次 | Confirm（chat，Write 前） | Write |
|------|---------------------------|-------|
| **1** | D1 或 `D1.5: Grep <feature> → sym @ path` + Bulk 表 **≤5** util 行；Local helpers 表（或 `lightGatePaths` 含测试路径时豁免） | `test.vue` 前 5 个 import 对应区块 |
| **2** | **Delta Confirm**：剩余 symbol 行 + `Gate N/A — <纯 UI 区块>` | 剩余 import / 接线 |

`strictBatchLimit: true` 时，单轮 7 import 无完整 Verdict → **`batch_limit_exceeded`**。

卷面模板见 [TEST-RUBRIC-WRITING.zh.md](../maintainer/TEST-RUBRIC-WRITING.zh.md) §8 symbol 分批。

### 5. 常见 deny 与自愈

| denyReason | 含义 | 自愈 |
|------------|------|------|
| `verdict_not_recorded` | Grep/Read 做了，chat 无 Confirm | 同轮先输出 Bulk 表 + `Verdict（最终）`，再 Write |
| `d1_outcome_missing` | session 有 Discovery，chat 无 D1 叙事行 | 补 `D1 "kw": N → [sym @ path]` 或 D1.5 行 |
| `batch_limit_exceeded` | 单轮 >5 import | 拆 5+2 两批 |
| `missing_reads` | 未 Read util 源码 | Read export 后再 Confirm |
| `missing_agents_read` | 未 Read 全量 AGENTS | Read AGENTS.md 全文 |

## Hook 冒烟（维护者 / CI）

```bash
pnpm test:hooks [projectRoot]
pnpm test:hook-discovery [projectRoot]
pnpm test:verdict-substance
```

## 参考

- [configuration.md](configuration.md) — compliance 字段说明
- [placement-decision.md](../agent-catalog/placement-decision.md) §3 — Confirm 格式与重任务 playbook
- [best-practices.md](best-practices.md)
