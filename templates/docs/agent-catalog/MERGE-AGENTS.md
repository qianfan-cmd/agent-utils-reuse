# AGENTS.md（init 自动处理）

`pnpm agent-utils-reuse init` 会在**你执行 init 的项目根**自动处理 `AGENTS.md`：

| 情况 | 行为 |
|------|------|
| 没有 `AGENTS.md` | 创建文件并写入 utils 复用规范 |
| 已有 `AGENTS.md` | 在文末追加规范（用 HTML 注释标记包裹，避免重复插入） |
| 再次 `init` | 若标记块已存在则跳过；`init --force` 可刷新片段内容 |

Monorepo 请在**放 `src/utils` 的子包根**执行 `init`（例如 `frontend/`），`AGENTS.md` 会写在同一目录。

## 常见位置

| 场景 | `AGENTS.md` 位置 |
|------|------------------|
| 单包前端/Node 项目 | 仓库根目录 `AGENTS.md` |
| Monorepo 子包 | 子包根目录（如 `frontend/AGENTS.md`） |

可在 `.utils-bookrc.json` 中改 `agentsFile`（默认 `AGENTS.md`）。

## 手动合并（极少需要）

参考同目录 [`AGENTS.utils-reuse.snippet.md`](./AGENTS.utils-reuse.snippet.md)（`init` 时生成），复制标记之间的正文粘贴到 `AGENTS.md`。

## 下一步

```bash
pnpm gen:utils-book
```

可选 CI：`pnpm check:utils-book`（需先把 `utils-book` 纳入 git 跟踪并 commit）。
