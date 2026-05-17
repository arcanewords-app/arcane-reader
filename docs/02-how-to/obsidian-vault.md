---
type: how-to
status: active
domain: meta
stale: false
created: 2026-05-16
updated: 2026-05-16
canonical: .cursor/skills/local-dev/SKILL.md
---

# Obsidian vault workflow

## Open the vault

1. Obsidian → **Open folder as vault**
2. Select: `arcane-reader/docs` (this folder only, not the repo root)

Wikilinks like `[[ROADMAP]]` resolve to files in this folder.

## Start pages

| Note                  | Use                                                     |
| --------------------- | ------------------------------------------------------- |
| [[Home]]              | Main index                                              |
| [[ROADMAP]]           | Priorities and phases                                   |
| [[project-status]]    | What is shipped vs in progress                          |
| [[05-plans/]]         | Active RFCs (filter by `status: active` in frontmatter) |
| [[_canonical/rules/]] | Agent rules (mirror of `.cursor/rules/`)                |

## Graph and backlinks

- Use **Graph view** to see plan clusters (`05-plans/`).
- **Backlinks** on `[[project-status]]` show notes that reference the snapshot.
- Prefer wikilinks over hard-coded paths so renames stay consistent.

## When to update what

| Event                   | Update                                                                      |
| ----------------------- | --------------------------------------------------------------------------- |
| Feature shipped         | [[project-status]]; archive related [[05-plans/]] note (`status: archived`) |
| Priority shift          | [[ROADMAP]]                                                                 |
| New convention or route | `.cursor/rules/*.mdc` first, then `_canonical/rules/` copy if tracked       |
| Explainer for humans    | `03-explanation/` — derive from code, not `archive/`                        |

## Search from terminal (optional)

From repo root:

```bash
rg -i "your topic" docs/05-plans docs/03-explanation
rg "^status: active" docs/05-plans -g "*.md"
```

Agents: see [[../AGENTS.md]] and `.cursor/skills/local-dev/SKILL.md`.

## AI in Cursor

Attach for large tasks:

```
@docs/ROADMAP.md
@docs/project-status.md
```

Vault notes are **not** auto-loaded; attach explicitly or edit under `docs/` so `local-dev.mdc` applies.

### MCP for Cursor agents

1. Enable **Local REST API & MCP Server** (community plugin; bundled in this vault).
2. Copy API key from **Settings → Local REST API**.
3. Copy repo [`.cursor/mcp.json.example`](../../.cursor/mcp.json.example) to `~/.cursor/mcp.json` and replace `YOUR_API_KEY`.
4. Keep Obsidian running with this vault open (`docs/` folder).
5. In Cursor: **Settings → MCP** — server `obsidian` should connect (HTTP `http://127.0.0.1:27123/mcp/` on Windows is simplest).

Agents use `.cursor/skills/obsidian-mcp/SKILL.md` for vault tools. Rotate the API key if it was ever committed or shared. Plugin secrets file `data.json` is gitignored.

See also: [[run-locally]], [[trello-mcp]], [[_meta/conventions]]
