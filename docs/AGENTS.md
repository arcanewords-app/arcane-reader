# Documentation vault — nested agent context

Applies when editing files under `docs/`. Global rules: [`.cursor/rules/local-dev.mdc`](../.cursor/rules/local-dev.mdc), [`.cursor/rules/obsidian-mcp.mdc`](../.cursor/rules/obsidian-mcp.mdc).

| Task                                       | Read                                                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Vault read/write/search (Obsidian running) | [`.cursor/skills/obsidian-mcp/SKILL.md`](../.cursor/skills/obsidian-mcp/SKILL.md) — MCP tools; vault-relative paths (no `docs/` prefix) |
| Terminal search, npm, fallback if MCP down | [`.cursor/skills/local-dev/SKILL.md`](../.cursor/skills/local-dev/SKILL.md)                                                             |

**Prerequisite for MCP:** Obsidian Desktop open with this folder as vault; Cursor MCP server `obsidian` connected (see [[02-how-to/obsidian-vault#MCP for Cursor agents]]).

## Vault root

This folder (`docs/`) is the **Obsidian vault root**. Open it directly in Obsidian (not the parent repo folder). Wikilinks have no `docs/` prefix.

## Session anchors

- [[ROADMAP]] — priorities and phases
- [[project-status]] — current snapshot for AI sessions

## Structure

| Path                  | Purpose                    |
| --------------------- | -------------------------- |
| [[Home]]              | Vault index                |
| [[05-plans/]]         | Active product plans       |
| [[04-decisions/]]     | ADRs                       |
| [[_canonical/rules/]] | Mirror of `.cursor/rules/` |
| [[_meta/conventions]] | Vault + agent conventions  |
| [[archive/]]          | Legacy (may be stale)      |

## Rules

- **Routes SSOT:** [[_canonical/rules/routing]] — do not copy full route tables into vault notes.
- **Code wins** over `archive/` and old plans; verify against `src/` before trusting legacy docs.
- **Plans:** use frontmatter `type: plan`, `status: active | archived`, update [[project-status]] when completing work.

## Human how-to

- [[02-how-to/obsidian-vault]] — Obsidian setup and graph tips
- [[02-how-to/run-locally]] — npm dev commands
