# Pre-Write utils checklist (mandatory)

**详规 SSOT**：**[`.claude/rules/utils-reuse-gate.md`](utils-reuse-gate.md)** — 完整 Discovery、分层 gate、Bulk/Delta、Hook deny 列表。

## Write 前硬停（6 条）

1. **分层**：uiOnly / delta / newCall / full — 见详规与 `placement-decision.md` §1.6.1
2. **Confirm**：分项或 bulk 表 + **`Verdict（最终）`** — **chat 中、首个 Write 之前**（同轮 OK）
3. **Read util 源码 export** — 禁仅凭 index 或 feature 调用处 Confirm
4. **Discovery**（触发时）：D1/D2 **固定一行格式**
5. **Q4**：`reject <sibling> (<reason>)` 或 `no sibling` — 禁空泛通过
6. **`hookMode: confirm`**（opt-in）硬拦 — 默认 **`off`** 靠 Rules

7. **重任务**：patch 新增 **≥3** `@/utils` import 或 **>5** symbol → Bulk 表 + 分批（见 `placement-decision.md` §3.1）；**Grep/Read 后无 Confirm 文本 = 违规**（同轮须 Confirm 在首个 Write 之前）

违规时先读 `agent_message` / `.cursor/.utils-gate-hook-debug.log`。
