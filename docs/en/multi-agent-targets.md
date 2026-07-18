# Multi-agent targets (Cursor / Claude Code / Codex)

From v0.4.0, `agent-utils-reuse` can install the reuse gate **in parallel** per IDE in the same repo. Default behavior is unchanged (Cursor only).

## CLI target flags

| Command | Default | Optional flags |
|---------|---------|----------------|
| `init` | `.cursor/` only | `--claude` / `--codex` / `--all` |
| `update` / `upgrade` | Installed targets (or cursor if unset in bookrc) | Same |
| `uninstall` | Cursor only | Same |
| `verify` | cursor | Same |

Examples:

```bash
agent-utils-reuse init                    # Cursor only (same as v0.3.x)
agent-utils-reuse init --claude --yes     # Claude Code only
agent-utils-reuse init --codex --yes      # OpenAI Codex only
agent-utils-reuse init --all --yes        # all three
agent-utils-reuse update --claude --yes
agent-utils-reuse uninstall --codex --yes # keeps Cursor + shared AGENTS.md
```

## Install paths per IDE

| IDE | Rules | Hooks config | Skills |
|-----|-------|--------------|--------|
| **Cursor** | `.cursor/rules/*.mdc` | `.cursor/hooks.json` | `.cursor/skills/` |
| **Claude Code** | `.claude/rules/*.md` (converted from `.mdc`) | `.claude/settings.json` | `.claude/skills/` |
| **Codex** | Mostly root `AGENTS.md` | `.codex/hooks.json` | `.agents/skills/` |

**Shared (once per project)**: `AGENTS.md`, `docs/agent-catalog/`, `.utils-bookrc.json`, `gen` / `search` CLI.

**Isolated**: hooks, rules, and session audit files (`.utils-gate-*.json`) under each IDE directory.

## Hook behavior

- **Cursor**: stdout JSON `{ permission: "deny", agent_message }` (unchanged from v0.3.x)
- **Claude / Codex**: stderr + **exit 2** (optional stdout `permissionDecision` JSON)

Business logic lives in `templates/shared/hooks/`; each IDE directory has thin wrappers + a copied `_shared/` tree.

## Configuration

Optional bookrc field:

```json
{
  "installedAgentTargets": ["cursor", "claude", "codex"]
}
```

`hookMode`, Discovery, and Confirm rules are **one** bookrc shared by all targets; hooks and audit files are per IDE.

See also [configuration.md](configuration.md#multi-agent-targets-v040).

## Trust & rollout notes

- **Claude Code**: Open the repo root; rules load from `.claude/rules/`; hooks merge into `.claude/settings.json`.
- **Codex**: Project `.codex/` must be **trusted** for hooks to run; rules still apply via `AGENTS.md`. Review `/hooks` after `init --codex`.
- **Cursor**: Unchanged from v0.3.x when no extra flags are passed.

## Uninstall

`uninstall --claude` removes only Claude artifacts. Shared `AGENTS.md` and catalog docs are stripped only when the **last** installed target is removed.
